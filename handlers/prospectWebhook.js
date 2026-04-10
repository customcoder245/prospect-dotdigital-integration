const { getDotdigitalClient } = require('../services/dotdigital');

// Handles incoming webhooks from Prospect CRM
const handleProspectWebhook = async (req, res) => {
    try {
        const payload = req.body;
        console.log('Received Prospect Webhook:', JSON.stringify(payload));

        // Prospect Webhooks typically send the event type and entity details
        // We will parse the payload to determine if it's a contact or sale
        
        // Example check (this will need adjustment based on the exact Prospect payload structure)
        const eventType = payload.eventType || payload.Event;
        
        if (eventType === 'ContactCreated' || eventType === 'ContactUpdated') {
            await syncContactToDotdigital(payload.data);
        } else if (eventType === 'SaleCompleted' || eventType === 'OrderCreated') {
            await syncSaleToDotdigital(payload.data);
        }

        // Always return 200 OK to acknowledge receipt of the webhook quickly
        res.status(200).json({ status: 'received' });
    } catch (error) {
        console.error('Error processing Prospect webhook:', error.message);
        res.status(500).json({ error: 'Failed to process webhook' });
    }
};

const syncContactToDotdigital = async (contactData) => {
    const client = getDotdigitalClient();
    
    // Map Prospect data fields to Dotdigital schema
    const dotdigitalContact = {
        email: contactData.Email,
        optInType: contactData.OptIn === 1 ? 'VerifiedDouble' : 'Single',
        emailType: 'Html',
        dataFields: [
            { key: 'FIRSTNAME', value: contactData.Forename || contactData.Salutation || '' },
            { key: 'LASTNAME', value: contactData.Surname || '' },
            { key: 'FULLNAME', value: `${contactData.Forename || ''} ${contactData.Surname || ''}`.trim() },
            { key: 'PHONE', value: contactData.PhoneNumber || '' },
            { key: 'MOBILEPHONE', value: contactData.MobilePhoneNumber || '' },
            { key: 'JOBTITLE', value: contactData.JobTitle || '' },
            { key: 'DEPARTMENT', value: contactData.Department || '' }
        ]
    };

    console.log(`Syncing contact ${dotdigitalContact.email} to Dotdigital...`);
    
    try {
        // Send to Dotdigital API
        await client.post('/contacts', dotdigitalContact);
        console.log('Contact synced successfully');
    } catch (err) {
        console.error('Failed to sync contact to Dotdigital:', err.response?.data || err.message);
    }
};

const syncSaleToDotdigital = async (saleData) => {
    // Logic for syncing Sales History (Insight Data in Dotdigital)
    console.log(`Syncing sale record to Dotdigital...`, saleData);
    // TODO: Map sale to Dotdigital Insight Data 
};

module.exports = {
    handleProspectWebhook
};
