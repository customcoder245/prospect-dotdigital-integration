const axios = require('axios');

// Configure Prospect CRM API client
const getProspectClient = () => {
    return axios.create({
        baseURL: process.env.PROSPECT_BASE_URL || 'https://api.prospectsoft.com/api/v1',
        timeout: 15000, // 15 second timeout to handle slow responses during bulk sync
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
        console.log('Testing Prospect connection...');
        // Calling a safe endpoint just to verify the connection works
        const response = await client.get('/Contacts?$top=1');
        console.log('Prospect connection successful!');
        return { status: "Connected", dataPreview: response.data };
    } catch (error) {
        console.error('Prospect Connection Error:', error.response?.data || error.message);
        throw new Error('Failed to connect to Prospect. Please check your API Token and URL.');
    }
};

// Function: Get a single contact details (using filter for stability)
const getContact = async (id) => {
    const client = getProspectClient();
    const response = await client.get(`/Contacts?$filter=ContactId eq ${id}`);
    return response.data?.value?.[0] || response.data;
};

// Function: Get division/company details (using filter for stability)
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

// Function: Get order lines for a sales order (using QuoteLines table)
const getOrderLines = async (quoteId) => {
    const client = getProspectClient();
    const response = await client.get(
        `/QuoteLines?$filter=QuoteId eq ${quoteId}`
    );
    return response.data.value || [];
};

// Function: Get full Sales Order Header details
const getSalesOrderHeader = async (orderNumber) => {
    const client = getProspectClient();
    const response = await client.get(`/SalesOrderHeaders?$filter=OrderNumber eq '${orderNumber}'`);
    return response.data?.value?.[0] || response.data;
};

// Function: Get Account details
const getAccount = async (id) => {
    const client = getProspectClient();
    const response = await client.get(`/Accounts(AccountsId='${id}')`);
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
    getAccount
};
