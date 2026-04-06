/**
 * Xero Controller
 *
 *   GET  /api/xero/auth        — Redirect user to Xero consent screen
 *   GET  /api/xero/callback    — Handle OAuth callback, exchange code for tokens
 *   POST /api/xero/disconnect  — Revoke connection, delete saved tokens
 *   GET  /api/xero/status      — Return connection status (for Settings UI)
 *   POST /api/xero/webhook     — Receive Xero webhook events (payment notifications)
 */

const xeroService = require('../services/xero.service');
const airtable    = require('../services/airtable.service');

// ── OAuth ─────────────────────────────────────────────────────────────────────

/**
 * Redirect user to Xero's OAuth consent screen.
 * After approving, Xero redirects back to XERO_REDIRECT_URI.
 */
async function initiateAuth(req, res) {
  try {
    const url = await xeroService.getConsentUrl();
    res.redirect(url);
  } catch (err) {
    console.error('[Xero] Auth initiation failed:', err.message);
    res.status(500).json({ error: 'Failed to build Xero consent URL. Check XERO_CLIENT_ID and XERO_CLIENT_SECRET.' });
  }
}

/**
 * Handle the OAuth callback from Xero.
 * Exchanges the authorisation code for tokens, saves them, then
 * redirects the browser back to the Settings page in the React app.
 */
async function handleCallback(req, res) {
  try {
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const { tenantId, tenantName } = await xeroService.handleOAuthCallback(fullUrl);

    console.log(`[Xero] OAuth complete — connected to: ${tenantName}`);

    // Redirect back to the React settings page with a success flag
    res.redirect('http://localhost:3000?xero=connected&org=' + encodeURIComponent(tenantName));
  } catch (err) {
    console.error('[Xero] OAuth callback failed:', err.message);
    res.redirect('http://localhost:3000?xero=error&msg=' + encodeURIComponent(err.message));
  }
}

/**
 * Disconnect Xero — deletes the saved tokens.
 */
async function disconnectXero(req, res) {
  xeroService.disconnect();
  console.log('[Xero] Disconnected');
  res.json({ success: true, message: 'Xero disconnected successfully.' });
}

/**
 * Return the current Xero connection status.
 * Called by the Settings UI on page load to show Connected / Disconnected badge.
 */
async function getStatus(req, res) {
  const status = xeroService.getStatus();
  res.json(status);
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

/**
 * Handle incoming Xero webhook events.
 *
 * Xero fires webhooks when something changes in your org.
 * We only care about INVOICE UPDATE events where status becomes PAID.
 *
 * When an invoice is paid in Xero:
 *   1. Verify the webhook signature (HMAC-SHA256)
 *   2. Find the matching Tradie Desk invoice via the reference field
 *   3. Update status to 'Paid' in Airtable
 *   4. Cancel pending follow-up reminders (by pre-filling reminder timestamps)
 *
 * IMPORTANT: The webhook route uses express.raw() (not express.json()).
 * The raw body is required for HMAC signature verification.
 */
async function handleWebhook(req, res) {
  const signature = req.headers['x-xero-signature'];
  const rawBody   = req.body; // Buffer (because of express.raw middleware)

  // ── Step 1: Verify signature ───────────────────────────────────────────────
  // Xero also uses this endpoint for "intent to receive" validation on first setup.
  // Invalid signature → 401 (tells Xero this endpoint is not yet ready)
  if (!xeroService.verifyWebhookSignature(rawBody, signature)) {
    console.warn('[Xero Webhook] Signature verification failed');
    return res.status(401).send('Unauthorized');
  }

  // ── Step 2: Parse payload ──────────────────────────────────────────────────
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(200).send('OK'); // empty or malformed — Xero "intent to receive" test
  }

  // Always respond 200 quickly — Xero will retry if we're slow
  res.status(200).send('OK');

  // ── Step 3: Process events asynchronously ─────────────────────────────────
  const events = payload.events || [];
  console.log(`[Xero Webhook] Received ${events.length} event(s)`);

  for (const event of events) {
    // We only care about invoice updates
    if (event.eventCategory !== 'INVOICE' || event.eventType !== 'UPDATE') continue;

    try {
      await processInvoicePaymentEvent(event);
    } catch (err) {
      console.error(`[Xero Webhook] Failed to process event ${event.resourceId}:`, err.message);
    }
  }
}

/**
 * Process a single Xero invoice UPDATE event.
 * Checks if the invoice is now PAID, and if so, updates Airtable.
 */
async function processInvoicePaymentEvent(event) {
  const xeroInvoiceId = event.resourceId;

  // Fetch the full invoice from Xero to check its current status
  const xeroInvoice = await xeroService.getXeroInvoice(xeroInvoiceId);

  if (!xeroInvoice) return;
  if (xeroInvoice.status !== 'PAID') return; // not paid yet — ignore

  // The reference field on the Xero invoice is our invoiceNumber (e.g. "INV-789012")
  const ourInvoiceNumber = xeroInvoice.reference;
  if (!ourInvoiceNumber) {
    console.warn(`[Xero Webhook] Invoice ${xeroInvoiceId} has no reference — cannot match to Tradie Desk`);
    return;
  }

  console.log(`[Xero Webhook] Invoice ${ourInvoiceNumber} marked as PAID in Xero — updating Airtable...`);

  // Find our invoice in Airtable by invoice number
  const allInvoices = await airtable.getAllInvoices();
  const match = allInvoices.find(inv => inv.invoiceNumber === ourInvoiceNumber);

  if (!match) {
    console.warn(`[Xero Webhook] No Airtable invoice found for reference: ${ourInvoiceNumber}`);
    return;
  }

  // Update invoice to Paid + cancel any pending reminders by pre-filling their timestamps
  // The cron job checks for empty reminder timestamps before sending — filling them prevents it
  await airtable.updateInvoice(match.id, {
    status:               'Paid',
    // Pre-fill reminder timestamps to cancel any upcoming reminders for this invoice
    firstReminderSentAt:  match.firstReminderSentAt  || new Date().toISOString(),
    secondReminderSentAt: match.secondReminderSentAt || new Date().toISOString()
  });

  console.log(`[Xero Webhook] ✅ Invoice ${ourInvoiceNumber} → status: Paid, reminders cancelled`);
}

module.exports = { initiateAuth, handleCallback, disconnectXero, getStatus, handleWebhook };
