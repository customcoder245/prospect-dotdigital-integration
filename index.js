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
      const dotdigitalTest = await verifyDotdigitalConnection();
      const prospectTest = await verifyProspectConnection();
      res.json({
          status: 'success',
          message: 'Successfully connected to both APIs Data Sources',
          connections: { prospect: 'Connected', dotdigital: 'Connected' }
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
const { handleSalesWebhook } = require('./handlers/salesSync');

// Webhook Endpoints
app.post('/webhook/prospect', handleProspectWebhook);
app.post('/webhook/dotdigital', handleDotdigitalWebhook);
app.post('/webhook/sales', handleSalesWebhook);

// Scheduled/Manual Sync Endpoints
app.get('/sync/suppressed', handleSuppressionSync);
app.get('/sync/bulk-prospect', handleBulkSync);

// ── FINAL TEST: Manual Trigger ──────────────────────────────────────────────
app.get('/test/sales-final', async (req, res) => {
    const { handleSalesWebhook } = require('./handlers/salesSync');
    const mockReq = {
        body: {
            createdEntity: {
                orderNumber: req.query.order || 'SO-00085227',
                operatingCompanyCode: req.query.opco || 'A',
                quoteId: req.query.quoteId || '13862'
            }
        }
    };
    const mockRes = {
        status: (code) => ({ json: (data) => res.status(code).json(data) }),
        json: (data) => res.json(data)
    };
    return handleSalesWebhook(mockReq, mockRes);
});

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
                .progress-bg { background: #eee; border-radius: 10px; height: 25px; margin: 20px 0; overflow: hidden; position: relative; }
                .progress-bar { background: #4caf50; height: 100%; width: 0%; transition: width 0.3s; }
                button { background: #2196f3; color: white; border: none; padding: 12px 25px; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold; }
                button:hover { background: #1976d2; }
                #status { margin-top: 20px; font-weight: bold; color: #555; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Bulk Sync: Contacts</h1>
                <p>Sync all validated contacts from Prospect CRM to Dotdigital.</p>
                <div class="progress-bg"><div id="progress" class="progress-bar"></div></div>
                <div id="status">Ready to start...</div>
                <button onclick="startSync()">Start Bulk Sync</button>
            </div>
            <script>
                async function startSync() {
                    const status = document.getElementById('status');
                    const progress = document.getElementById('progress');
                    status.innerText = 'Syncing... please wait.';
                    const eventSource = new EventSource('/sync/bulk-prospect');
                    eventSource.onmessage = (event) => {
                        const data = JSON.parse(event.data);
                        if (data.status === 'processing') {
                            const percent = Math.round((data.current / data.total) * 100);
                            progress.style.width = percent + '%';
                            status.innerText = 'Syncing: ' + data.current + ' / ' + data.total;
                        } else if (data.status === 'completed') {
                            status.innerText = '✅ Sync Completed Successfully!';
                            eventSource.close();
                        } else if (data.status === 'error') {
                            status.innerText = '❌ Error: ' + data.message;
                            eventSource.close();
                        }
                    };
                }
            </script>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});

module.exports = app;
