const { getProspectClient, getOrderLines, getContact, getSalesOrderHeader } = require('../services/prospect');
const { getDotdigitalClient } = require('../services/dotdigital');

// ─────────────────────────────────────────────
// Push Insight Data to Dotdigital
// ─────────────────────────────────────────────
const pushSaleToInsightData = async (contactEmail, orderInfo, orderLines) => {
    const client = getDotdigitalClient();

    // 1. Prepare products array with correct Prospect field names
    const productsArray = orderLines.map(line => ({
        sku:   line.StockCode || line.ProductCode || 'N/A',
        name:  line.Description || line.ProductCode || 'Product',
        price: parseFloat(line.UnitPrice) || 0,
        qty:   parseFloat(line.Quantity) || 1
    }));

    // 2. Prepare Order Record with verified Prospect fields
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
        // v3 PUT endpoint /insightData/v3/contacts/email/{email}/{collection}/{id}
        // Collection "Orders" is already created, skipping creation check to avoid 429s
        await client.put(`/insightData/v3/contacts/email/${contactEmail}/Orders/${orderInfo.orderNumber}`, orderRecord);
        console.log(`✅ Success: Sync complete for ${orderInfo.orderNumber}`);
        return { success: true };
    } catch (e) {
        const errorMsg = e.response?.data?.message || e.response?.data || e.message;
        console.error(`❌ v3 PUT failed:`, errorMsg);
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

        // 1. Fetch FULL Order Header from Prospect
        const liveOrder = await getSalesOrderHeader(orderNumber);
        if (!liveOrder) return res.json({ status: 'order_not_found', orderNumber });

        // 2. Resolve Email
        let contactEmail = null;
        let contactId = liveOrder.ContactId || liveOrder.CreatedContact;
        
        if (contactId) {
            const con = await getContact(contactId);
            contactEmail = con?.Email || con?.email || null;
        }

        // Fallback to Quote if needed
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

        if (!contactEmail) return res.json({ status: 'no_email_found', orderNumber });

        // 3. Fetch Lines
        const actualQuoteId = liveOrder.QuoteId || quoteIdInput;
        const lines = await getOrderLines(actualQuoteId);
        
        // 4. Map verified Prospect fields (GrossValue, NetValue)
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
        return res.json({ status: 'exception', error: err.message });
    }
};

module.exports = { handleSalesWebhook };
