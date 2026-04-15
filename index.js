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

  // 1. Diagnostics: Try to LIST all collections again
  try {
    const listRes = await ddClient.get('/insightData/v3/collections');
    diagnostics.current_collections = listRes.data;
  } catch (e) { diagnostics.current_collections = { error: e.message }; }

  // 2. Diagnostics: FORCE Create "orders" collection
  try {
    const createRes = await ddClient.post('/insightData/v3/collections/orders?collectionScope=contact&collectionType=orders');
    diagnostics.create_orders_result = createRes.data || 'Success (200 OK)';
  } catch (e) { 
    diagnostics.create_orders_result = { 
        status: e.response?.status, 
        message: e.message, 
        data: e.response?.data 
    }; 
  }

  // 3. If order is provided, run the sync!
  if (req.query.order) {
    const { handleSalesWebhook } = require('./handlers/salesSync');
    const mockReq = { body: { createdEntity: { orderNumber: req.query.order, quoteId: req.query.quoteId } } };
    const mockRes = { 
        status: (code) => diagnostics.sync_status_code = code,
        json: (data) => diagnostics.sync_result = data
    };
    await handleSalesWebhook(mockReq, mockRes);
    return res.json({ status: 'ok', diagnostics });
  }

  res.json({ status: 'ok', version: '5.0.0-DIAGNOSTICS', diagnostics });
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
