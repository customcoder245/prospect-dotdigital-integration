// index.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.json({ type: 'text/json' }));

// THE ULTIMATE SURVIVAL ROUTE (Health + Test + Diagnostics)
app.get('/health', async (req, res) => {
  const { getDotdigitalClient } = require('./services/dotdigital');
  const ddClient = getDotdigitalClient();
  const diagnostics = {};

  // 1. Diagnostics: List all collections
  try {
    const listRes = await ddClient.get('/insightData/v3/collections');
    diagnostics.current_collections = listRes.data;
  } catch (e) { diagnostics.current_collections = { error: e.message }; }

  // 2. Diagnostics: Get "Orders" Schema
  try {
    const schemaRes = await ddClient.get('/insightData/v3/collections/Orders/schema');
    diagnostics.orders_schema = schemaRes.data;
  } catch (e) { diagnostics.orders_schema = { error: e.message }; }

  // 3. If order is provided, run the sync!
  if (req.query.order) {
    const { handleSalesWebhook } = require('./handlers/salesSync');
    
    // We wrap this to capture the error details
    let errorDetails = null;
    const mockReq = { body: { createdEntity: { orderNumber: req.query.order, quoteId: req.query.quoteId } } };
    const mockRes = { 
        status: (code) => { diagnostics.sync_status_code = code; return { json: (d) => diagnostics.sync_result = d }; },
        json: (data) => { diagnostics.sync_result = data; }
    };

    try {
        await handleSalesWebhook(mockReq, mockRes);
    } catch (e) {
        diagnostics.sync_exception = e.message;
    }
    
    return res.json({ status: 'diagnostic_run', diagnostics });
  }

  res.json({ status: 'ok', version: '5.1.0-ERROR-CAPTURE', diagnostics });
});

// Import rest of handlers
const { handleProspectWebhook } = require('./handlers/prospectWebhook');
const { handleDotdigitalWebhook } = require('./handlers/dotdigitalWebhook');
const { handleSalesWebhook } = require('./handlers/salesSync');

// Webhook Endpoints
app.post('/webhook/prospect', handleProspectWebhook);
app.post('/webhook/dotdigital', handleDotdigitalWebhook);
app.post('/webhook/sales', handleSalesWebhook);

// Scheduled/Manual Sync Endpoints
const { handleSuppressionSync } = require('./handlers/suppressionSync');
const { handleBulkSync } = require('./handlers/bulkSync');
app.get('/sync/suppressed', handleSuppressionSync);
app.get('/sync/bulk-prospect', handleBulkSync);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
module.exports = app;
