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

        // 1. Get the Contact ID from the Quote (This is the most accurate place)
        let contactId = null;
        if (quoteId) {
            try {
                const qRes = await prospect.get(`/Quotes(QuoteId=${quoteId})`);
                const qData = qRes.data.value ? qRes.data.value[0] : qRes.data;
                contactId = qData.ContactId || qData.CreatedContact || null;
                console.log(`Contact ID found in Quote: ${contactId}`);
            } catch (e) { console.log(`Quote fetch error: ${e.message}`); }
        }

        // 2. Resolve Email
        let contactEmail = null;
        if (contactId) {
            try {
                // In OData, integer IDs like 61744 don't need quotes
                const con = await getContact(contactId);
                contactEmail = con?.Email || con?.email;
                if (contactEmail) console.log(`Found email via ContactId ${contactId}: ${contactEmail}`);
            } catch (e) { console.log(`Contact ID lookup failed: ${e.message}`); }
        }

        if (!contactEmail) {
            console.log(`Final check: No email found for Order ${orderNumber}`);
            return res.json({ status: 'no_email', contactId });
        }

        // 3. Get Lines and Push
        const orderLines = await getOrderLines(orderNumber, opco);
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
