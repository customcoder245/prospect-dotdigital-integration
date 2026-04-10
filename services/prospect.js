const axios = require('axios');

// Configure Prospect CRM API client
const getProspectClient = () => {
    return axios.create({
        baseURL: process.env.PROSPECT_BASE_URL || 'https://api.prospectsoft.com/api/v1',
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

module.exports = {
    getProspectClient,
    verifyProspectConnection
};
