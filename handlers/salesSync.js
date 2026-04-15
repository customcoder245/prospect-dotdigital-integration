const { getProspectClient, getOrderLines, getContact } = require('../services/prospect');
const { getDotdigitalClient } = require('../services/dotdigital');

// ─────────────────────────────────────────────
// Push Insight Data to Dotdigital
// ─────────────────────────────────────────────
const pushSaleToInsightData = async (contactEmail, orderInfo, orderLines) => {
    const client = getDotdigitalClient();

    for (const line of orderLines) {
        const sku    = line.ProductCode   || line.StockCode   || line.productCode   || '';
        const lineId = line.OrderLineId   || line.SalesOrderLineId || sku || Math.random().toString(36);
        const key    = `${orderInfo.orderNumber}-${lineId}`;

        const insightJson = {
            orderNumber:        orderInfo.orderNumber,
            orderDate:          orderInfo.orderDate,
            sku:                sku,
            productDescription: line.ProductDescription || line.description || '',
            quantity:           line.Quantity  || line.quantity  || 1,
            unitPrice:          line.UnitPrice || line.unitPrice || 0,
            lineTotal:          line.LineTotal || line.lineTotal || 0,
            orderStatus:        orderInfo.orderStatus,
            totalOrderValue:    orderInfo.grossValue
        };

        try {
            await client.post('/v3/insight-data/records', {
                collectionName: 'Orders',
                contactIdentifier: contactEmail,
                key,
                json: JSON.stringify(insightJson)
            });
            console.log(`✅ Insight pushed: SKU=${sku} | Order=${orderInfo.orderNumber} | Contact=${contactEmail}`);
        } catch (err) {
            console.error(`❌ Failed Insight push [${key}]:`, err.response?.data || err.message);
        }
    }
};

// ─────────────────────────────────────────────
// Main webhook handler for SalesOrderHeader
// NOTE: We process FIRST, then respond.
// Prospect waits up to 30s — this is safe.
// ─────────────────────────────────────────────
const handleSalesWebhook = async (req, res) => {
    try {
        const body   = req.body;
        const entity = body.createdEntity || body.updatedEntity || {};

        const orderNumber = entity.orderNumber || entity.OrderNumber;
        const opco        = entity.operatingCompanyCode || entity.OperatingCompanyCode || 'A';
        // quoteId is the Prospect CRM internal Quote ID — it HAS a ContactId
        const quoteId     = entity.quoteId || entity.QuoteId;

        console.log(`Sales webhook: ${orderNumber} (${opco}), QuoteId=${quoteId}`);

        if (!orderNumber) {
            console.log('No orderNumber in webhook. Skipping.');
            return res.status(200).json({ status: 'skipped', reason: 'no orderNumber' });
        }

        const prospect = getProspectClient();

        // ── Step 1: Get ContactId from the CRM Quote ───────────────────────────
        let contactId = null;

        if (quoteId) {
            try {
                console.log(`[Step 1] Fetching Quote(${quoteId}) for ContactId...`);
                const quoteRes = await prospect.get(`/Quotes(QuoteId=${quoteId})`);
                contactId = quoteRes.data?.ContactId || quoteRes.data?.contactId || null;
                console.log(`[Step 1 OK] ContactId=${contactId}`);
            } catch (e) {
                console.error('[Step 1 Error] Quote lookup failed:', e.message);
            }
        }

        // ── Step 2: Get order data for order info (already retrieved in test) ──
        // We have all order info from the webhook entity — no extra call needed
        const orderInfo = {
            orderNumber: orderNumber,
            orderDate:   entity.orderDate  || entity.OrderDate  || new Date().toISOString(),
            grossValue:  entity.grossValue || entity.GrossValue || 0,
            netValue:    entity.netValue   || entity.NetValue   || 0,
            orderStatus: entity.statusflag || entity.StatusFlag || entity.orderStatus || ''
        };

        // ── Step 3: Get contact email ──────────────────────────────────────────
        let contactEmail = null;
        if (contactId) {
            try {
                console.log(`[Step 3] Fetching Contact(${contactId})...`);
                const contact = await getContact(contactId);
                contactEmail = contact?.Email || contact?.email || null;
                console.log(`[Step 3 OK] Email=${contactEmail}`);
            } catch (e) {
                console.error('[Step 3 Error] Contact lookup failed:', e.message);
            }
        }

        if (!contactEmail) {
            console.log(`⚠️ No email found for order ${orderNumber}. Skipping Dotdigital push.`);
            return res.status(200).json({ status: 'skipped', reason: 'no contact email' });
        }

        if (!contactEmail.includes('@') || !contactEmail.includes('.')) {
            console.log(`⚠️ Invalid email '${contactEmail}'. Skipping.`);
            return res.status(200).json({ status: 'skipped', reason: 'invalid email' });
        }

        // ── Step 4: Get Order Lines (SKUs) ────────────────────────────────────
        console.log(`[Step 4] Fetching order lines for ${orderNumber}...`);
        const orderLines = await getOrderLines(orderNumber, opco);
        console.log(`[Step 4 OK] Found ${orderLines.length} line(s).`);

        if (orderLines.length === 0) {
            return res.status(200).json({ status: 'skipped', reason: 'no order lines' });
        }

        // ── Step 5: Push to Dotdigital Insight Data ────────────────────────────
        await pushSaleToInsightData(contactEmail, orderInfo, orderLines);
        console.log(`✅ Sales sync complete for order ${orderNumber}.`);

        return res.status(200).json({ status: 'ok', order: orderNumber, contact: contactEmail, lines: orderLines.length });

    } catch (err) {
        console.error('Sales Webhook Error:', err.response?.data || err.message);
        return res.status(200).json({ status: 'error', message: err.message });
    }
};

module.exports = { handleSalesWebhook };
