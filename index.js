// index.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.json({ type: 'text/json' }));

// Health Check + Test Mode
app.get('/health', async (req, res) => {
  if (req.query.order) {
    const { handleSalesWebhook } = require('./handlers/salesSync');
    const mockReq = { body: { createdEntity: { orderNumber: req.query.order } } };
    const mockRes = { 
        status: (code) => { return { json: (d) => res.json({ test_status: code, result: d }) }; },
        json: (data) => res.json({ test_status: 200, result: data })
    };
    await handleSalesWebhook(mockReq, mockRes);
    return;
  }

  res.json({ 
    status: 'ok', 
    integration: 'Prospect CRM <=> Dotdigital',
    region: 'R3',
    version: '6.1.0-TESTING'
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
