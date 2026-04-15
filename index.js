// index.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.json({ type: 'text/json' }));

// 1. THE ULTIMATE SURVIVAL ROUTE (Health + Test)
app.get('/health', async (req, res) => {
  // If order is provided, run the sync!
  if (req.query.order) {
    const { handleSalesWebhook } = require('./handlers/salesSync');
    const mockReq = { 
        body: { 
            createdEntity: { 
                orderNumber: req.query.order, 
                operatingCompanyCode: 'A', 
                quoteId: req.query.quoteId 
            } 
        } 
    };
    const mockRes = { 
        status: (code) => ({ json: (data) => res.status(code).json(data) }),
        json: (data) => res.json(data)
    };
    return handleSalesWebhook(mockReq, mockRes);
  }
  // Otherwise, just show health
  res.json({ status: 'ok', version: '2.0.0-GOD-MODE' });
});

// Import API services & Webhook Handlers
const { verifyProspectConnection } = require('./services/prospect');
const { verifyDotdigitalConnection } = require('./services/dotdigital');
const { handleProspectWebhook } = require('./handlers/prospectWebhook');
const { handleDotdigitalWebhook } = require('./handlers/dotdigitalWebhook');
const { handleSuppressionSync } = require('./handlers/suppressionSync');
const { handleBulkSync } = require('./handlers/bulkSync');
const { handleSalesWebhook } = require('./handlers/salesSync');

// Webhook Endpoints
app.post('/webhook/prospect', handleProspectWebhook);
app.post('/webhook/dotdigital', handleDotdigitalWebhook);
app.post('/webhook/sales', handleSalesWebhook);

// Scheduled/Manual Sync Endpoints
app.get('/sync/suppressed', handleSuppressionSync);
app.get('/sync/bulk-prospect', handleBulkSync);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(\`Server running on port \${PORT}\`); });
module.exports = app;
