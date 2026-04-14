// index.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();

// Parse standard application/json
app.use(bodyParser.json());

// Parse Dotdigital's text/json
app.use(bodyParser.json({ type: 'text/json' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Import API services
const { verifyProspectConnection } = require('./services/prospect');
const { verifyDotdigitalConnection } = require('./services/dotdigital');

// Endpoint: Test API Connections
app.get('/test-connections', async (req, res) => {
  try {
      // Test Dotdigital
      const dotdigitalTest = await verifyDotdigitalConnection();
      
      // Test Prospect
      const prospectTest = await verifyProspectConnection();

      res.json({
          status: 'success',
          message: 'Successfully connected to both APIs Data Sources',
          connections: {
              prospect: 'Connected',
              dotdigital: 'Connected'
          }
      });
  } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
  }
});

// Import Webhook Handlers
const { handleProspectWebhook } = require('./handlers/prospectWebhook');
const { handleDotdigitalWebhook } = require('./handlers/dotdigitalWebhook');
const { handleSuppressionSync } = require('./handlers/suppressionSync');
const { handleBulkSync } = require('./handlers/bulkSync');

// Webhook Endpoints
app.post('/webhook/prospect', handleProspectWebhook);
app.post('/webhook/dotdigital', handleDotdigitalWebhook);

// Scheduled/Manual Sync Endpoints
app.get('/sync/suppressed', handleSuppressionSync);
app.get('/sync/bulk-prospect', handleBulkSync);

// Automated Sync Dashboard
app.get('/sync/dashboard', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Prospect -> Dotdigital Bulk Sync</title>
            <style>
                body { font-family: sans-serif; padding: 40px; background: #f4f7f6; }
                .card { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 600px; margin: auto; }
                h1 { color: #333; }
                .input-group { margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
                .progress-bg { background: #eee; border-radius: 10px; height: 25px; margin: 20px 0; overflow: hidden; position: relative; }
                .progress-bar { background: #4caf50; height: 100%; width: 0%; transition: width 0.3s; }
                button { background: #2196f3; color: white; border: none; padding: 12px 25px; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold; }
                button:hover { background: #1976d2; }
                button:disabled { background: #ccc; cursor: not-allowed; }
                #log { background: #222; color: #00ff00; padding: 15px; border-radius: 4px; height: 250px; overflow-y: auto; font-family: 'Consolas', monospace; font-size: 13px; margin-top: 20px; border: 1px solid #444; }
                .status-ready { color: #2196f3; font-weight: bold; }
                .status-running { color: #f57c00; font-weight: bold; }
                .status-complete { color: #4caf50; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Bulk Sync Dashboard</h1>
                <p>Automate your 30,000 record sync in safe batches to avoid timeouts.</p>
                
                <div class="input-group">
                    <div>
                        <label>Start from (Skip):</label><br>
                        <input type="number" id="skip" value="0" style="padding: 8px; width: 100px;">
                    </div>
                    <div>
                        <label>Batch Size (Top):</label><br>
                        <input type="number" id="top" value="25" style="padding: 8px; width: 80px;">
                    </div>
                </div>

                <div class="progress-bg">
                    <div id="progressBar" class="progress-bar"></div>
                </div>
                
                <button id="startBtn" onclick="startSync()">START AUTOMATED SYNC</button>
                <button id="stopBtn" onclick="stopSync()" style="background:#f44336; display:none;">PAUSE</button>

                <div id="status" class="status-ready" style="margin-top:20px;">READY</div>
                <div id="log"></div>
            </div>

            <script>
                let isRunning = false;
                let totalSynced = 0;

                function log(msg, type = '') {
                    const logEl = document.getElementById('log');
                    const time = new Date().toLocaleTimeString();
                    const line = document.createElement('div');
                    line.innerHTML = \`[\${time}] \${msg}\`;
                    if (type === 'error') line.style.color = '#ff5252';
                    if (type === 'success') line.style.color = '#69f0ae';
                    logEl.appendChild(line);
                    logEl.scrollTop = logEl.scrollHeight;
                }

                function stopSync() { 
                    isRunning = false; 
                    log('Pausing sync... will stop after current batch.');
                }

                async function startSync() {
                    let skip = parseInt(document.getElementById('skip').value);
                    const top = parseInt(document.getElementById('top').value);
                    const btn = document.getElementById('startBtn');
                    const stopBtn = document.getElementById('stopBtn');
                    const statusEl = document.getElementById('status');
                    
                    isRunning = true;
                    btn.disabled = true;
                    stopBtn.style.display = 'inline-block';
                    statusEl.innerText = 'SYNCING...';
                    statusEl.className = 'status-running';
                    log('🚀 Automated sync started.');

                    while (isRunning) {
                        try {
                            const url = \`/sync/bulk-prospect?skip=\${skip}&top=\${top}\`;
                            
                            const response = await fetch(url);
                            const data = await response.json();

                            if (data.status === 'success') {
                                totalSynced += data.contactsProcessed;
                                log(\`✅ Synced records \${data.batchRange}. Batch Sync Result: \${data.successfullySynced} Success, \${data.failed} Fail.\`, 'success');
                                
                                if (data.nextBatchUrl === 'All active contacts processed.' || data.contactsProcessed === 0) {
                                    log('🏆 ALL CONTACTS SYNCED SUCCESSFULLY!');
                                    statusEl.innerText = 'COMPLETE';
                                    statusEl.className = 'status-complete';
                                    isRunning = false;
                                    break;
                                }
                                
                                skip += top;
                                document.getElementById('skip').value = skip;
                                // Small cooldown for the browser
                                await new Promise(r => setTimeout(r, 500));
                            } else {
                                throw new Error(data.message || 'Unknown error');
                            }
                        } catch (err) {
                            log(\`❌ Error at skip \${skip}: \${err.message}\`, 'error');
                            log('Retrying in 5 seconds...', 'error');
                            await new Promise(r => setTimeout(r, 5000));
                        }
                        
                        if (!isRunning) {
                            statusEl.innerText = 'PAUSED';
                            statusEl.className = 'status-ready';
                            break;
                        }
                    }

                    btn.disabled = false;
                    stopBtn.style.display = 'none';
                }
            </script>
        </body>
        </html>
    `);
});

module.exports = app;

// Only listen locally if run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
  });
}
