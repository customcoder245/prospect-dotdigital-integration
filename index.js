// index.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.json({ type: 'text/json' }));

// Health Check + Test Mode (with raw data exposure)
app.get('/health', async (req, res) => {
  if (req.query.order) {
    const { getSalesOrderHeader, getOrderLines } = require('./services/prospect');
    const { handleSalesWebhook } = require('./handlers/salesSync');
    
    try {
        const liveOrder = await getSalesOrderHeader(req.query.order);
        const mockReq = { body: { createdEntity: { orderNumber: req.query.order } } };
        const mockRes = { 
            status: (code) => { return { json: (d) => res.json({ test_status: code, result: d, debug_order: liveOrder }) }; },
            json: (data) => res.json({ test_status: 200, result: data, debug_order: liveOrder })
        };
        await handleSalesWebhook(mockReq, mockRes);
    } catch (e) {
        res.json({ error: e.message });
    }
    return;
  }

  res.json({ 
    status: 'ok', 
    integration: 'Prospect CRM <=> Dotdigital',
    region: 'R3',
    version: '6.2.0-DEBUG-IDS'
  });
});

const { handleProspectWebhook } = require('./handlers/prospectWebhook');
const { handleDotdigitalWebhook } = require('./handlers/dotdigitalWebhook');
const { handleSalesWebhook } = require('./handlers/salesSync');
const { handleSuppressionSync } = require('./handlers/suppressionSync');
const { handleBulkSync } = require('./handlers/bulkSync');

app.post('/webhook/prospect', handleProspectWebhook);
app.post('/webhook/dotdigital', handleDotdigitalWebhook);
app.post('/webhook/sales', handleSalesWebhook);
app.get('/sync/suppressed', handleSuppressionSync);
app.get('/sync/bulk-prospect', handleBulkSync);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
module.exports = app;
