const { getProspectClient } = require('../services/prospect');
const { syncContactToDotdigital } = require('./prospectWebhook');

// Handler for manual batch sync
const handleBulkSync = async (req, res) => {
    try {
        const skip = parseInt(req.query.skip) || 0;
        const top = parseInt(req.query.top) || 100;
        
        const prospect = getProspectClient();
        console.log(`Starting Batch Sync: Skip ${skip}, Top ${top}...`);

        // 1. Fetch contacts with expanded details in ONE call 
        const prospectResponse = await prospect.get(`/Contacts?$filter=StatusFlag eq 'A'&$skip=${skip}&$top=${top}&$expand=Division,MainAddress&$orderby=DateOriginallyCreated desc`);
        const contacts = prospectResponse.data.value || [];
        
        console.log(`Found ${contacts.length} contacts for this batch. Starting...`);

        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        let successCount = 0;
        let failCount = 0;

        // 2. Process sequentially with 500ms delay
        for (const contact of contacts) {
            try {
                // Add a small delay to avoid 429
                await sleep(500); 
                
                // Note: syncContactToDotdigital is smart enough to use the expanded data
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
            nextBatchUrl: contacts.length === top ? `https://${req.get('host')}/sync/bulk-prospect?skip=${skip + top}&top=${top}` : "Finished"
        });

    } catch (error) {
        console.error('Batch Sync Error:', error.response?.data || error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

module.exports = {
    handleBulkSync
};
