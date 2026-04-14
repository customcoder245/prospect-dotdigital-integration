const { getDotdigitalClient } = require('../services/dotdigital');
const { getContact, getDivision, getAddress, getOrderLines } = require('../services/prospect');

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

        res.status(200).json({ status: 'received' });
    } catch (error) {
        console.error('Error processing Prospect webhook:', error.message);
        res.status(500).json({ error: 'Failed to process webhook' });
    }
};

const syncContactToDotdigital = async (contactData) => {
    const client = getDotdigitalClient();
    const email = contactData.Email || contactData.email;
    if (!email) {
        console.log('No email found in contact data, skipping Dotdigital sync.');
        return;
    }

    // Capture IDs for extra data fetching
    const divisionId = contactData.DivisionId || contactData.divisionId;
    const addressId = contactData.AddressId || contactData.addressId;
    
    let companyName = contactData.CompanyName || contactData.DivisionName || '';
    let addressLine1 = contactData.AddressLine1 || '';
    let addressLine2 = contactData.AddressLine2 || '';
    let town = contactData.Town || '';
    let state = contactData.County || contactData.State || '';
    let postcode = contactData.Postcode || '';

    // If Company name is missing, fetch it
    if (!companyName && divisionId) {
        try {
            const division = await getDivision(divisionId);
            companyName = division.DivisionName;
        } catch (err) {
            console.error('Failed to fetch Division info:', err.message);
        }
    }

    // If Address is missing, fetch it
    if (!addressLine1 && addressId) {
        try {
            const address = await getAddress(addressId);
            addressLine1 = address.AddressLine1;
            addressLine2 = address.AddressLine2;
            town = address.Town;
            state = address.County; 
            postcode = address.Postcode;
        } catch (err) {
            console.error('Failed to fetch Address info:', err.message);
        }
    }

    const dotdigitalContact = {
        identifiers: { email: email },
        dataFields: {
            FIRSTNAME: contactData.Forename || contactData.forename || contactData.Salutation || contactData.salutation || '',
            LASTNAME: contactData.Surname || contactData.surname || '',
            FULLNAME: `${contactData.Forename || contactData.forename || ''} ${contactData.Surname || contactData.surname || ''}`.trim(),
            PHONE: contactData.PhoneNumber || contactData.phoneNumber || '',
            JOBTITLE: contactData.JobTitle || contactData.jobTitle || '',
            DEPARTMENT: contactData.Department || contactData.department || '',
            MOBILEPHONE: contactData.MobilePhoneNumber || contactData.mobilePhoneNumber || '',
            COMPANY: companyName,
            ADDRESS1: addressLine1,
            ADDRESS2: addressLine2,
            TOWN: town,
            STATE: state,
            POSTCODE: postcode,
            INDUSTRY: contactData.IndustryName || contactData.Industry || '',
            ACCOUNTMANAGER: contactData.AccountManagerName || contactData.AccountManager || ''
        }
    };

    console.log(`Syncing contact ${email} to Dotdigital v3...`);
    
    try {
        await client.post(`/contacts/v3`, dotdigitalContact);
        console.log('Contact created successfully in Dotdigital.');
    } catch (err) {
        if (err.response?.data?.errorCode === 'contacts:identifierConflict') {
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
    try {
        const orderId = saleData.SalesOrderHeaderId || saleData.salesOrderHeaderId;
        const contactId = saleData.ContactId || saleData.contactId;

        if (!orderId || !contactId) return;

        const contact = await getContact(contactId);
        const email = contact.Email || contact.email;
        if (!email) return;

        const lines = await getOrderLines(orderId);
        const skus = lines.map(line => line.ProductCode || line.productCode || 'Unknown').join(', ');

        const insightData = {
            key: orderId.toString(),
            json: {
                orderNumber: saleData.OrderNumber || saleData.orderNumber || orderId.toString(),
                orderDate: saleData.DateReceived || saleData.dateReceived || new Date().toISOString(),
                orderValue: saleData.EstimatedTotalAmount || saleData.estimatedTotalAmount || 0,
                status: saleData.Status || saleData.status || 'Won',
                skus: skus,
                productCount: lines.length,
                closedDate: saleData.DateClosed || saleData.StatusChanged || new Date().toISOString()
            }
        };

        const dotdigital = getDotdigitalClient();
        console.log(`Syncing Sale ${insightData.key} for ${email} to Dotdigital Insight Data (Orders)...`);
        
        await dotdigital.post(`/v2/contacts/${encodeURIComponent(email)}/insight/Orders`, insightData);
        console.log('Sale successfully synced to Dotdigital Insight Data.');
    } catch (error) {
        console.error('Failed to sync sale to Dotdigital:', error.response?.data || error.message);
    }
};

module.exports = {
    handleProspectWebhook,
    syncContactToDotdigital,
    syncSaleToDotdigital
};
