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
        
        if (liveOrder.AccountsId) {
            // Try Strategy 1: Search Accounts by GUID
            try {
                const resAcc = await prospect.get(`/Accounts?$filter=AccountsId eq '${liveOrder.AccountsId}'`);
                diagnostics.table_Accounts = resAcc.data.value ? 'Found' : 'Empty';
                if (resAcc.data.value?.[0]) diagnostics.account_data = resAcc.data.value[0];
            } catch (e) { diagnostics.table_Accounts = `Error: ${e.message}`; }

            // Try Strategy 2: Search Companies by GUID
            try {
                const resComp = await prospect.get(`/Companies?$filter=AccountsId eq '${liveOrder.AccountsId}'`);
                diagnostics.table_Companies = resComp.data.value ? 'Found' : 'Empty';
                if (resComp.data.value?.[0]) diagnostics.company_data = resComp.data.value[0];
            } catch (e) { diagnostics.table_Companies = `Error: ${e.message}`; }

            // Try Strategy 3: Directly search any contact by this AccountsId GUID
            try {
                const resCon = await prospect.get(`/Contacts?$filter=AccountsId eq '${liveOrder.AccountsId}'`);
                diagnostics.contacts_by_AccountsId = resCon.data.value?.length || 0;
                if (resCon.data.value?.[0]) diagnostics.sample_contact = resCon.data.value[0];
            } catch (e) { diagnostics.contacts_by_AccountsId = `Error: ${e.message}`; }
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

  res.json({ status: 'ok', version: '6.4.0-DISCOVERY' });
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
