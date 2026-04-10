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

module.exports = {
    getDotdigitalClient,
    verifyDotdigitalConnection
};
