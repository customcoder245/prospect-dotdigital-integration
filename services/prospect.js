const axios = require('axios');

// Configure Prospect CRM API client
const getProspectClient = () => {
    return axios.create({
        baseURL: process.env.PROSPECT_BASE_URL || 'https://api.prospectsoft.com/api/v1',
        timeout: 15000,
        headers: {
            'Authorization': `Bearer ${process.env.PROSPECT_API_TOKEN}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    });
};

// Function: Verify connection to Prospect
const verifyProspectConnection = async () => {
    try {
        const client = getProspectClient();
        const response = await client.get('/Contacts?$top=1');
        return { status: "Connected", dataPreview: response.data };
    } catch (error) {
        throw new Error('Failed to connect to Prospect.');
    }
};

// Function: Get a single contact details
const getContact = async (id) => {
    const client = getProspectClient();
    const response = await client.get(`/Contacts?$filter=ContactId eq ${id}`);
    return response.data?.value?.[0] || response.data;
};

// Function: Get division/company details
const getDivision = async (id) => {
    const client = getProspectClient();
    const filter = (typeof id === 'string' && id.includes('-')) ? `DivisionId eq '${id}'` : `DivisionId eq ${id}`;
    const response = await client.get(`/Divisions?$filter=${filter}`);
    return response.data?.value?.[0] || response.data;
};

// Function: Get address details
const getAddress = async (id) => {
    const client = getProspectClient();
    const response = await client.get(`/Addresses(AddressId=${id})`);
    return response.data;
};

// Function: Get order lines
const getOrderLines = async (quoteId) => {
    const client = getProspectClient();
    const response = await client.get(`/QuoteLines?$filter=QuoteId eq ${quoteId}`);
    return response.data.value || [];
};

// Function: Get full Sales Order Header details
const getSalesOrderHeader = async (orderNumber) => {
    const client = getProspectClient();
    const response = await client.get(`/SalesOrderHeaders?$filter=OrderNumber eq '${orderNumber}'`);
    return response.data?.value?.[0] || response.data;
};

// Function: Get Unleashed Contact/Account Record (The missing link!)
const getUnleashedContact = async (opCode, accountsId) => {
    const client = getProspectClient();
    // Format: /UnleashedContacts('A', 'GUID')
    const response = await client.get(`/UnleashedContacts('${opCode}', '${accountsId}')`);
    return response.data;
};

module.exports = {
    getProspectClient,
    verifyProspectConnection,
    getContact,
    getDivision,
    getAddress,
    getOrderLines,
    getSalesOrderHeader,
    getUnleashedContact
};
