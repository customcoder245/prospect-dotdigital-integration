const { getProspectClient, getOrderLines, getContact } = require('../services/prospect');
const { getDotdigitalClient } = require('../services/dotdigital');

const pushSaleToInsightData = async (contactEmail, orderInfo, orderLines) => {
    const client = getDotdigitalClient();

    try {
        await client.post('/insightData/v3/collections/Orders?collectionScope=contact&collectionType=orders');
    } catch (e) {}

    const productsArray = orderLines.map(line => ({
        sku:   line.ProductCode || line.StockCode || 'N/A',
        name:  line.Description || line.ProductCode || 'Product',
        price: parseFloat(line.UnitPrice) || 0,
        qty:   parseInt(line.Quantity) || 1
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
        await client.post(`/insightData/v3/records`, {
            collectionName: 'Orders',
            contactIdentifier: contactEmail,
            key: orderInfo.orderNumber,
            json: JSON.stringify(orderRecord)
        });
        return { success: true };
    } catch (e) {
        const errorMsg = e.response?.data?.message || e.response?.data || e.message;
        return { success: false, error: errorMsg };
    }
};

const handleSalesWebhook = async (req, res) => {
    try {
        const entity = req.body.createdEntity || req.body.updatedEntity || {};
        const orderNumber = entity.orderNumber || entity.OrderNumber;
        const quoteId = entity.quoteId || entity.QuoteId;
        if (!orderNumber) return res.json({ status: 'no_order' });

        const prospect = getProspectClient();
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

        const result = await pushSaleToInsightData(contactEmail, orderInfo, lines);
        return res.json({ 
            status: result.success ? 'ok' : 'error', 
            message: result.error,
            contact: contactEmail,
            orderId: orderNumber 
        });

    } catch (err) {
        return res.json({ status: 'error', message: err.message });
    }
};

module.exports = { handleSalesWebhook };
