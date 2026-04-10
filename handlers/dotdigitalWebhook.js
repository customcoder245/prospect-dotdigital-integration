const { getProspectClient } = require('../services/prospect');

// Handles incoming webhooks from Dotdigital (e.g., Unsubscribes)
const handleDotdigitalWebhook = async (req, res) => {
    try {
        const payload = req.body;
        console.log('Received Dotdigital Webhook:', JSON.stringify(payload));

        // Dotdigital webhooks can have different structures depending on if it's an Extension or Global Webhook
        const action = payload.action || payload.reason || 'Unsubscribed';
        
        // Extract email dynamically
        let emailToUnsubscribe = null;
        if (payload.suppressedContact && payload.suppressedContact.email) {
            emailToUnsubscribe = payload.suppressedContact.email;
        } else if (payload.email) {
            emailToUnsubscribe = payload.email; // From Program Builder Custom Middleware
        } else if (req.body && req.body.email) {
            emailToUnsubscribe = req.body.email;
        }
        
        if ((action === 'Unsubscribed' || action === 'Suppressed') && emailToUnsubscribe) {
            await syncUnsubscribeToProspect({ email: emailToUnsubscribe });
        }

        // Acknowledge receipt
        res.status(200).json({ status: 'received' });
    } catch (error) {
        console.error('Error processing Dotdigital webhook:', error.message);
        res.status(500).json({ error: 'Failed to process webhook' });
    }
};

const syncUnsubscribeToProspect = async (contactInfo) => {
    const client = getProspectClient();
    
    if (!contactInfo || !contactInfo.email) return;

    console.log(`Syncing unsubscribe for ${contactInfo.email} back to Prospect...`);
    
    try {
        // Step 1: Find the contact in Prospect using OData query
        const queryUrl = `/Contacts?$filter=Email eq '${encodeURIComponent(contactInfo.email)}'`;
        const searchRes = await client.get(queryUrl);
        
        const contacts = searchRes.data.value || searchRes.data;
        if (contacts && contacts.length > 0) {
            const prospectContactId = contacts[0].Id;
            
            // Step 2: Update the record to reflect unsubscribe status
            // Using standard Prospect OData OptIn and Email flags
            await client.patch(`/Contacts(${prospectContactId})`, {
                OptIn: 0,
                EmailFlag: 0
            });
            console.log(`Successfully unsubscribed ${contactInfo.email} in Prospect.`);
        } else {
            console.log(`Contact ${contactInfo.email} not found in Prospect CRM.`);
        }
    } catch (err) {
        console.error('Failed to sync unsubscribe to Prospect:', err.response?.data || err.message);
    }
};

module.exports = {
    handleDotdigitalWebhook
};
