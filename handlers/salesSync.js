const { getProspectClient, getOrderLines, getContact } = require('../services/prospect');
const { getDotdigitalClient } = require('../services/dotdigital');

// ─────────────────────────────────────────────
// Push Insight Data to Dotdigital (Standard "orders" Schema)
// ─────────────────────────────────────────────
const pushSaleToInsightData = async (contactEmail, orderInfo, orderLines) => {
    const client = getDotdigitalClient();

    // 1. Ensure the "orders" collection exists with type "orders"
    // Using lowercase "orders" as required by Dotdigital Standard Schema
    try {
        await client.post('/insightData/v3/collections/orders?collectionScope=contact&collectionType=orders');
    } catch (e) {}

    // 2. Prepare the products array
    const productsArray = orderLines.map(line => ({
        sku:   line.ProductCode || line.StockCode || 'N/A',
        name:  line.Description || line.ProductCode || 'Product',
        price: parseFloat(line.UnitPrice) || 0,
        qty:   parseInt(line.Quantity) || 1
    }));

    // 3. Prepare the Top-Level Order Record (matches Dotdigital Schema)
    const orderRecord = {
        id:            orderInfo.orderNumber, // Order ID as the key
        order_total:   parseFloat(orderInfo.grossValue) || 0,
        order_subtotal: parseFloat(orderInfo.netValue) || 0,
        currency:      orderInfo.currency || 'AUD',
        purchase_date: orderInfo.orderDate,
        order_status:  orderInfo.orderStatus,
        products:      productsArray
    };

    try {
        // FIXED v3 FORMAT: Post to /records and specify collection in JSON
        await client.post(`/insightData/v3/records`, {
            collectionName: 'orders',
            contactIdentifier: contactEmail,
            key: orderInfo.orderNumber, // The order number is the unique key
            json: JSON.stringify(orderRecord)
        });
        console.log(`✅ Success: Full Order ${orderInfo.orderNumber} pushed to Dotdigital orders for ${contactEmail}`);
    } catch (e) {
        console.error(`❌ v3 Order Push failed:`, e.response?.data || e.message);
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
            orderDate:   entity.orderDate || entity.OrderDate || new Date().toISOString(),
            grossValue:  entity.grossValue || entity.GrossValue || 0,
            netValue:    entity.netValue || entity.Value || 0,
            currency:    entity.currencyCode || entity.CurrencyCode || 'AUD',
            orderStatus: entity.orderStatus || entity.OrderStatus || 'Placed'
        };

        await pushSaleToInsightData(contactEmail, orderInfo, lines);
        
        return res.json({ status: 'ok', contact: contactEmail });

    } catch (err) {
        console.error('Final Sales Error:', err.message);
        return res.json({ status: 'error', message: err.message });
    }
};

module.exports = { handleSalesWebhook };
