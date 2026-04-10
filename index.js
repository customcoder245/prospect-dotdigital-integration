// index.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();

app.use(bodyParser.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Future webhook endpoints will be added here
// app.post('/webhook/prospect', prospectHandler);
// app.post('/webhook/dotdigital', dotdigitalHandler);

module.exports = app;

// Only listen locally if run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
  });
}
