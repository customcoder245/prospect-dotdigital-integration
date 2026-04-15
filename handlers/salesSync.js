const { getOrderLines, getContact, getSalesOrderHeader, getProspectClient } = require('../services/prospect');
const { getDotdigitalClient } = require('../services/dotdigital');

/**
 * Pushes a Sales Order to Dotdigital Insight Data using the v3 PUT endpoint.
 */
const pushSaleToInsightData = async (contactEmail, orderInfo, orderLines) => {
    const client = getDotdigitalClient();

    const productsArray = orderLines.map(line => ({
        sku:   line.ProductItemId || line.StockCode || 'N/A',
        name:  line.Description || line.ProductItemId || 'Product',
        price: parseFloat(line.DecimalPrice) || parseFloat(line.Price) || 0,
        qty:   parseFloat(line.DecimalQuantity) || parseFloat(line.Quantity) || 1
    }));

    const orderRecord = {
        id:             orderInfo.orderNumber,
        order_total:    parseFloat(orderInfo.grossValue) || 0,
        order_subtotal: parseFloat(orderInfo.netValue) || 0,
        currency:       orderInfo.currency || 'AUD',
        purchase_date:  orderInfo.orderDate,
        order_status:   orderInfo.orderStatus,
        products:       productsArray
    };

    try {
        await client.put(`/insightData/v3/contacts/email/${contactEmail}/Orders/${orderInfo.orderNumber}`, orderRecord);
        return { success: true };
    } catch (e) {
        const errorMsg = e.response?.data?.message || e.message;
        console.error(`[Dotdigital Error] ${orderInfo.orderNumber}:`, errorMsg);
        return { success: false, error: errorMsg };
    }
};

/**
 * Main Webhook Handler for Sales Orders
 */
const handleSalesWebhook = async (req, res) => {
    try {
        const entity = req.body.createdEntity || req.body.updatedEntity || {};
        const orderNumber = entity.orderNumber || entity.OrderNumber;
        const quoteIdInput = entity.quoteId || entity.QuoteId;

        if (!orderNumber) return res.status(200).json({ status: 'ignored', reason: 'no_order_number' });

        // 1. Fetch live order header
        const liveOrder = await getSalesOrderHeader(orderNumber);
        if (!liveOrder) return res.status(200).json({ status: 'not_found', orderNumber });

        // 2. Resolve Contact Email
        let contactEmail = null;
        let contactId = liveOrder.ContactId || liveOrder.CreatedContact;
        
        if (contactId) {
            const con = await getContact(contactId);
            contactEmail = con?.Email || con?.email || null;
        }

        // Fallback to Quote lookup if email still missing
        if (!contactEmail && (liveOrder.QuoteId || quoteIdInput)) {
            const qId = liveOrder.QuoteId || quoteIdInput;
            const prospect = getProspectClient();
            try {
                const qRes = await prospect.get(`/Quotes(QuoteId=${qId})`);
                const qData = qRes.data.value ? qRes.data.value[0] : qRes.data;
                const qContactId = qData.ContactId || qData.CreatedContact;
                if (qContactId) {
                    const con = await getContact(qContactId);
                    contactEmail = con?.Email || con?.email || null;
                }
            } catch (e) {}
        }

        if (!contactEmail) return res.status(200).json({ status: 'no_email', orderNumber });

        // 3. Fetch Line Items
        const lines = await getOrderLines(liveOrder.QuoteId || quoteIdInput);
        
        // 4. Transform and Push
        const orderInfo = {
            orderNumber: orderNumber,
            orderDate:   liveOrder.OrderDate || new Date().toISOString(),
            grossValue:  liveOrder.GrossValue || 0,
            netValue:    liveOrder.NetValue || 0,
            currency:    liveOrder.CurrencyCode || 'AUD',
            orderStatus: liveOrder.OrderStatus || 'Placed'
        };

        const result = await pushSaleToInsightData(contactEmail, orderInfo, lines);
        return res.json({ 
            status: result.success ? 'ok' : 'error', 
            contact: contactEmail,
            orderId: orderNumber,
            message: result.error
        });

    } catch (err) {
        console.error('[Sales Handler Exception]:', err.message);
        return res.status(500).json({ status: 'error', message: err.message });
    }
};

module.exports = { handleSalesWebhook };
