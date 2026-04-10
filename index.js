// index.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();

app.use(bodyParser.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Import API services
const { verifyProspectConnection } = require('./services/prospect');
const { verifyDotdigitalConnection } = require('./services/dotdigital');

// Endpoint: Test API Connections
app.get('/test-connections', async (req, res) => {
  try {
      // Test Dotdigital
      const dotdigitalTest = await verifyDotdigitalConnection();
      
      // Test Prospect
      const prospectTest = await verifyProspectConnection();

      res.json({
          status: 'success',
          message: 'Successfully connected to both APIs Data Sources',
          connections: {
              prospect: 'Connected',
              dotdigital: 'Connected'
          }
      });
  } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
  }
});

// Import Webhook Handlers
const { handleProspectWebhook } = require('./handlers/prospectWebhook');
const { handleDotdigitalWebhook } = require('./handlers/dotdigitalWebhook');

// Webhook Endpoints
app.post('/webhook/prospect', handleProspectWebhook);
app.post('/webhook/dotdigital', handleDotdigitalWebhook);

module.exports = app;

// Only listen locally if run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
  });
}
