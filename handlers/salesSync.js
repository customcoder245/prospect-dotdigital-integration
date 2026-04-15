const { getProspectClient, getOrderLines, getContact, getDivision } = require('../services/prospect');
const { getDotdigitalClient } = require('../services/dotdigital');

// ─────────────────────────────────────────────
// Push Insight Data to Dotdigital
// ─────────────────────────────────────────────
const pushSaleToInsightData = async (contactEmail, orderInfo, orderLines) => {
    const client = getDotdigitalClient();
    for (const line of orderLines) {
        const sku    = line.ProductCode || line.StockCode || '';
        const lineId = line.OrderLineId || Math.random().toString(36);
        const key    = `${orderInfo.orderNumber}-${lineId}`;
        const json   = {
            orderNumber: orderInfo.orderNumber,
            orderDate:   orderInfo.orderDate,
            sku:         sku,
            quantity:    line.Quantity || 1,
            unitPrice:   line.UnitPrice || 0,
            orderStatus: orderInfo.orderStatus,
            totalOrderValue: orderInfo.grossValue
        };
        try {
            await client.post('/v3/insight-data/records', {
                collectionName: 'Orders',
                contactIdentifier: contactEmail,
                key,
                json: JSON.stringify(json)
            });
            console.log(`✅ Pushed SKU ${sku} for ${contactEmail}`);
        } catch (e) { console.error(`❌ Push failed: ${e.message}`); }
    }
};

// ─────────────────────────────────────────────
// Real-time Sales Handler
// ─────────────────────────────────────────────
const handleSalesWebhook = async (req, res) => {
    try {
        const entity = req.body.createdEntity || req.body.updatedEntity || {};
        const orderNumber = entity.orderNumber || entity.OrderNumber;
        const opco = entity.operatingCompanyCode || entity.OperatingCompanyCode || 'A';
        const quoteId = entity.quoteId || entity.QuoteId;

        if (!orderNumber) return res.json({ status: 'no_order' });

        const prospect = getProspectClient();
        console.log(`Processing Order: ${orderNumber} (QuoteId=${quoteId})`);

        // 1. Get the Contact ID from the Quote
        let contactId = null;
        if (quoteId) {
            try {
                console.log(`[Trace] Fetching Quote: /Quotes(QuoteId=${quoteId})`);
                const qRes = await prospect.get(`/Quotes(QuoteId=${quoteId})`);
                const qResp = qRes.data;
                const qData = qResp.value ? qResp.value[0] : qResp;
                contactId = qData.ContactId || qData.CreatedContact || null;
                console.log(`[Trace] ContactId found: ${contactId}`);
            } catch (e) { console.error(`[Trace ERROR] Quote fetch failed: ${e.message} URL: /Quotes(QuoteId=${quoteId})`); }
        }

        // 2. Resolve Email
        let contactEmail = null;
        if (contactId) {
            try {
                console.log(`[Trace] Fetching Contact: /Contacts?$filter=ContactId eq ${contactId}`);
                const con = await getContact(contactId);
                contactEmail = con?.Email || con?.email;
                console.log(`[Trace] Email resolved: ${contactEmail}`);
            } catch (e) {
                console.error(`[Trace ERROR] Contact lookup failed: ${e.message} URL: /Contacts?$filter=ContactId eq ${contactId}`);
                throw new Error(`Contact API Failed: ${e.message}`);
            }
        }

        if (!contactEmail) {
            return res.json({ status: 'no_email', contactId });
        }

        // 3. Get Lines
        let orderLines = [];
        try {
            console.log(`[Trace] Fetching Lines: /SalesOrderLines?$filter=OrderNumber eq '${orderNumber}'...`);
            orderLines = await getOrderLines(orderNumber, opco);
            console.log(`[Trace] Lines found: ${orderLines.length}`);
        } catch (e) {
            console.error(`[Trace ERROR] Lines fetch failed: ${e.message}`);
            throw new Error(`Lines API Failed: ${e.message}`);
        }
        const orderInfo  = {
            orderNumber,
            orderDate:   entity.orderDate || new Date().toISOString(),
            grossValue:  entity.grossValue || 0,
            orderStatus: entity.orderStatus || 'Placed'
        };

        await pushSaleToInsightData(contactEmail, orderInfo, orderLines);
        
        console.log(`✅ Success: ${orderNumber} synced to ${contactEmail}`);
        return res.json({ status: 'ok', contact: contactEmail });

    } catch (err) {
        console.error('Final Sales Error:', err.message);
        return res.json({ status: 'error', message: err.message });
    }
};

module.exports = { handleSalesWebhook };
