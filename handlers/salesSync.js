const { getProspectClient, getOrderLines } = require('../services/prospect');
const { getDotdigitalClient } = require('../services/dotdigital');

// ─────────────────────────────────────────────
// Push Insight Data (Order + Lines) to Dotdigital
// ─────────────────────────────────────────────
const pushSaleToInsightData = async (contactEmail, orderData, orderLines) => {
    const client = getDotdigitalClient();

    // Build one record per SKU (line item) as Dotdigital expects
    // Using orderNumber as part of the key since Prospect uses composite keys
    for (const line of orderLines) {
        const orderNum = orderData.OrderNumber || orderData.orderNumber || orderData.SalesOrderHeaderId || 'unknown';
        const lineId = line.OrderLineId || line.SalesOrderLineId || line.lineId || Math.random();
        const uniqueKey = `${orderNum}-${lineId}`;

        const insightJson = {
            orderNumber: orderNum,
            orderDate: orderData.OrderDate || orderData.orderDate || orderData.DateCreated || new Date().toISOString(),
            sku: line.ProductCode || line.StockCode || line.productCode || '',
            productDescription: line.ProductDescription || line.description || '',
            quantity: line.Quantity || line.quantity || 1,
            unitPrice: line.UnitPrice || line.unitPrice || 0,
            lineTotal: line.LineTotal || line.lineTotal || (line.Quantity * line.UnitPrice) || 0,
            orderStatus: orderData.OrderStatus || orderData.statusflag || orderData.Status || '',
            totalOrderValue: orderData.GrossValue || orderData.grossValue || orderData.TotalValue || 0
        };

        try {
            // POST to Dotdigital Insight Data — collection name: "Orders"
            await client.post('/v3/insight-data/records', {
                collectionName: 'Orders',
                contactIdentifier: contactEmail,
                key: uniqueKey,
                json: JSON.stringify(insightJson)
            });
            console.log(`Insight Data pushed for SKU: ${insightJson.sku} | Order: ${orderNum}`);
        } catch (err) {
            console.error(`Failed to push Insight Data for line ${uniqueKey}:`, err.response?.data || err.message);
        }
    }
};

// ─────────────────────────────────────────────
// Main webhook handler for SalesOrderHeader
// ─────────────────────────────────────────────
const handleSalesWebhook = async (req, res) => {
    // Acknowledge webhook immediately to prevent Prospect from retrying
    res.status(200).json({ status: 'received' });

    try {
        const body = req.body;
        console.log('Sales webhook received:', JSON.stringify(body));

        // Extraction Logic: Look inside createdEntity or updatedEntity
        // In Prospect, 'quoteId' is often the field used for the SalesOrderHeaderId
        const entity = body.createdEntity || body.updatedEntity || {};
        const orderId = entity.quoteId || entity.SalesOrderHeaderId || body.SalesOrderHeaderId || body.id;

        if (!orderId) {
            console.log('No SalesOrderHeaderId or quoteId found in webhook payload. Skipping.');
            return;
        }

        // Fetch full order details using the direct OData link from the webhook
        // Note: $expand=Contact is NOT used as it may not be supported on all endpoints
        const prospect = getProspectClient();
        let orderData;

        try {
            let orderResponse;
            if (body.entityODataLink) {
                console.log(`Fetching order from: ${body.entityODataLink}`);
                orderResponse = await prospect.get(body.entityODataLink);
            } else {
                const orderNumber = entity.orderNumber || entity.OrderNumber;
                const opco = entity.operatingCompanyCode || entity.OperatingCompanyCode || 'A';
                orderResponse = await prospect.get(
                    `/SalesOrderHeaders(OperatingCompanyCode=${opco},OrderNumber=${orderNumber})`
                );
            }
            orderData = orderResponse.data;
            console.log('Order data fetched successfully. Keys:', Object.keys(orderData).join(', '));
        } catch (fetchErr) {
            console.error('Failed to fetch order details:', fetchErr.response?.data || fetchErr.message);
            return;
        }

        // Try to get contact email from order, then Contact, then Division
        let contactEmail = orderData.Email || orderData.ContactEmail;

        if (!contactEmail && orderData.ContactId) {
            try {
                const { getContact } = require('../services/prospect');
                const contact = await getContact(orderData.ContactId);
                contactEmail = contact.Email;
                console.log(`Found email via ContactId: ${contactEmail}`);
            } catch (e) {
                console.error('Failed to fetch Contact:', e.message);
            }
        }

        if (!contactEmail && orderData.DivisionId) {
            try {
                const { getDivision } = require('../services/prospect');
                const division = await getDivision(orderData.DivisionId);
                contactEmail = division.Email || division.ContactEmail;
                console.log(`Found email via DivisionId: ${contactEmail}`);
            } catch (e) {
                console.error('Failed to fetch Division:', e.message);
            }
        }

        if (!contactEmail) {
            console.log(`No email found for order ${orderId}. OrderData keys: ${Object.keys(orderData).join(', ')}`);
            return;
        }

        // Validate email format
        if (!contactEmail.includes('@') || !contactEmail.includes('.')) {
            console.log(`Invalid email '${contactEmail}' for order. Skipping.`);
            return;
        }

        console.log(`Processing sale ${orderId} for contact: ${contactEmail}`);

        // Fetch all order lines (SKUs) using the orderNumber (composite key system)
        const orderNumber = orderData.OrderNumber || orderData.orderNumber || entity.orderNumber;
        const opco = orderData.OperatingCompanyCode || orderData.operatingCompanyCode || entity.operatingCompanyCode || 'A';
        const orderLines = await getOrderLines(orderNumber, opco);
        if (!orderLines || orderLines.length === 0) {
            console.log(`No order lines found for order ${orderNumber}. Skipping.`);
            return;
        }

        console.log(`Found ${orderLines.length} line item(s) for order ${orderNumber}. Pushing to Dotdigital...`);

        // Push each line item as Insight Data to Dotdigital
        await pushSaleToInsightData(contactEmail, orderData, orderLines);

        console.log(`Sales Insight Data sync complete for order ${orderId}.`);

    } catch (err) {
        console.error('Sales Webhook Error:', err.response?.data || err.message);
    }
};

module.exports = { handleSalesWebhook };
