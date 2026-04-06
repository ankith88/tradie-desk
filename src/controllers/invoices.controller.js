/**
 * Invoices Controller
 *
 * Generates invoices from completed jobs and sends them to customers.
 *
 *   POST  /api/invoices             — Create and send invoice (from job/quote data)
 *   GET   /api/invoices             — List all invoices
 *   GET   /api/invoices/:id         — Get a single invoice
 *   PATCH /api/invoices/:id/status  — Mark as Paid / Unpaid
 */

const { v4: uuidv4 } = require('uuid');
const airtable   = require('../services/airtable.service');
const { generateInvoicePDF } = require('../services/pdf.service');
const { sendInvoiceEmail }   = require('../services/email.service');
const xero       = require('../services/xero.service');

/**
 * Create and send an invoice.
 *
 * Can be called:
 *  a) Manually from the dashboard when a job is marked complete
 *  b) Automatically from the /demo endpoint
 *
 * Accepts quote data or manual line items.
 */
async function createInvoice(req, res) {
  try {
    const {
      customerName, customerEmail, customerPhone,
      jobType, location, jobCompletedDate,
      lineItems,                           // array of {description, qty, unitPrice, amount}
      totalExGST, gstAmount, totalIncGST,  // can be pre-calculated or derived
      quoteRef, jobRef
    } = req.body;

    if (!customerName || !customerEmail || !jobType) {
      return res.status(400).json({ error: 'Missing required fields: customerName, customerEmail, jobType' });
    }

    // ── Calculate totals if not provided ────────────────────────────────────
    let exGST    = parseFloat(totalExGST)   || 0;
    let gst      = parseFloat(gstAmount)    || 0;
    let incGST   = parseFloat(totalIncGST)  || 0;

    // If line items provided but totals are not, compute them
    if (lineItems && lineItems.length > 0 && exGST === 0) {
      exGST  = lineItems.reduce((sum, item) => sum + parseFloat(item.amount), 0);
      gst    = exGST * 0.10;
      incGST = exGST + gst;
    }

    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const issueDate = new Date().toISOString().split('T')[0];
    const dueDate   = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 14 days

    const invoiceData = {
      invoiceNumber,
      quoteRef: quoteRef || '',
      jobRef: jobRef || '',
      customerName,
      customerEmail,
      customerPhone: customerPhone || '',
      jobType,
      location: location || '',
      jobCompletedDate: jobCompletedDate || new Date().toISOString(),
      lineItems: lineItems || [],
      totalExGST: exGST,
      gstAmount: gst,
      totalIncGST: incGST,
      issueDate,
      dueDate,
      bankDetails: process.env.BUSINESS_BANK_DETAILS
    };

    // ── Generate PDF ─────────────────────────────────────────────────────────
    console.log(`[Invoice] Generating PDF for invoice ${invoiceNumber}...`);
    const pdfBuffer = await generateInvoicePDF(invoiceData);

    // ── Build email body ─────────────────────────────────────────────────────
    const emailBody = buildInvoiceEmailBody(invoiceData);

    // ── Send email ───────────────────────────────────────────────────────────
    console.log(`[Invoice] Sending invoice to ${customerEmail}...`);
    await sendInvoiceEmail(customerEmail, customerName, emailBody, invoiceNumber, pdfBuffer);

    // ── Save to Airtable ─────────────────────────────────────────────────────
    const saved = await airtable.createInvoice({
      invoiceNumber,
      quoteRef: quoteRef || '',
      jobRef: jobRef || '',
      customerName,
      customerEmail,
      customerPhone: customerPhone || '',
      jobType,
      location: location || '',
      totalExGST: exGST,
      gstAmount: gst,
      totalIncGST: incGST,
      issueDate,
      dueDate,
      status: 'Unpaid',
      firstReminderSentAt: '',
      secondReminderSentAt: ''
    });

    console.log(`[Invoice] Invoice ${invoiceNumber} created and sent successfully`);

    // ── Sync to Xero (non-blocking) ────────────────────────────────────────
    // Creates an AUTHORISED invoice in Xero and attaches the PDF to it.
    // The Xero invoice reference is set to our invoiceNumber — webhooks use this
    // to match back when the invoice is paid in Xero.
    if (xero.getStatus().connected) {
      xero.createXeroInvoice({ ...invoiceData, lineItems: invoiceData.lineItems || [] })
        .then(async (xeroInvoiceId) => {
          // Attach our generated PDF to the Xero invoice record
          await xero.attachPdfToInvoice(
            xeroInvoiceId,
            pdfBuffer,
            `Invoice-${invoiceNumber}.pdf`
          );
          // Save the Xero invoice ID back to Airtable for future reference
          await airtable.updateInvoice(saved.id, { xeroInvoiceId });
          console.log(`[Invoice] Synced to Xero — invoiceID: ${xeroInvoiceId}, PDF attached`);
        })
        .catch(err => console.warn('[Invoice] Xero sync failed (non-fatal):', err.message));
    }

    res.status(201).json({
      success: true,
      message: `Invoice ${invoiceNumber} sent to ${customerEmail}`,
      invoice: {
        id: saved.id,
        invoiceNumber,
        customerName,
        totalExGST: exGST,
        gstAmount: gst,
        totalIncGST: incGST,
        dueDate,
        status: 'Unpaid'
      }
    });

  } catch (err) {
    console.error('[Invoice] Error creating invoice:', err);
    res.status(500).json({ error: err.message });
  }
}

async function getAllInvoices(req, res) {
  try {
    const invoices = await airtable.getAllInvoices();
    res.json({ invoices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getInvoice(req, res) {
  try {
    const invoice = await airtable.getInvoiceById(req.params.id);
    res.json({ invoice });
  } catch (err) {
    res.status(404).json({ error: 'Invoice not found' });
  }
}

async function updateInvoiceStatus(req, res) {
  try {
    const { status } = req.body;
    const validStatuses = ['Unpaid', 'Paid', 'Overdue', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }
    const updated = await airtable.updateInvoice(req.params.id, { status });
    res.json({ success: true, invoice: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildInvoiceEmailBody({ customerName, invoiceNumber, totalIncGST, dueDate, jobType }) {
  return `Hi ${customerName},

Thank you for choosing ${process.env.BUSINESS_NAME || 'us'} for your recent ${jobType}.

Please find your tax invoice attached (Invoice ${invoiceNumber}).

Amount Due: $${totalIncGST.toFixed(2)} AUD (inc GST)
Payment Due By: ${new Date(dueDate).toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })}

Payment details are included on the invoice. Please use Invoice ${invoiceNumber} as your reference.

If you have any questions, don't hesitate to give us a call.

Thanks again — it was a pleasure working for you.

Steve
${process.env.BUSINESS_NAME || 'Rapid Response Plumbing'}
${process.env.BUSINESS_PHONE || ''}`;
}

module.exports = { createInvoice, getAllInvoices, getInvoice, updateInvoiceStatus };
