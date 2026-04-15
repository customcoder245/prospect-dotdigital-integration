const { getProspectClient, getOrderLines, getContact, getDivision } = require('../services/prospect');
const { getDotdigitalClient } = require('../services/dotdigital');

// ─────────────────────────────────────────────
// Push Insight Data (Order + Lines) to Dotdigital
// ─────────────────────────────────────────────
const pushSaleToInsightData = async (contactEmail, orderInfo, orderLines) => {
    const client = getDotdigitalClient();

    for (const line of orderLines) {
        const sku = line.ProductCode || line.StockCode || line.productCode || '';
        const lineRef = line.OrderLineId || line.SalesOrderLineId || line.lineId || sku || Math.random().toString(36);
        const uniqueKey = `${orderInfo.orderNumber}-${lineRef}`;

        const insightJson = {
            orderNumber:       orderInfo.orderNumber,
            orderDate:         orderInfo.orderDate,
            sku:               sku,
            productDescription: line.ProductDescription || line.description || '',
            quantity:          line.Quantity || line.quantity || 1,
            unitPrice:         line.UnitPrice || line.unitPrice || 0,
            lineTotal:         line.LineTotal || line.lineTotal || 0,
            orderStatus:       orderInfo.orderStatus,
            totalOrderValue:   orderInfo.grossValue
        };

        try {
            await client.post('/v3/insight-data/records', {
                collectionName: 'Orders',
                contactIdentifier: contactEmail,
                key: uniqueKey,
                json: JSON.stringify(insightJson)
            });
            console.log(`✅ Insight Data pushed: SKU=${sku} | Order=${orderInfo.orderNumber} | Contact=${contactEmail}`);
        } catch (err) {
            console.error(`❌ Failed to push Insight Data [${uniqueKey}]:`, err.response?.data || err.message);
        }
    }
};

// ─────────────────────────────────────────────
// Resolve contact email from ContactId or DivisionId
// ─────────────────────────────────────────────
const resolveContactEmail = async (contactId, divisionId) => {
    // Try ContactId first
    if (contactId) {
        try {
            const contact = await getContact(contactId);
            if (contact?.Email) {
                console.log(`Found email via ContactId ${contactId}: ${contact.Email}`);
                return contact.Email;
            }
        } catch (e) {
            console.error(`Failed to fetch Contact(${contactId}):`, e.message);
        }
    }

    // Try DivisionId as fallback
    if (divisionId) {
        try {
            const division = await getDivision(divisionId);
            const email = division?.Email || division?.ContactEmail;
            if (email) {
                console.log(`Found email via DivisionId ${divisionId}: ${email}`);
                return email;
            }
        } catch (e) {
            console.error(`Failed to fetch Division(${divisionId}):`, e.message);
        }
    }

    return null;
};

// ─────────────────────────────────────────────
// Main webhook handler for SalesOrderHeader
// ─────────────────────────────────────────────
const handleSalesWebhook = async (req, res) => {
    // Acknowledge webhook immediately to prevent Prospect from retrying
    res.status(200).json({ status: 'received' });

    try {
        const body = req.body;
        console.log('Sales webhook received. Entity type:', body.entityType);

        // All key data is already in the createdEntity — no extra order API call needed
        const entity = body.createdEntity || body.updatedEntity || {};

        const orderNumber = entity.orderNumber || entity.OrderNumber;
        const opco       = entity.operatingCompanyCode || entity.OperatingCompanyCode || 'A';

        if (!orderNumber) {
            console.log('No orderNumber found in webhook payload. Skipping.');
            return;
        }

        console.log(`Processing sale: ${orderNumber} (${opco})`);

        // Build order info from webhook payload (avoid extra API call)
        const orderInfo = {
            orderNumber:  orderNumber,
            orderDate:    entity.orderDate   || entity.OrderDate   || new Date().toISOString(),
            grossValue:   entity.grossValue  || entity.GrossValue  || 0,
            netValue:     entity.netValue    || entity.NetValue    || 0,
            orderStatus:  entity.statusflag  || entity.StatusFlag  || entity.orderStatus || ''
        };

        // Get contact email
        const contactId  = entity.contactId  || entity.ContactId  || null;
        const divisionId = entity.divisionId || entity.DivisionId || null;
        const contactEmail = await resolveContactEmail(contactId, divisionId);

        if (!contactEmail) {
            console.log(`⚠️ No contact email found for order ${orderNumber} (ContactId=${contactId}, DivisionId=${divisionId}). Skipping.`);
            return;
        }

        // Validate email
        if (!contactEmail.includes('@') || !contactEmail.includes('.')) {
            console.log(`⚠️ Invalid email '${contactEmail}' for order ${orderNumber}. Skipping.`);
            return;
        }

        // Fetch order lines (SKUs) — filtered by OrderNumber + OperatingCompanyCode
        const orderLines = await getOrderLines(orderNumber, opco);
        if (!orderLines || orderLines.length === 0) {
            console.log(`⚠️ No order lines found for order ${orderNumber}. Skipping.`);
            return;
        }

        console.log(`Found ${orderLines.length} line item(s) for order ${orderNumber}. Pushing to Dotdigital...`);

        // Push each line as Insight Data
        await pushSaleToInsightData(contactEmail, orderInfo, orderLines);

        console.log(`✅ Sales sync complete for order ${orderNumber}.`);

    } catch (err) {
        console.error('Sales Webhook Error:', err.response?.data || err.message);
    }
};

module.exports = { handleSalesWebhook };
