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

        // Build basic order info from webhook payload
        const orderInfo = {
            orderNumber:  orderNumber,
            orderDate:    entity.orderDate  || entity.OrderDate  || new Date().toISOString(),
            grossValue:   entity.grossValue || entity.GrossValue || 0,
            netValue:     entity.netValue   || entity.NetValue   || 0,
            orderStatus:  entity.statusflag || entity.StatusFlag || entity.orderStatus || ''
        };

        // The webhook createdEntity does NOT include ContactId/DivisionId.
        // We must fetch the full order record from Prospect to get them.
        const prospect = getProspectClient();
        let contactId  = entity.contactId  || entity.ContactId  || null;
        let divisionId = entity.divisionId || entity.DivisionId || null;

        if (!contactId && !divisionId) {
            try {
                const orderNum = entity.orderNumber || entity.OrderNumber;
                const opco = entity.operatingCompanyCode || entity.OperatingCompanyCode || 'A';
                const fetchUrl = `/SalesOrderHeaders?$filter=OperatingCompanyCode eq '${opco}' and OrderNumber eq '${orderNum}'`;
                
                console.log(`[Step 1] Attempting fetch: ${fetchUrl}`);
                let orderRes;
                
                try {
                    orderRes = await prospect.get(fetchUrl);
                } catch (e) {
                    if (body.entityODataLink) {
                        console.log(`[Step 1 Fallback] Trying direct link: ${body.entityODataLink}`);
                        orderRes = await prospect.get(body.entityODataLink);
                    } else { throw e; }
                }

                const orderRows = orderRes.data?.value ? orderRes.data.value : [orderRes.data];
                
                if (orderRows.length > 0 && orderRows[0]) {
                    contactId  = orderRows[0].ContactId  || orderRows[0].contactId  || null;
                    divisionId = orderRows[0].DivisionId || orderRows[0].divisionId || null;
                    console.log(`[Step 3] Order IDs found: ContactId=${contactId}, DivisionId=${divisionId}`);
                } else {
                    console.log(`[Step 3] No order rows found.`);
                }
            } catch (fetchErr) {
                console.error('[Step 2 Error] Could not fetch order through any method:', fetchErr.message);
                return;
            }
        }

        console.log('[Step 4] Starting email resolution...');
        const contactEmail = await resolveContactEmail(contactId, divisionId);

        if (!contactEmail) {
            console.log(`[Step 5 Fallback] No contact email found for Order ${orderNumber}.`);
            return;
        }

        console.log(`[Step 6] Email resolved: ${contactEmail}. Fetching Order Lines...`);
        
        try {
            const orderLines = await getOrderLines(orderNumber, opco);
            console.log(`[Step 7] Found ${orderLines.length} line item(s). Pushing to Dotdigital...`);
            
            if (orderLines.length > 0) {
                await pushSaleToInsightData(contactEmail, orderInfo, orderLines);
                console.log(`✅ [Step 8] Sales sync complete for order ${orderNumber}.`);
            }
        } catch (lineErr) {
            console.error('[Step 7 Error] Failed to fetch order lines:', lineErr.message);
        }

    } catch (err) {
        console.error('Sales Webhook Error:', err.response?.data || err.message);
    }
};

module.exports = { handleSalesWebhook };
