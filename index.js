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
        
        try {
            // SAMPLE THE TABLE TO SEE COLUMN NAMES
            const resSample = await prospect.get(`/UnleashedContacts?$top=3`);
            diagnostics.unleashed_sample = resSample.data.value || resSample.data;
        } catch (e) {
            diagnostics.unleashed_sample_error = e.message;
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

  res.json({ status: 'ok', version: '6.6.0-UNLEASHED-SAMPLE' });
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
