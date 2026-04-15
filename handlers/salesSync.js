const { getProspectClient, getOrderLines, getContact } = require('../services/prospect');
const { getDotdigitalClient } = require('../services/dotdigital');

// ─────────────────────────────────────────────
// Push Insight Data to Dotdigital (v3)
// ─────────────────────────────────────────────
const pushSaleToInsightData = async (contactEmail, orderInfo, orderLines) => {
    const client = getDotdigitalClient();

    // 1. Ensure "Orders" collection exists (Omit if it errors, as it might already exist)
    try {
        await client.post('/insightData/v3/collections/Orders?collectionScope=contact&collectionType=orders');
    } catch (e) {
        // 409 Conflict or 200 OK both mean it's ready. Only log major errors.
        if (e.response?.status !== 200 && e.response?.status !== 409) {
            console.log(`Note: Collection setup info: ${e.message}`);
        }
    }

    // 2. Push Line Items
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
            // Dotdigital v3 Record Import Endpoint
            await client.post(`/insightData/v3/collections/Orders/records`, {
                contactIdentifier: contactEmail,
                key: key,
                json: JSON.stringify(record)
            });
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
        const opco = entity.operatingCompanyCode || entity.OperatingCompanyCode || 'A';
        const quoteId = entity.quoteId || entity.QuoteId;

        if (!orderNumber) return res.json({ status: 'no_order' });

        const prospect = getProspectClient();
        console.log(`Processing Order: ${orderNumber} (QuoteId=${quoteId})`);

        let contactId = null;
        if (quoteId) {
            try {
                const qRes = await prospect.get(`/Quotes(QuoteId=${quoteId})`);
                const qData = qRes.data.value ? qRes.data.value[0] : qRes.data;
                contactId = qData.ContactId || qData.CreatedContact || null;
            } catch (e) { console.log(`Quote fetch error: ${e.message}`); }
        }

        let contactEmail = null;
        if (contactId) {
            try {
                const con = await getContact(contactId);
                contactEmail = con?.Email || con?.email;
            } catch (e) { console.log(`Contact lookup failed: ${e.message}`); }
        }

        if (!contactEmail) {
            return res.json({ status: 'no_email', contactId });
        }

        const orderLines = await getOrderLines(quoteId);
        const orderInfo  = {
            orderNumber,
            orderDate:   entity.orderDate || new Date().toISOString(),
            grossValue:  entity.grossValue || 0,
            orderStatus: entity.orderStatus || 'Placed'
        };

        await pushSaleToInsightData(contactEmail, orderInfo, orderLines);
        
        return res.json({ status: 'ok', contact: contactEmail });

    } catch (err) {
        console.error('Sales Error:', err.message);
        return res.json({ status: 'error', message: err.message });
    }
};

module.exports = { handleSalesWebhook };
