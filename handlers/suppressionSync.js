const { getSuppressedContactsSince } = require('../services/dotdigital');
const { syncUnsubscribeToProspect } = require('./dotdigitalWebhook');

// Handler for scheduled suppression sync
const handleSuppressionSync = async (req, res) => {
    try {
        // Default to "since yesterday" if no date provided in query
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        const sinceDateString = req.query.since || yesterday.toISOString();
        
        console.log(`Starting scheduled suppression sync from: ${sinceDateString}`);
        
        const suppressedItems = await getSuppressedContactsSince(sinceDateString);
        
        if (!suppressedItems || suppressedItems.length === 0) {
            console.log('No new suppressed contacts found since last check.');
            return res.status(200).json({ status: 'success', count: 0 });
        }

        console.log(`Found ${suppressedItems.length} suppressed contacts. Starting sync...`);
        
        let successCount = 0;
        for (const item of suppressedItems) {
            const contact = item.suppressedContact;
            if (contact && contact.email) {
                try {
                    await syncUnsubscribeToProspect({ email: contact.email });
                    successCount++;
                } catch (syncErr) {
                    console.error(`Error syncing suppression for ${contact.email}:`, syncErr.message);
                }
            }
        }

        res.status(200).json({ 
            status: 'success', 
            processed: suppressedItems.length,
            synced: successCount 
        });
    } catch (error) {
        console.error('Error in suppression sync handler:', error.message);
        res.status(500).json({ error: 'Failed to run suppression sync' });
    }
};

module.exports = {
    handleSuppressionSync
};
