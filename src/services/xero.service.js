/**
 * Xero Service
 *
 * Handles all Xero integration:
 *   - OAuth 2.0 connect / token refresh / disconnect
 *   - Token persistence (stored in .xero-tokens.json, gitignored)
 *   - Contact creation in Xero
 *   - Quote creation (DRAFT) and status updates (ACCEPTED)
 *   - Invoice creation (AUTHORISED) with PDF attachment
 *   - Dynamic GST tax rate lookup (not hardcoded)
 *   - Webhook signature verification
 *
 * All Xero API calls are wrapped in try/catch.
 * A failed Xero sync NEVER breaks the main quote/invoice flow.
 */

const { XeroClient } = require('xero-node');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Token file ─────────────────────────────────────────────────────────────────
// Stores access_token, refresh_token, expiry, and tenant_id across server restarts.
// This file is gitignored — it never gets committed.
const TOKEN_FILE = path.join(__dirname, '../../.xero-tokens.json');

// ── Xero scopes needed ─────────────────────────────────────────────────────────
const SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',          // enables refresh tokens
  'accounting.transactions', // quotes + invoices
  'accounting.settings',     // tax rates
  'accounting.contacts',     // create/find contacts
  'accounting.attachments',  // attach PDFs to invoices
];

// ── Tax rate cache ─────────────────────────────────────────────────────────────
// Fetched once from Xero and cached for 1 hour to avoid repeated API calls.
let taxRateCache = null;
let taxRateCacheExpiry = 0;

// ─────────────────────────────────────────────────────────────────────────────
//  Token Persistence
// ─────────────────────────────────────────────────────────────────────────────

function saveTokens(tokenSet, tenantId) {
  const data = {
    access_token:  tokenSet.access_token,
    refresh_token: tokenSet.refresh_token,
    expires_at:    Date.now() + (tokenSet.expires_in || 1800) * 1000, // Xero tokens last 30 mins
    id_token:      tokenSet.id_token || null,
    tenant_id:     tenantId
  };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
}

