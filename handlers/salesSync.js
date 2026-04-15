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

        if (!orderNumber) return res.json({ status: 'no_order' });

        const prospect = getProspectClient();
        console.log(`Processing Order: ${orderNumber}`);

        // 1. Fetch the full order to get the correct IDs
        const orderRes = await prospect.get(`/SalesOrderHeaders?$filter=OrderNumber eq '${orderNumber}' and OperatingCompanyCode eq '${opco}'`);
        const orderData = orderRes.data?.value?.[0];

        if (!orderData) {
            console.log(`Order ${orderNumber} not found.`);
            return res.json({ status: 'not_found' });
        }

        // 2. Find the email using the AccountsId (most reliable ID)
        const targetId = orderData.AccountsId || orderData.DivisionId || orderData.ContactId;
        console.log(`Looking for email using ID: ${targetId}`);

        let contactEmail = null;
        
        // 1. Try ContactId
        if (contactId) {
            try {
                const con = await getContact(contactId);
                contactEmail = con?.Email || con?.email;
            } catch (e) {}
        }

        // 2. Try searching Contacts by AccountsId (very reliable)
        if (!contactEmail && targetId) {
            try {
                console.log(`[Step 3] Searching Contacts for AccountsId: ${targetId}`);
                const searchRes = await prospect.get(`/Contacts?$filter=AccountsId eq '${targetId}'`);
                const matched = searchRes.data?.value?.[0];
                contactEmail = matched?.Email || matched?.email;
                if (contactEmail) console.log(`[Step 3 OK] Found email via Contact Search: ${contactEmail}`);
            } catch (e) { console.log(`Search error: ${e.message}`); }
        }

        // 3. Try DivisionId fallback
        if (!contactEmail && targetId) {
            try {
                const div = await getDivision(targetId);
                contactEmail = div?.Email || div?.ContactEmail;
            } catch (e) {}
        }

        if (!contactEmail) {
            console.log(`Could not find email for ID ${targetId}`);
            return res.json({ status: 'no_email' });
        }

        // 3. Get Lines and Push
        const orderLines = await getOrderLines(orderNumber, opco);
        const orderInfo  = {
            orderNumber,
            orderDate:   orderData.OrderDate || new Date().toISOString(),
            grossValue:  orderData.GrossValue || 0,
            orderStatus: orderData.OrderStatus || 'Placed'
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
