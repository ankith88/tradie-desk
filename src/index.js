/**
 * Tradie Desk — Main Server Entry Point
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());

// Xero webhook needs raw body for HMAC verification — must come BEFORE express.json()
app.use('/api/xero/webhook', express.raw({ type: '*/*' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/quotes',     require('./routes/quotes.routes'));
app.use('/api/jobs',       require('./routes/jobs.routes'));
app.use('/api/invoices',   require('./routes/invoices.routes'));
app.use('/api/variations', require('./routes/variations.routes'));
app.use('/api/jobnotes',   require('./routes/jobnotes.routes'));
app.use('/api/demo',       require('./routes/demo.routes'));
app.use('/api/xero',       require('./routes/xero.routes'));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', business: process.env.BUSINESS_NAME || 'Tradie Desk' });
});

// ─── Serve React frontend in production ──────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// ─── Start background automation cron jobs ───────────────────────────────────
require('./services/cron.service');

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const xeroStatus = require('./services/xero.service').getStatus();
  console.log(`\n🔧 Tradie Desk server running on http://localhost:${PORT}`);
  console.log(`📋 Business: ${process.env.BUSINESS_NAME || 'Not configured'}`);
  console.log(`🤖 OpenAI:   ${process.env.OPENAI_API_KEY ? 'Connected' : '⚠️  Missing key'}`);
  console.log(`📧 Resend:   ${process.env.RESEND_API_KEY ? 'Connected' : '⚠️  Missing key'}`);
  console.log(`🗄️  Airtable: ${process.env.AIRTABLE_API_KEY ? 'Connected' : '⚠️  Missing key'}`);
  console.log(`🟢 Xero:     ${xeroStatus.connected ? `Connected (tenant: ${xeroStatus.tenantId})` : 'Not connected — visit /settings to connect'}\n`);
});
