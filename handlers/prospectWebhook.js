const { getDotdigitalClient } = require('../services/dotdigital');

// Handles incoming webhooks from Prospect CRM
const handleProspectWebhook = async (req, res) => {
    try {
        const payload = req.body;
        console.log('Received Prospect Webhook:', JSON.stringify(payload));

        const action = payload.action || payload.Event;
        const entityType = payload.entityType;
        
        if (entityType === 'Contact') {
            const contactData = payload.updatedEntity || payload.newEntity || payload.entity || payload;
            
            // Prevent infinite loop: skip sync if ONLY EmailFlag/OptIn changed
            // (that means Prospect was updated BY US from a Dotdigital unsubscribe event)
            const updatedFields = payload.updatedFields || [];
            const isOnlyUnsubscribeUpdate = updatedFields.length > 0 &&
                updatedFields.every(f => ['EmailFlag', 'OptIn', 'MailFlag'].includes(f));
            
            if (isOnlyUnsubscribeUpdate) {
                console.log('Skipping Dotdigital sync - unsubscribe-only update to prevent loop.');
            } else {
                await syncContactToDotdigital(contactData);
            }
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
        // Try to create first (POST), if contact already exists use PATCH to update
        await client.post(`/contacts/v3`, dotdigitalContact);
        console.log('Contact created successfully in Dotdigital.');
    } catch (err) {
        if (err.response?.data?.errorCode === 'contacts:identifierConflict') {
            // Contact already exists - update them instead using PATCH by email
            try {
                console.log(`Contact exists, updating via PATCH...`);
                await client.patch(`/contacts/v3/email/${encodeURIComponent(email)}`, {
                    dataFields: dotdigitalContact.dataFields
                });
                console.log('Contact updated successfully in Dotdigital.');
            } catch (patchErr) {
                throw patchErr;
            }
        } else {
            console.error('Failed to sync contact to Dotdigital:', err.response?.data || err.message);
            throw err;
        }
    }
};

const syncSaleToDotdigital = async (saleData) => {
    // Logic for syncing Sales History (Insight Data in Dotdigital)
    console.log(`Syncing sale record to Dotdigital...`, saleData);
    // TODO: Map sale to Dotdigital Insight Data 
};

module.exports = {
    handleProspectWebhook,
    syncContactToDotdigital,
    syncSaleToDotdigital
};
