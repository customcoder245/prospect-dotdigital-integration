const { getProspectClient, getOrderLines, getContact, getSalesOrderHeader } = require('../services/prospect');
const { getDotdigitalClient } = require('../services/dotdigital');

// ─────────────────────────────────────────────
// Push Insight Data to Dotdigital
// ─────────────────────────────────────────────
const pushSaleToInsightData = async (contactEmail, orderInfo, orderLines) => {
    const client = getDotdigitalClient();

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
        console.log(`✅ Success: Sent Order ${orderInfo.orderNumber} to ${contactEmail}`);
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

        // 2. Aggressive Email Resolution
        let contactEmail = null;
        
        // Try ContactId from Live Order
        const contactId = liveOrder.ContactId || liveOrder.CreatedContact;
        if (contactId) {
            const con = await getContact(contactId);
            contactEmail = con?.Email || con?.email || null;
        }

        // Try QuoteId fallback if email still missing
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

        // Final verification
        if (!contactEmail) {
            return res.json({ 
                status: 'no_email_found', 
                orderNumber, 
                diagnostics: {
                    orderContactId: contactId,
                    orderQuoteId: liveOrder.QuoteId
                }
            });
        }

        // 3. Fetch Order Lines
        const actualQuoteId = liveOrder.QuoteId || quoteIdInput;
        const lines = await getOrderLines(actualQuoteId);
        
        // 4. Transform for Dotdigital
        const orderInfo = {
            orderNumber: orderNumber,
            orderDate:   liveOrder.OrderDate || new Date().toISOString(),
            grossValue:  liveOrder.GrossTotal || 0,
            netValue:    liveOrder.NetTotal || 0,
            currency:    liveOrder.CurrencyCode || 'AUD',
            orderStatus: liveOrder.OrderStatusDescription || 'Processed'
        };

        const result = await pushSaleToInsightData(contactEmail, orderInfo, lines);
        return res.json({ 
            status: result.success ? 'ok' : 'error', 
            contact: contactEmail,
            orderId: orderNumber,
            message: result.error
        });

    } catch (err) {
        console.error('Sales Sync Exception:', err.message);
        return res.json({ status: 'exception', error: err.message });
    }
};

module.exports = { handleSalesWebhook };
