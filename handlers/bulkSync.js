const axios = require('axios');
const { getProspectClient } = require('../services/prospect');
const { syncContactToDotdigital } = require('./prospectWebhook');

// Handler for bulk syncing all Prospect contacts to Dotdigital
const handleBulkSync = async (req, res) => {
    try {
        // Support pagination for batch processing
        const skip = parseInt(req.query.skip) || 0;
        const top = parseInt(req.query.top) || 20; // Default to 20 to avoid timeouts
        
        const client = getProspectClient();
        console.log(`Starting Bulk Sync from Prospect to Dotdigital (Skip: ${skip}, Top: ${top})...`);
        
        // Fetch active contacts with pagination to avoid timeouts
        const response = await client.get(`/Contacts?$filter=StatusFlag eq 'A'&$skip=${skip}&$top=${top}&$orderby=DateOriginallyCreated desc`);
        const contacts = response.data.value || [];
        
        console.log(`Found ${contacts.length} active contacts in this batch. Starting batch processing...`);
        
        // Function to create a delay
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        
        let successCount = 0;
        let failCount = 0;

        // Process in small batches to avoid hitting rate limits
        for (const contact of contacts) {
            try {
                // Add a delay (1000ms) between each request to prevent 429 errors
                // since we also fetch Address and Company details now.
                await sleep(1000); 
                
                await syncContactToDotdigital(contact);
                successCount++;
            } catch (err) {
                console.error(`Failed to sync contact ${contact.Email}:`, err.message);
                failCount++;
            }
        }

        res.json({
            status: 'success',
            batch: { skip, top },
            processed: contacts.length,
            successfullySynced: successCount,
            failed: failCount,
            nextBatchUrl: contacts.length === top ? `https://${req.get('host')}/sync/bulk-prospect?skip=${skip + top}&top=${top}` : "All items in range processed"
        });
    } catch (error) {
        console.error('Bulk Sync Error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

module.exports = {
    handleBulkSync
};
