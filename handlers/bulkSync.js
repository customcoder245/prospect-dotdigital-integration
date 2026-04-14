const { getProspectClient } = require('../services/prospect');
const { syncContactToDotdigital } = require('./prospectWebhook');

// Handler for manual batch sync following OData patterns
const handleBulkSync = async (req, res) => {
    try {
        // Reduced batch size to 10 to allow for a slower delay (to avoid 429 from Prospect)
        // 10 contacts * 1 second delay = 10 seconds (Perfect for Vercel)
        const skip = parseInt(req.query.skip, 10) || 0;
        const top = parseInt(req.query.top, 10) || 10; 
        
        const prospect = getProspectClient();
        console.log(`Starting Batch Sync: Skip ${skip}, Top ${top}...`);

        // 1. Fetch contacts with expanded details (Division, MainAddress)
        const prospectUrl = `/Contacts?$top=${top}&$skip=${skip}&$filter=StatusFlag eq 'A'&$expand=Division,MainAddress&$orderby=DateOriginallyCreated desc`;
        const prospectResponse = await prospect.get(prospectUrl);
        let contacts = prospectResponse.data.value || [];
        
        // Safety: Strict slice to ensure we never over-run the batch
        if (contacts.length > top) {
            contacts = contacts.slice(0, top);
        }
        
        console.log(`Starting sync for ${contacts.length} contacts...`);

        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        let successCount = 0;
        let failCount = 0;

        // 2. Process sequentially with safety delay
        for (const contact of contacts) {
            try {
                // 1000ms delay per contact (Total 10s for 10 contacts)
                await sleep(1000); 
                await syncContactToDotdigital(contact);
                successCount++;
            } catch (err) {
                console.error(`Failed to sync contact ${contact.Email}:`, err.message);
                failCount++;
            }
        }

        // 3. Return progress and the URL for the next batch
        const nextSkip = skip + top;
        const host = req.get('host');
        const protocol = req.protocol;
        
        res.json({
            status: 'success',
            batchRange: `${skip} to ${skip + contacts.length}`,
            contactsProcessed: contacts.length,
            successfullySynced: successCount,
            failed: failCount,
            nextBatchUrl: contacts.length === top 
                ? `${protocol}://${host}/sync/bulk-prospect?skip=${nextSkip}&top=${top}` 
                : "All active contacts processed."
        });

    } catch (error) {
        console.error('Batch Sync Error:', error.response?.data || error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

module.exports = {
    handleBulkSync
};
