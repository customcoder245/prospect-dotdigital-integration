const { getProspectClient } = require('../services/prospect');
const { getDotdigitalClient } = require('../services/dotdigital');

// Handler for high-performance bulk sync
const handleBulkSync = async (req, res) => {
    try {
        const prospect = getProspectClient();
        const dotdigital = getDotdigitalClient();
        
        console.log('Starting high-performance Bulk Sync...');

        // 1. Fetch ALL active contacts with Company and Address expanded in ONE call
        // This is much faster than fetching them one by one.
        const prospectResponse = await prospect.get('/Contacts?$filter=StatusFlag eq \'A\'&$expand=Division,MainAddress');
        const contacts = prospectResponse.data.value || [];
        
        console.log(`Found ${contacts.length} contacts. Formatting for bulk import...`);

        // 2. Format contacts for Dotdigital v2 Bulk Import
        const formattedContacts = contacts.map(c => {
            const email = c.Email || c.email;
            if (!email) return null;

            return {
                email: email,
                optInType: 'Unknown',
                emailType: 'Html',
                dataFields: {
                    FIRSTNAME: c.Forename || c.Salutation || '',
                    LASTNAME: c.Surname || '',
                    FULLNAME: `${c.Forename || ''} ${c.Surname || ''}`.trim(),
                    PHONE: c.PhoneNumber || '',
                    JOBTITLE: c.JobTitle || '',
                    DEPARTMENT: c.Department || '',
                    MOBILEPHONE: c.MobilePhoneNumber || '',
                    COMPANY: c.Division?.DivisionName || '',
                    ADDRESS1: c.MainAddress?.AddressLine1 || '',
                    ADDRESS2: c.MainAddress?.AddressLine2 || '',
                    TOWN: c.MainAddress?.Town || '',
                    STATE: c.MainAddress?.County || '',
                    POSTCODE: c.MainAddress?.Postcode || '',
                    INDUSTRY: c.IndustryName || '',
                    ACCOUNTMANAGER: c.AccountManagerName || ''
                }
            };
        }).filter(c => c !== null);

        // 3. Send to Dotdigital v2 Bulk Import (Handles up to 50,000 contacts at once)
        console.log(`Sending ${formattedContacts.length} contacts to Dotdigital Bulk Import...`);
        const ddResponse = await dotdigital.post('/v2/contacts/import', formattedContacts);

        res.json({
            status: 'success',
            message: 'Bulk import task created in Dotdigital.',
            contactsProcessed: formattedContacts.length,
            importId: ddResponse.data.id
        });

    } catch (error) {
        console.error('Bulk Sync Error:', error.response?.data || error.message);
        res.status(500).json({ 
            status: 'error', 
            message: error.message,
            details: error.response?.data
        });
    }
};

module.exports = {
    handleBulkSync
};
