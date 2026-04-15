const { getProspectClient, getOrderLines, getContact, getSalesOrderHeader } = require('../services/prospect');
const { getDotdigitalClient } = require('../services/dotdigital');

// ─────────────────────────────────────────────
// Push Insight Data to Dotdigital
// ─────────────────────────────────────────────
const pushSaleToInsightData = async (contactEmail, orderInfo, orderLines) => {
    const client = getDotdigitalClient();

    try {
        await client.post('/insightData/v3/collections/Orders?collectionScope=contact&collectionType=orders');
    } catch (e) {}

    const productsArray = orderLines.map(line => ({
        sku:   line.StockCode || line.ProductCode || 'N/A',
        name:  line.Description || line.ProductCode || 'Product',
        price: parseFloat(line.UnitPrice) || 0,
        qty:   parseFloat(line.Quantity) || 1
    }));

    const orderRecord = {
        id:            orderInfo.orderNumber,
        order_total:   parseFloat(orderInfo.grossValue) || 0,
        order_subtotal: parseFloat(orderInfo.netValue) || 0,
        currency:      orderInfo.currency || 'AUD',
        purchase_date: orderInfo.orderDate,
        order_status:  orderInfo.orderStatus,
        products:      productsArray
    };

    try {
        await client.put(`/insightData/v3/contacts/email/${contactEmail}/Orders/${orderInfo.orderNumber}`, orderRecord);
        console.log(`✅ Success: Full Order ${orderInfo.orderNumber} pushed to Dotdigital for ${contactEmail}`);
        return { success: true };
    } catch (e) {
        const errorMsg = e.response?.data?.message || e.response?.data || e.message;
        console.error(`❌ v3 PUT failed for ${orderInfo.orderNumber}:`, errorMsg);
        return { success: false, error: errorMsg };
    }
};

// ─────────────────────────────────────────────
// Real-time Sales Handler
// ─────────────────────────────────────────────
const handleSalesWebhook = async (req, res) => {
    try {
        const entity = req.body.createdEntity || req.body.updatedEntity || {};
        const orderNumber = entity.orderNumber || entity.OrderNumber;
        const quoteIdInput = entity.quoteId || entity.QuoteId;

        if (!orderNumber) return res.json({ status: 'no_order_id' });

        console.log(`[Trace] Syncing Order: ${orderNumber}`);

        // 1. Fetch FULL Order Header from Prospect (Reliable Source)
        const liveOrder = await getSalesOrderHeader(orderNumber);
        if (!liveOrder) return res.json({ status: 'order_not_found_in_prospect', orderNumber });

        // 2. Resolve Contact Email
        const contactId = liveOrder.ContactId || liveOrder.CreatedContact;
        let contactEmail = null;
        if (contactId) {
            const con = await getContact(contactId);
            contactEmail = con?.Email || con?.email;
        }

        if (!contactEmail) return res.json({ status: 'no_email', orderNumber });

        // 3. Fetch Order Lines using the correct QuoteId from the live order
        const actualQuoteId = liveOrder.QuoteId || quoteIdInput;
        const lines = await getOrderLines(actualQuoteId);
        
        // 4. Transform for Dotdigital
        const orderInfo = {
            orderNumber: orderNumber,
            orderDate:   liveOrder.OrderDate || new Date().toISOString(),
            grossValue:  liveOrder.GrossTotal || liveOrder.GrossValue || 0,
            netValue:    liveOrder.NetTotal || 0,
            currency:    liveOrder.CurrencyCode || 'AUD',
            orderStatus: liveOrder.OrderStatusDescription || 'Processed'
        };

        const result = await pushSaleToInsightData(contactEmail, orderInfo, lines);
        return res.json({ 
            status: result.success ? 'ok' : 'error', 
            message: result.error,
            contact: contactEmail,
            orderId: orderNumber 
        });

    } catch (err) {
        console.error('Final Sales Error:', err.message);
        return res.json({ status: 'error', message: err.message });
    }
};

module.exports = { handleSalesWebhook };
