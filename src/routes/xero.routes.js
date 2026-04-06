/**
 * Xero Routes
 *
 * Note on /webhook:
 *   This route requires the raw request body for HMAC signature verification.
 *   express.raw() is applied BEFORE express.json() in index.js for this path.
 *   Do NOT move the webhook route after the global express.json() middleware.
 */

const express = require('express');
const router  = express.Router();
const {
  initiateAuth,
  handleCallback,
  disconnectXero,
  getStatus,
  handleWebhook
} = require('../controllers/xero.controller');

router.get('/auth',       initiateAuth);    // Redirect to Xero consent screen
router.get('/callback',   handleCallback);  // OAuth code exchange (Xero redirects here)
router.post('/disconnect',disconnectXero);  // Clear saved tokens
router.get('/status',     getStatus);       // Connection status for UI

// Webhook — raw body required (mounted with express.raw in index.js)
router.post('/webhook',   handleWebhook);

module.exports = router;
