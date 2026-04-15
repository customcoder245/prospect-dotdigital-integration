const { getProspectClient, getOrderLines } = require('../services/prospect');
const { getDotdigitalClient } = require('../services/dotdigital');

// ─────────────────────────────────────────────
// Push Insight Data (Order + Lines) to Dotdigital
// ─────────────────────────────────────────────
const pushSaleToInsightData = async (contactEmail, orderData, orderLines) => {
    const client = getDotdigitalClient();

    // Build one record per SKU (line item) as Dotdigital expects
    for (const line of orderLines) {
        const insightRecord = {
            key: `${orderData.SalesOrderHeaderId}-${line.SalesOrderLineId}`, // Unique key per line
            contactIdentifier: contactEmail,
            json: {
                orderNumber: orderData.SalesOrderNumber || orderData.SalesOrderHeaderId,
                orderDate: orderData.DateCreated || orderData.DateModified || new Date().toISOString(),
                sku: line.ProductCode || line.StockCode || '',
                productDescription: line.ProductDescription || '',
                quantity: line.Quantity || 1,
                unitPrice: line.UnitPrice || 0,
                lineTotal: line.LineTotal || (line.Quantity * line.UnitPrice) || 0,
                orderStatus: orderData.Status || '',
                totalOrderValue: orderData.TotalValue || orderData.Value || 0
            }
        };

        try {
            // POST to Dotdigital Insight Data — collection name: "Orders"
            await client.post('/v3/insight-data/records', {
                collectionName: 'Orders',
                contactIdentifier: contactEmail,
                key: insightRecord.key,
                json: JSON.stringify(insightRecord.json)
            });
            console.log(`Insight Data pushed for SKU: ${line.ProductCode} | Order: ${orderData.SalesOrderHeaderId}`);
        } catch (err) {
            console.error(`Failed to push Insight Data for line ${line.SalesOrderLineId}:`, err.response?.data || err.message);
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

        // Extract the SalesOrderHeader ID from the webhook payload
        const orderId = body.SalesOrderHeaderId || body.salesOrderHeaderId || body.id;
        if (!orderId) {
            console.log('No SalesOrderHeaderId found in webhook payload. Skipping.');
            return;
        }

        // Fetch full order details from Prospect CRM
        const prospect = getProspectClient();
        const orderResponse = await prospect.get(
            `/SalesOrderHeaders(SalesOrderHeaderId=${orderId})?$expand=Contact`
        );
        const orderData = orderResponse.data;

        // Get the contact email from the expanded Contact data
        const contactEmail = orderData.Contact?.Email || orderData.ContactEmail || orderData.Email;
        if (!contactEmail) {
            console.log(`No email found for order ${orderId}. Skipping Dotdigital sync.`);
            return;
        }

        // Validate email format
        if (!contactEmail.includes('@') || !contactEmail.includes('.')) {
            console.log(`Invalid email '${contactEmail}' for order ${orderId}. Skipping.`);
            return;
        }

        console.log(`Processing sale ${orderId} for contact: ${contactEmail}`);

        // Fetch all order lines (SKUs) for this order
        const orderLines = await getOrderLines(orderId);
        if (!orderLines || orderLines.length === 0) {
            console.log(`No order lines found for order ${orderId}. Skipping.`);
            return;
        }

        console.log(`Found ${orderLines.length} line item(s) for order ${orderId}. Pushing to Dotdigital...`);

        // Push each line item as Insight Data to Dotdigital
        await pushSaleToInsightData(contactEmail, orderData, orderLines);

        console.log(`Sales Insight Data sync complete for order ${orderId}.`);

    } catch (err) {
        console.error('Sales Webhook Error:', err.response?.data || err.message);
    }
};

module.exports = { handleSalesWebhook };