function loadTokens() {
  try {
    if (!fs.existsSync(TOKEN_FILE)) return null;
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function clearTokens() {
  try { fs.unlinkSync(TOKEN_FILE); } catch { /* already gone */ }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Xero Client Factory
//  Returns a fully initialised XeroClient with valid tokens.
//  Automatically refreshes if the token is within 60 seconds of expiry.
// ─────────────────────────────────────────────────────────────────────────────

function buildClient() {
  return new XeroClient({
    clientId:     process.env.XERO_CLIENT_ID,
    clientSecret: process.env.XERO_CLIENT_SECRET,
    redirectUris: [process.env.XERO_REDIRECT_URI],
    scopes:       SCOPES,
  });
}

/**
 * Get a ready-to-use XeroClient with a valid access token.
 * Throws if not connected or if refresh fails.
 */
async function getClient() {
  const tokens = loadTokens();
  if (!tokens) throw new Error('Xero is not connected. Please connect via Settings → Xero.');

  const xero = buildClient();

  // Restore saved token set into the client
  xero.setTokenSet({
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    id_token:      tokens.id_token,
    expires_in:    Math.max(0, Math.floor((tokens.expires_at - Date.now()) / 1000))
  });

  // Refresh if token expires within the next 60 seconds
  const expiresInMs = tokens.expires_at - Date.now();
  if (expiresInMs < 60_000) {
    console.log('[Xero] Token expiring soon — refreshing...');
    const newTokenSet = await xero.refreshWithRefreshToken(
      process.env.XERO_CLIENT_ID,
      process.env.XERO_CLIENT_SECRET,
      tokens.refresh_token
    );
    saveTokens(newTokenSet, tokens.tenant_id);
    xero.setTokenSet(newTokenSet);
  }

  return { xero, tenantId: tokens.tenant_id };
}

// ─────────────────────────────────────────────────────────────────────────────
//  OAuth Flow
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the Xero consent URL to redirect the user to.
 */
async function getConsentUrl() {
  const xero = buildClient();
  const url  = await xero.buildConsentUrl();
  return url;
}

/**
 * Handle the OAuth callback. Exchange the authorisation code for tokens,
 * save them to disk, and return the connection info.
 *
 * @param {string} callbackUrl - The full callback URL including ?code=&state=
 */
async function handleOAuthCallback(callbackUrl) {
  const xero = buildClient();

  // Exchange code for token set
  const tokenSet = await xero.apiCallback(callbackUrl);
  xero.setTokenSet(tokenSet);

  // Get the list of Xero organisations this user has access to
  await xero.updateTenants();

  if (!xero.tenants || xero.tenants.length === 0) {
    throw new Error('No Xero organisations found for this account.');
  }

  // Use the first organisation (most businesses only have one)
  const tenantId = xero.tenants[0].tenantId;
  const tenantName = xero.tenants[0].tenantName;

  saveTokens(tokenSet, tenantId);

  console.log(`[Xero] Connected to organisation: ${tenantName} (${tenantId})`);
  return { tenantId, tenantName };
}

/**
 * Disconnect Xero — wipes saved tokens.
 */
function disconnect() {
  clearTokens();
  taxRateCache   = null;
  taxRateCacheExpiry = 0;
}

/**
 * Return the current connection status.
 */
function getStatus() {
  const tokens = loadTokens();
  if (!tokens) return { connected: false };

  const expiresInMs = tokens.expires_at - Date.now();
  const expired = expiresInMs < 0 && !tokens.refresh_token;

  return {
    connected:   true,
    expired,
    tenantId:    tokens.tenant_id,
    expiresAt:   new Date(tokens.expires_at).toISOString(),
    hasRefreshToken: !!tokens.refresh_token
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tax Rates (Dynamic — fetched from Xero, cached 1 hour)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch tax rates from Xero and return the GST rate object.
 * Caches results for 1 hour to avoid repeated API calls.
 *
 * @returns {{ taxType: string, rate: number }} e.g. { taxType: 'OUTPUT2', rate: 10 }
 */
async function getGSTTaxRate() {
  // Return cached version if still fresh
  if (taxRateCache && Date.now() < taxRateCacheExpiry) {
    return taxRateCache;
  }

  const { xero, tenantId } = await getClient();
  const response = await xero.accountingApi.getTaxRates(tenantId);
  const taxRates = response.body.taxRates || [];

  // Find the active tax rate closest to 10% (Australian GST)
  // Filter out zero-rated and exempt types
  const gstRate = taxRates
    .filter(r => r.status === 'ACTIVE' && r.effectiveRate > 0)
    .sort((a, b) => Math.abs(a.effectiveRate - 10) - Math.abs(b.effectiveRate - 10))[0];

  if (!gstRate) {
    throw new Error('No active GST tax rate found in Xero. Please set up your tax rates in Xero.');
  }

  const result = {
    taxType: gstRate.taxType,
    rate:    gstRate.effectiveRate,
    name:    gstRate.name
  };

  // Cache for 1 hour
  taxRateCache       = result;
  taxRateCacheExpiry = Date.now() + 60 * 60 * 1000;

  console.log(`[Xero] Using tax rate: ${result.name} (${result.taxType}) @ ${result.rate}%`);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Contacts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a Xero contact from customer data.
 * For the MVP, we create a new contact each time.
 * In production, you'd search first to avoid duplicates.
 *
 * @returns {string} Xero contactID
 */
async function findOrCreateContact({ customerName, customerEmail, customerPhone }) {
  const { xero, tenantId } = await getClient();

  // Search for existing contact by email to avoid duplicates
  try {
    const search = await xero.accountingApi.getContacts(
      tenantId,
      undefined,                        // ifModifiedSince
      `EmailAddress="${customerEmail}"`, // where clause
      undefined, undefined, undefined,
      false, true                       // includeArchived=false, summaryOnly=true
    );
    const existing = search.body.contacts;
    if (existing && existing.length > 0) {
      console.log(`[Xero] Found existing contact: ${existing[0].name} (${existing[0].contactID})`);
      return existing[0].contactID;
    }
  } catch (searchErr) {
    // Search failed — fall through to create
    console.warn('[Xero] Contact search failed, creating new:', searchErr.message);
  }

  // Create new contact
  const response = await xero.accountingApi.createContacts(tenantId, {
    contacts: [{
      name:         customerName,
      emailAddress: customerEmail || undefined,
      phones: customerPhone ? [{
        phoneType:   'DEFAULT',
        phoneNumber: customerPhone
      }] : []
    }]
  });

  const contact = response.body.contacts[0];
  console.log(`[Xero] Created contact: ${contact.name} (${contact.contactID})`);
  return contact.contactID;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Quotes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a DRAFT quote in Xero matching a Tradie Desk quote.
 *
 * @param {Object} quoteData - from quotes.controller.js
 * @returns {string} Xero quoteID
 */
async function createXeroQuote(quoteData) {
  const { xero, tenantId } = await getClient();
  const taxRate    = await getGSTTaxRate();
  const contactId  = await findOrCreateContact(quoteData);

  // Map Tradie Desk line items → Xero line items
  // unitAmount is ex-GST; Xero calculates GST automatically from taxType
  const lineItems = quoteData.lineItems.map(item => ({
    description: item.description,
    quantity:    item.qty,
    unitAmount:  parseFloat(item.unitPrice),
    taxType:     taxRate.taxType,
    accountCode: '200',  // Revenue / Sales account — adjust to your chart of accounts
  }));

  const response = await xero.accountingApi.createQuotes(tenantId, {
    quotes: [{
      quoteNumber:  quoteData.quoteNumber,
      contact:      { contactID: contactId },
      lineItems,
      status:       'DRAFT',
      expiryDate:   quoteData.validUntil ? new Date(quoteData.validUntil) : undefined,
      currencyCode: 'AUD',
      title:        `Quote — ${quoteData.jobType}`,
      summary:      `${quoteData.jobType} at ${quoteData.location}`,
    }]
  });

  const xeroQuote = response.body.quotes[0];
  console.log(`[Xero] Created DRAFT quote: ${xeroQuote.quoteID} (ref: ${quoteData.quoteNumber})`);
  return xeroQuote.quoteID;
}

/**
 * Update a Xero quote status to ACCEPTED.
 *
 * @param {string} xeroQuoteId - the Xero quoteID (stored in Airtable)
 */
async function acceptXeroQuote(xeroQuoteId) {
  const { xero, tenantId } = await getClient();

  await xero.accountingApi.updateQuote(tenantId, xeroQuoteId, {
    quotes: [{ quoteID: xeroQuoteId, status: 'ACCEPTED' }]
  });

  console.log(`[Xero] Quote ${xeroQuoteId} marked as ACCEPTED`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Invoices
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an AUTHORISED invoice in Xero.
 * Sets the reference to our invoiceNumber so webhooks can match it back.
 *
 * @param {Object} invoiceData - from invoices.controller.js
 * @returns {string} Xero invoiceID
 */
async function createXeroInvoice(invoiceData) {
  const { xero, tenantId } = await getClient();
  const taxRate   = await getGSTTaxRate();
  const contactId = await findOrCreateContact(invoiceData);

  const lineItems = invoiceData.lineItems.map(item => ({
    description: item.description,
    quantity:    item.qty,
    unitAmount:  parseFloat(item.unitPrice),
    taxType:     taxRate.taxType,
    accountCode: '200',
  }));

  const response = await xero.accountingApi.createInvoices(tenantId, {
    invoices: [{
      type:         'ACCREC', // Accounts Receivable (invoice to customer)
      contact:      { contactID: contactId },
      lineItems,
      dueDate:      new Date(invoiceData.dueDate),
      reference:    invoiceData.invoiceNumber, // used by webhook to match back
      currencyCode: 'AUD',
      status:       'AUTHORISED', // appears as "Awaiting Payment" in Xero
    }]
  });

  const xeroInvoice = response.body.invoices[0];
  console.log(`[Xero] Created AUTHORISED invoice: ${xeroInvoice.invoiceID} (ref: ${invoiceData.invoiceNumber})`);
  return xeroInvoice.invoiceID;
}

/**
 * Attach the generated PDF to a Xero invoice record.
 * This means the PDF shows up directly inside Xero when viewing the invoice.
 *
 * @param {string} xeroInvoiceId - Xero invoiceID
 * @param {Buffer} pdfBuffer - the generated PDF
 * @param {string} filename - e.g. "Invoice-INV-123456.pdf"
 */
async function attachPdfToInvoice(xeroInvoiceId, pdfBuffer, filename) {
  const { xero, tenantId } = await getClient();

  await xero.accountingApi.createInvoiceAttachmentByFileName(
    tenantId,
    xeroInvoiceId,
    filename,
    false,      // includeOnline — don't expose via Xero's online invoice link
    pdfBuffer,
    { headers: { 'Content-Type': 'application/pdf' } }
  );

  console.log(`[Xero] Attached PDF "${filename}" to invoice ${xeroInvoiceId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Webhook Signature Verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify a Xero webhook payload using HMAC-SHA256.
 *
 * Xero signs each webhook request with your XERO_WEBHOOK_KEY.
 * If the signature doesn't match, the request should be rejected with 401.
 *
 * @param {Buffer} rawBody - raw request body (must NOT be JSON-parsed)
 * @param {string} xeroSignature - value of 'x-xero-signature' header
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, xeroSignature) {
  if (!process.env.XERO_WEBHOOK_KEY) {
    console.warn('[Xero] XERO_WEBHOOK_KEY not set — skipping webhook verification');
    return true; // skip in development
  }
  const hmac      = crypto.createHmac('sha256', process.env.XERO_WEBHOOK_KEY);
  const computed  = hmac.update(rawBody).digest('base64');
  return computed === xeroSignature;
}

/**
 * Fetch a Xero invoice by its ID and return its reference (our invoiceNumber)
 * and payment status. Used by the webhook handler.
 */
async function getXeroInvoice(xeroInvoiceId) {
  const { xero, tenantId } = await getClient();
  const response = await xero.accountingApi.getInvoice(tenantId, xeroInvoiceId);
  return response.body.invoices[0];
}

module.exports = {
  getConsentUrl,
  handleOAuthCallback,
  disconnect,
  getStatus,
  getGSTTaxRate,
  findOrCreateContact,
  createXeroQuote,
  acceptXeroQuote,
  createXeroInvoice,
  attachPdfToInvoice,
  verifyWebhookSignature,
  getXeroInvoice
};
