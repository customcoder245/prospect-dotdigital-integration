const { getProspectClient, getOrderLines, getContact } = require('../services/prospect');
const { getDotdigitalClient } = require('../services/dotdigital');

const pushSaleToInsightData = async (contactEmail, orderInfo, orderLines) => {
    const client = getDotdigitalClient();

    // 1. Ensure the contact exists in Dotdigital (prevents 404)
    try {
        await client.post('/v2/contacts', {
            Email: contactEmail,
            OptInType: 'Unknown',
            EmailType: 'Html'
        });
        console.log(`[Trace] Contact ensured: ${contactEmail}`);
    } catch (e) {
        // Already exists is fine
    }

    // 2. Prepare the payload in the EXACT format Dotdigital "Orders" expects
    const payload = {
        id: orderInfo.orderNumber,
        order_total: parseFloat(orderInfo.grossValue) || 0,
        order_subtotal: parseFloat(orderInfo.netValue) || 0,
        currency: orderInfo.currency || 'AUD',
        purchase_date: orderInfo.orderDate, // ISO8601 string
        order_status: orderInfo.orderStatus,
        products: orderLines.map(line => ({
            name: line.Description || line.ProductCode || 'Product',
            price: parseFloat(line.UnitPrice) || 0,
            sku: line.ProductCode || line.StockCode || 'N/A',
            qty: parseInt(line.Quantity) || 1
        }))
    };

    try {
        // 3. Push to "Orders" collection using the stable v2 endpoint
        // Note: Capital "O" in Orders to match your account's collection name
        const url = `/v2/contacts/${contactEmail}/insight-data/Orders/${orderInfo.orderNumber}`;
        await client.post(url, payload);
        console.log(`✅ Success: Order ${orderInfo.orderNumber} synced to Dotdigital`);
        return true;
    } catch (e) {
        console.error(`❌ Push failed for ${orderInfo.orderNumber}:`, e.response?.data || e.message);
        return false;
    }
};

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
                const actualData = qRes.data.value ? (qRes.data.value.find(q => q.QuoteId == quoteId) || qRes.data.value[0]) : qRes.data;
                contactId = actualData.ContactId || actualData.CreatedContact || null;
            } catch (e) {}
        }

        let contactEmail = null;
        if (contactId) {
            const con = await getContact(contactId);
            contactEmail = con?.Email || con?.email;
        }

        if (!contactEmail) return res.json({ status: 'no_email', contactId });

        const lines = await getOrderLines(quoteId);
        
        const orderInfo = {
            orderNumber,
            orderDate: entity.orderDate || entity.OrderDate || new Date().toISOString(),
            grossValue: entity.grossValue || entity.GrossValue || 0,
            netValue: entity.Value || entity.netValue || 0,
            currency: entity.currencyCode || entity.CurrencyCode || 'AUD',
            orderStatus: entity.orderStatus || entity.OrderStatus || 'Placed'
        };

        const success = await pushSaleToInsightData(contactEmail, orderInfo, lines);
        return res.json({ 
            status: success ? 'ok' : 'error', 
            contact: contactEmail,
            orderId: orderNumber 
        });

    } catch (err) {
        console.error('Final Sales Error:', err.message);
        return res.json({ status: 'error', message: err.message });
    }
};

module.exports = { handleSalesWebhook };
