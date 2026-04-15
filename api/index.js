// api/index.js (NUCLEAR VERSION - DIRECT LOGIC)
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.json({ type: 'text/json' }));

// 1. HEALTH + TEST (GOD-MODE)
app.get('/health', async (req, res) => {
  if (req.query.order) {
    try {
        const { handleSalesWebhook } = require('../handlers/salesSync');
        const mockReq = { body: { createdEntity: { orderNumber: req.query.order, quoteId: req.query.quoteId } } };
        const mockRes = { 
            status: (code) => ({ json: (data) => res.status(code).json(data) }),
            json: (data) => res.json(data)
        };
        return handleSalesWebhook(mockReq, mockRes);
    } catch (e) { return res.json({ status: 'error', message: e.message }); }
  }
  res.json({ status: 'ok', source: 'api-index-direct', version: '3.0.0-NUCLEAR' });
});

// Production Webhooks
const { handleProspectWebhook } = require('../handlers/prospectWebhook');
const { handleDotdigitalWebhook } = require('../handlers/dotdigitalWebhook');
const { handleSalesWebhook } = require('../handlers/salesSync');

app.post('/webhook/prospect', handleProspectWebhook);
app.post('/webhook/dotdigital', handleDotdigitalWebhook);
app.post('/webhook/sales', handleSalesWebhook);

// Catch-all for other routes
app.get('/(.*)', (req, res) => {
  res.json({ status: 'ok', note: 'Global catch-all', version: '3.0.0-NUCLEAR' });
});

module.exports = app;
