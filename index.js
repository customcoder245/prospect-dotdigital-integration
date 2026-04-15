// index.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.json({ type: 'text/json' }));

// Health Check
app.get('/health', async (req, res) => {
  if (req.query.order) {
    const { handleSalesWebhook } = require('./handlers/salesSync');
    const mockReq = { body: { createdEntity: { orderNumber: req.query.order, quoteId: req.query.quoteId } } };
    const mockRes = { 
        status: (code) => ({ json: (data) => res.status(code).json(data) }),
        json: (data) => res.json(data)
    };
    return handleSalesWebhook(mockReq, mockRes);
  }
  res.json({ status: 'ok', version: '4.0.0-FIX' });
});

// Import handlers
const { handleProspectWebhook } = require('./handlers/prospectWebhook');
const { handleDotdigitalWebhook } = require('./handlers/dotdigitalWebhook');
const { handleSalesWebhook } = require('./handlers/salesSync');

// Webhook Endpoints
app.post('/webhook/prospect', handleProspectWebhook);
app.post('/webhook/dotdigital', handleDotdigitalWebhook);
app.post('/webhook/sales', handleSalesWebhook);

// Export for Vercel
module.exports = app;
