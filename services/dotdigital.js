const axios = require('axios');

// Configure Dotdigital API client
const getDotdigitalClient = () => {
    return axios.create({
        baseURL: process.env.DOTDIGITAL_BASE_URL ? process.env.DOTDIGITAL_BASE_URL.replace('/v2', '').replace('r1-', 'r3-') : 'https://r3-api.dotdigital.com',
        auth: {
            username: process.env.DOTDIGITAL_USERNAME,
            password: process.env.DOTDIGITAL_PASSWORD
        }
    });
};

// Function: Verify connection to Dotdigital
const verifyDotdigitalConnection = async () => {
    try {
        const client = getDotdigitalClient();
        console.log('Testing Dotdigital connection...');
        const response = await client.get('/account-info');
        console.log('Dotdigital connection successful!');
        return response.data;
    } catch (error) {
        console.error('Dotdigital Connection Error:', error.response?.data || error.message);
        throw new Error('Failed to connect to Dotdigital. Please check your credentials.');
    }
};

// Function: Get contacts suppressed since a specific date
const getSuppressedContactsSince = async (sinceDate) => {
    const client = getDotdigitalClient();
    try {
        console.log(`Polling Dotdigital for contacts suppressed since: ${sinceDate}`);
        // Suppressed-since belongs to v2 API, so we manually ensure /v2 is in the path
        const response = await client.get(`/v2/contacts/suppressed-since/${sinceDate}`);
        return response.data || [];
    } catch (err) {
        console.error('Failed to fetch suppressed contacts:', err.response?.data || err.message);
        return [];
    }
};

module.exports = {
    getDotdigitalClient,
    verifyDotdigitalConnection,
    getSuppressedContactsSince
};
