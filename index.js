// index.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.json({ type: 'text/json' }));

app.get('/health', async (req, res) => {
  if (req.query.order) {
    const { getSalesOrderHeader, getProspectClient } = require('./services/prospect');
    const { handleSalesWebhook } = require('./handlers/salesSync');
    const diagnostics = {};
    const prospect = getProspectClient();
    
    try {
        const liveOrder = await getSalesOrderHeader(req.query.order);
        diagnostics.debug_order = liveOrder;
        
        const qId = liveOrder.QuoteId;
        if (qId) {
            try {
                // TRACE: Pull the original Quote to see linked IDs
                console.log(`Searching for Quote: ${qId}`);
                const resQuote = await prospect.get(`/Quotes?$filter=QuoteId eq ${qId}`);
                diagnostics.quote_discovery = resQuote.data.value ? resQuote.data.value : resQuote.data;
            } catch (e) {
                diagnostics.quote_discovery_error = e.message;
            }
        }

        const mockReq = { body: { createdEntity: { orderNumber: req.query.order } } };
        const mockRes = { 
            status: (code) => { return { json: (d) => res.json({ test_status: code, result: d, diagnostics }) }; },
            json: (data) => res.json({ test_status: 200, result: data, diagnostics })
        };
        await handleSalesWebhook(mockReq, mockRes);
    } catch (e) {
        res.json({ error: e.message });
    }
    return;
  }

  res.json({ status: 'ok', version: '7.0.0-QUOTE-TRACE' });
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
