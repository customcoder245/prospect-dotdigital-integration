const axios = require('axios');
const { getProspectClient } = require('../services/prospect');
const { syncContactToDotdigital } = require('./prospectWebhook');

// Handler for bulk syncing all Prospect contacts to Dotdigital
const handleBulkSync = async (req, res) => {
    try {
        const client = getProspectClient();
        console.log('Starting Bulk Sync from Prospect to Dotdigital...');
        
        // Fetch all active contacts from Prospect
        // We can add a filter here if needed, e.g., $filter=DateOriginallyCreated ge 2025-07-01T00:00:00Z
        const response = await client.get('/Contacts?$filter=StatusFlag eq \'A\'');
        const contacts = response.data.value || [];
        
        console.log(`Found ${contacts.length} active contacts in Prospect. Starting batch processing...`);
        
        let successCount = 0;
        let failCount = 0;

        // Process in small batches to avoid hitting rate limits
        for (const contact of contacts) {
            try {
                await syncContactToDotdigital(contact);
                successCount++;
            } catch (err) {
                console.error(`Failed to sync contact ${contact.Email}:`, err.message);
                failCount++;
            }
        }

        res.json({
            status: 'success',
            totalFound: contacts.length,
            successfullySynced: successCount,
            failed: failCount
        });
    } catch (error) {
        console.error('Bulk Sync Error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

module.exports = {
    handleBulkSync
};
