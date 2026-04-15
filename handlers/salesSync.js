const { getProspectClient, getOrderLines, getContact } = require('../services/prospect');
const { getDotdigitalClient } = require('../services/dotdigital');

// ─────────────────────────────────────────────
// Push Insight Data to Dotdigital (v2)
// ─────────────────────────────────────────────
const pushSaleToInsightData = async (contactEmail, orderInfo, orderLines) => {
    const client = getDotdigitalClient();

    // Ensure "Orders" collection exists (v3 call, but record push is v2)
    try {
        await client.post('/insightData/v3/collections/Orders?collectionScope=contact&collectionType=orders');
    } catch (e) {}

    for (const line of orderLines) {
        const sku    = line.ProductCode || line.StockCode || 'N/A';
        const lineId = line.OrderLineId || Math.random().toString(36);
        const key    = `${orderInfo.orderNumber}-${lineId}`;
        
        const record = {
            orderNumber: orderInfo.orderNumber,
            orderDate:   orderInfo.orderDate,
            sku:         sku,
            quantity:    parseInt(line.Quantity) || 1,
            unitPrice:   parseFloat(line.UnitPrice) || 0,
            orderStatus: orderInfo.orderStatus,
            totalOrderValue: parseFloat(orderInfo.grossValue) || 0
        };

        try {
            // Use the stable v2 endpoint for the actual record push
            await client.post(`/v2/contacts/${contactEmail}/insight-data/Orders/${key}`, record);
            console.log(`✅ Success: SKU ${sku} pushed for ${contactEmail}`);
        } catch (e) {
            console.error(`❌ Push failed for SKU ${sku}:`, e.response?.data || e.message);
        }
    }
};

// ─────────────────────────────────────────────
// Real-time Sales Handler
// ─────────────────────────────────────────────
const handleSalesWebhook = async (req, res) => {
    try {
        const entity = req.body.createdEntity || req.body.updatedEntity || {};
        const orderNumber = entity.orderNumber || entity.OrderNumber;
        const quoteId = entity.quoteId || entity.QuoteId;

        if (!orderNumber) return res.json({ status: 'no_order' });

        const prospect = getProspectClient();
        console.log(`Processing Order: ${orderNumber} (QuoteId=${quoteId})`);

        let contactId = null;
        if (quoteId) {
            try {
                const qRes = await prospect.get(`/Quotes(QuoteId=${quoteId})`);
                const qData = qRes.data.value ? qRes.data.value[3] : qRes.data; // Note: adjusted to check index or record
                // Recovery: If it's a list, find the record with correct QuoteId
                const actualData = qRes.data.value ? qRes.data.value.find(q => q.QuoteId == quoteId) || qRes.data.value[0] : qRes.data;
                contactId = actualData.ContactId || actualData.CreatedContact || null;
            } catch (e) { console.log(`Quote fetch error: ${e.message}`); }
        }

        let contactEmail = null;
        if (contactId) {
            const con = await getContact(contactId);
            contactEmail = con?.Email || con?.email;
        }

        if (!contactEmail) {
            return res.json({ status: 'no_email', contactId });
        }

        const lines = await getOrderLines(quoteId);
        
        const orderInfo = {
            orderNumber,
            orderDate:   entity.orderDate || new Date().toISOString(),
            grossValue:  entity.grossValue || 0,
            orderStatus: entity.orderStatus || 'Placed'
        };

        await pushSaleToInsightData(contactEmail, orderInfo, lines);
        
        return res.json({ status: 'ok', contact: contactEmail });

    } catch (err) {
        console.error('Final Sales Error:', err.message);
        return res.json({ status: 'error', message: err.message });
    }
};

module.exports = { handleSalesWebhook };
