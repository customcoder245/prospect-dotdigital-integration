const { getDotdigitalClient } = require('../services/dotdigital');

// Handles incoming webhooks from Prospect CRM
const handleProspectWebhook = async (req, res) => {
    try {
        const payload = req.body;
        console.log('Received Prospect Webhook:', JSON.stringify(payload));

        const action = payload.action || payload.Event;
        const entityType = payload.entityType;
        
        if (entityType === 'Contact') {
            // Webhooks use updatedEntity for modifications and typically newEntity/entity for creation
            const contactData = payload.updatedEntity || payload.newEntity || payload.entity || payload;
            await syncContactToDotdigital(contactData);
        } else if (entityType === 'SalesOrderHeader') {
            const saleData = payload.updatedEntity || payload.newEntity || payload.entity || payload;
            await syncSaleToDotdigital(saleData);
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
    
    // Map Prospect data fields to Dotdigital schema (support both camelCase and PascalCase)
    const email = contactData.Email || contactData.email;
    if (!email) {
        console.log('No email found in contact data, skipping Dotdigital sync.');
        return;
    }

    const dotdigitalContact = {
        identifiers: {
            email: email
        },
        dataFields: {
            FIRSTNAME: contactData.Forename || contactData.forename || contactData.Salutation || contactData.salutation || '',
            LASTNAME: contactData.Surname || contactData.surname || '',
            FULLNAME: `${contactData.Forename || contactData.forename || ''} ${contactData.Surname || contactData.surname || ''}`.trim(),
            PHONE: contactData.PhoneNumber || contactData.phoneNumber || '',
            JOBTITLE: contactData.JobTitle || contactData.jobTitle || '',
            DEPARTMENT: contactData.Department || contactData.department || '',
            MOBILEPHONE: contactData.MobilePhoneNumber || contactData.mobilePhoneNumber || ''
        }
    };

    console.log(`Syncing contact ${email} to Dotdigital v3...`);
    
    try {
        // Send to Dotdigital v3 API
        await client.post(`/contacts/v3`, dotdigitalContact);
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
