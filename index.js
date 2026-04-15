// index.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.json({ type: 'text/json' }));

// 1. HEALTH (STAYING ALIVE)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.2.0-FINAL' });
});

// 2. THE TEST ROUTE (MOVED TO TOP TO FORCE REFRESH)
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

// Import API services & Webhook Handlers
const { verifyProspectConnection } = require('./services/prospect');
const { verifyDotdigitalConnection } = require('./services/dotdigital');
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

// Automated Sync Dashboard
app.get('/sync/dashboard', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Bulk Sync</title></head>
        <body><h1>Bulk Sync Contacts</h1><button onclick="startSync()">Start</button>
        <script>
            async function startSync() {
                const eventSource = new EventSource('/sync/bulk-prospect');
                eventSource.onmessage = (event) => { console.log(event.data); };
            }
        </script></body></html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(\`Server running on port \${PORT}\`); });
module.exports = app;
