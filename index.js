// index.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.json({ type: 'text/json' }));

app.get('/health', async (req, res) => {
  const { getDotdigitalClient } = require('./services/dotdigital');
  const { getSalesOrderHeader } = require('./services/prospect');
  const ddClient = getDotdigitalClient();
  const diagnostics = {};

  // 1. Current State
  try {
    const listRes = await ddClient.get('/insightData/v3/collections');
    diagnostics.current_collections = listRes.data;
  } catch (e) { diagnostics.current_collections = { error: e.message }; }

  // 2. Specific Order Debug
  if (req.query.order) {
    try {
        const liveOrder = await getSalesOrderHeader(req.query.order);
        diagnostics.prospect_raw_order = liveOrder;
        
        const { handleSalesWebhook } = require('./handlers/salesSync');
        const mockReq = { body: { createdEntity: { orderNumber: req.query.order, quoteId: req.query.quoteId } } };
        const mockRes = { 
            status: (code) => { diagnostics.sync_status_code = code; return { json: (d) => diagnostics.sync_result = d }; },
            json: (data) => { diagnostics.sync_result = data; }
        };
        await handleSalesWebhook(mockReq, mockRes);
    } catch (e) {
        diagnostics.error = e.message;
    }
    return res.json({ status: 'diagnostic_run', diagnostics });
  }

  res.json({ status: 'ok', version: '5.2.0-PROSPECT-DEBUG', diagnostics });
});

// Handlers
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
