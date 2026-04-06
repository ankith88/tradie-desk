/**
 * Quotes Controller
 *
 * Handles all quote-related business logic:
 *   POST /api/quotes        — Create a new quote (generates AI email + PDF, sends to customer)
 *   GET  /api/quotes        — List all quotes
 *   GET  /api/quotes/:id    — Get a single quote
 *   PATCH /api/quotes/:id   — Update quote status (e.g. mark as Accepted)
 */

const { v4: uuidv4 } = require('uuid');
const airtable    = require('../services/airtable.service');
const { generateQuoteEmail } = require('../services/openai.service');
const { generateQuotePDF }   = require('../services/pdf.service');
const { sendQuoteEmail }     = require('../services/email.service');
const xero        = require('../services/xero.service');

/**
 * Create a new quote.
 *
 * Workflow:
 * 1. Calculate pricing (ex GST, GST, inc GST)
 * 2. Generate AI-written quote email via GPT-4o
 * 3. Generate a PDF quote
 * 4. Send email with PDF to customer
 * 5. Save everything to Airtable
 * 6. Sync to Xero as a DRAFT quote (if Xero is connected)
 */
async function createQuote(req, res) {
  try {
    const {
      customerName, customerEmail, customerPhone,
      jobType, location, estimatedHours,
      materialsNeeded, materialsCost = 0
    } = req.body;

    // Validate required fields
    if (!customerName || !customerEmail || !jobType || !location || !estimatedHours) {
      return res.status(400).json({ error: 'Missing required fields: customerName, customerEmail, jobType, location, estimatedHours' });
    }

    // ── 1. Calculate pricing ────────────────────────────────────────────────
    const labourRate    = 120; // $120/hr as per business config
    const labourCost    = parseFloat(estimatedHours) * labourRate;
    const materials     = parseFloat(materialsCost) || 0;
    const totalExGST    = labourCost + materials;
    const gstAmount     = totalExGST * 0.10;        // 10% GST
    const totalIncGST   = totalExGST + gstAmount;

    const quoteNumber   = `Q-${Date.now().toString().slice(-6)}`;
    const createdAt     = new Date().toISOString();
    const validUntil    = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    const lineItems = [
      { description: `Labour — ${jobType}`, qty: parseFloat(estimatedHours), unitPrice: labourRate, amount: labourCost }
    ];
    if (materials > 0) {
      lineItems.push({ description: `Materials — ${materialsNeeded}`, qty: 1, unitPrice: materials, amount: materials });
    }

    const quoteData = {
      quoteNumber, customerName, customerEmail, customerPhone,
      jobType, location, estimatedHours: parseFloat(estimatedHours),
      materialsNeeded, lineItems,
      totalExGST, gstAmount, totalIncGST,
      createdAt, validUntil
    };

    // ── 2. Generate AI email ────────────────────────────────────────────────
    console.log(`[Quote] Generating AI email for ${customerName}...`);
    const emailBody = await generateQuoteEmail(quoteData);

    // ── 3. Generate PDF ─────────────────────────────────────────────────────
    console.log(`[Quote] Generating PDF for quote ${quoteNumber}...`);
    const pdfBuffer = await generateQuotePDF(quoteData);

    // ── 4. Send email ───────────────────────────────────────────────────────
    console.log(`[Quote] Sending email to ${customerEmail}...`);
    await sendQuoteEmail(customerEmail, customerName, emailBody, quoteNumber, pdfBuffer);

    // ── 5. Save to Airtable ─────────────────────────────────────────────────
    const savedQuote = await airtable.createQuote({
      quoteNumber,
      customerName,
      customerEmail,
      customerPhone: customerPhone || '',
      jobType,
      location,
      estimatedHours: parseFloat(estimatedHours),
      materialsNeeded: materialsNeeded || '',
      totalExGST,
      gstAmount,
      totalIncGST,
      status: 'Sent',
      emailBody,
      createdAt,
      validUntil,
      followUpSentAt: ''
    });

    console.log(`[Quote] Quote ${quoteNumber} created and sent successfully`);

    // ── 6. Sync to Xero (non-blocking — Xero failure won't break the quote) ─
    // Store the Xero quote ID back in Airtable so we can update it later
    if (xero.getStatus().connected) {
      xero.createXeroQuote({ ...quoteData, lineItems })
        .then(async (xeroQuoteId) => {
          await airtable.updateQuote(savedQuote.id, { xeroQuoteId });
          console.log(`[Quote] Synced to Xero — quoteID: ${xeroQuoteId}`);
        })
        .catch(err => console.warn('[Quote] Xero sync failed (non-fatal):', err.message));
    }

    res.status(201).json({
      success: true,
      message: `Quote ${quoteNumber} sent to ${customerEmail}`,
      quote: {
        id: savedQuote.id,
        quoteNumber,
        customerName,
        customerEmail,
        totalExGST,
        gstAmount,
        totalIncGST,
        status: 'Sent',
        createdAt
      }
    });

  } catch (err) {
    console.error('[Quote] Error creating quote:', err);
    res.status(500).json({ error: err.message });
  }
}

async function getAllQuotes(req, res) {
  try {
    const quotes = await airtable.getAllQuotes();
    res.json({ quotes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getQuote(req, res) {
  try {
    const quote = await airtable.getQuoteById(req.params.id);
    res.json({ quote });
  } catch (err) {
    res.status(404).json({ error: 'Quote not found' });
  }
}

async function updateQuoteStatus(req, res) {
  try {
    const { status } = req.body;
    const validStatuses = ['Sent', 'Followed Up', 'Accepted', 'Rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }
    const updated = await airtable.updateQuote(req.params.id, { status });

    // If quote accepted and we have a Xero quote ID, update its status in Xero too
    if (status === 'Accepted' && updated.xeroQuoteId && xero.getStatus().connected) {
      xero.acceptXeroQuote(updated.xeroQuoteId)
        .then(() => console.log(`[Quote] Xero quote ${updated.xeroQuoteId} → ACCEPTED`))
        .catch(err => console.warn('[Quote] Xero accept failed (non-fatal):', err.message));
    }

    res.json({ success: true, quote: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { createQuote, getAllQuotes, getQuote, updateQuoteStatus };
