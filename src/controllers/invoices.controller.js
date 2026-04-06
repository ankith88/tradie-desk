/**
 * Invoices Controller
 *
 *   POST   /api/invoices              — Create and send invoice
 *   GET    /api/invoices              — List all invoices
 *   GET    /api/invoices/:id          — Get single invoice
 *   PUT    /api/invoices/:id/edit     — Edit invoice (versioning + optional re-send)
 *   PATCH  /api/invoices/:id/status   — Mark Paid / Unpaid / Overdue / etc.
 *   PATCH  /api/invoices/:id/reminders — Disable/enable reminders for this invoice
 */

const airtable = require('../services/airtable.service');
const { generateInvoicePDF } = require('../services/pdf.service');
const { sendInvoiceEmail }   = require('../services/email.service');
const xero = require('../services/xero.service');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = `${process.env.BUSINESS_NAME || 'Tradie Desk'} <${process.env.BUSINESS_EMAIL || 'onboarding@resend.dev'}>`;

// ─── Create Invoice ───────────────────────────────────────────────────────────

async function createInvoice(req, res) {
  try {
    const { customerName, customerEmail, customerPhone, jobType, location,
            jobCompletedDate, lineItems, totalExGST, gstAmount, totalIncGST,
            quoteRef, jobRef, saveAsDraft = false } = req.body;

    if (!customerName || !customerEmail || !jobType) {
      return res.status(400).json({ error: 'Missing required fields: customerName, customerEmail, jobType' });
    }

    let exGST  = parseFloat(totalExGST)  || 0;
    let gst    = parseFloat(gstAmount)   || 0;
    let incGST = parseFloat(totalIncGST) || 0;

    if (lineItems && lineItems.length > 0 && exGST === 0) {
      exGST  = lineItems.reduce((s, i) => s + parseFloat(i.amount), 0);
      gst    = exGST * 0.10;
      incGST = exGST + gst;
    }

    // Check for variations total attached to job
    let variationsTotal = 0;
    let hasVariations   = false;
    if (jobRef) {
      const variations = await airtable.getVariationsForJob(jobRef).catch(() => []);
      const approved   = variations.filter(v => v.clientApproved);
      variationsTotal  = approved.reduce((s, v) => s + parseFloat(v.total || 0), 0);
      hasVariations    = approved.length > 0;
    }

    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const issueDate     = new Date().toISOString().split('T')[0];
    const dueDate       = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const version       = 1;

    const invoiceData = {
      invoiceNumber, quoteRef: quoteRef || '', jobRef: jobRef || '',
      customerName, customerEmail, customerPhone: customerPhone || '',
      jobType, location: location || '',
      jobCompletedDate: jobCompletedDate || new Date().toISOString(),
      lineItems: lineItems || [],
      totalExGST: exGST, gstAmount: gst, totalIncGST: incGST,
      issueDate, dueDate, bankDetails: process.env.BUSINESS_BANK_DETAILS,
      version, hasVariations, variationsTotal
    };

    const pdfBuffer = await generateInvoicePDF(invoiceData);
    const status    = saveAsDraft ? 'Draft' : 'Unpaid';

    if (!saveAsDraft) {
      const emailBody = buildInvoiceEmailBody(invoiceData);
      await sendInvoiceEmail(customerEmail, customerName, emailBody, invoiceNumber, pdfBuffer);
    }

    const saved = await airtable.createInvoice({
      invoiceNumber, quoteRef: quoteRef || '', jobRef: jobRef || '',
      customerName, customerEmail, customerPhone: customerPhone || '',
      jobType, location: location || '',
      totalExGST: exGST, gstAmount: gst, totalIncGST: incGST,
      issueDate, dueDate, status,
      version, lastEdited: '',
      viewedDate: '', reminder1SentAt: '', reminder2SentAt: '', reminder3SentAt: '',
      remindersDisabled: false,
      hasVariations, variationsTotal,
      xeroInvoiceId: ''
    });

    // Mark job as Invoiced
    if (jobRef) {
      airtable.updateJob(jobRef, { status: 'Invoiced' }).catch(() => {});
    }

    // Sync to Xero (non-blocking)
    if (!saveAsDraft && xero.getStatus().connected) {
      xero.syncWithLog(
        () => xero.createXeroInvoice({ ...invoiceData, lineItems: invoiceData.lineItems || [] }),
        { action: 'CREATE_INVOICE', entityType: 'Invoice', entityId: invoiceNumber }
      ).then(async xeroInvoiceId => {
        await xero.attachPdfToInvoice(xeroInvoiceId, pdfBuffer, `Invoice-${invoiceNumber}.pdf`);
        await airtable.updateInvoice(saved.id, { xeroInvoiceId });
      }).catch(err => console.warn('[Invoice] Xero sync failed (non-fatal):', err.message));
    }

    res.status(201).json({
      success: true,
      message: saveAsDraft ? `Invoice ${invoiceNumber} saved as draft` : `Invoice ${invoiceNumber} sent to ${customerEmail}`,
      invoice: { id: saved.id, invoiceNumber, totalExGST: exGST, gstAmount: gst, totalIncGST: incGST, dueDate, status, version }
    });
  } catch (err) {
    console.error('[Invoice] Error creating invoice:', err);
    res.status(500).json({ error: err.message });
  }
}

// ─── Edit Invoice ─────────────────────────────────────────────────────────────

async function editInvoice(req, res) {
  try {
    const { id }  = req.params;
    const { lineItems, dueDate, clientNote, sendUpdate = true } = req.body;

    const existing = await airtable.getInvoiceById(id);
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });

    // Recalculate totals from new line items
    const newLineItems = lineItems || JSON.parse(existing.lineItems || '[]');
    const exGST   = newLineItems.reduce((s, i) => s + parseFloat(i.amount), 0);
    const gst     = exGST * 0.10;
    const incGST  = exGST + gst;
    const newVersion = (existing.version || 1) + 1;
    const newDue  = dueDate || existing.dueDate;

    const updatedInvoiceData = {
      ...existing,
      lineItems:    newLineItems,
      totalExGST:   exGST,
      gstAmount:    gst,
      totalIncGST:  incGST,
      dueDate:      newDue,
      version:      newVersion,
      lastEdited:   new Date().toISOString(),
      clientNote:   clientNote || '',
      bankDetails:  process.env.BUSINESS_BANK_DETAILS
    };

    const wasSent = ['Unpaid', 'Overdue', 'Sent'].includes(existing.status);

    // Regenerate PDF with new values
    const pdfBuffer = await generateInvoicePDF(updatedInvoiceData);

    if (wasSent && sendUpdate) {
      const emailBody = `Hi ${existing.customerName},\n\nPlease find an updated version of Invoice ${existing.invoiceNumber} attached (v${newVersion}).\n\n${clientNote ? `Note: ${clientNote}\n\n` : ''}Amount Due: $${incGST.toFixed(2)} AUD (inc GST)\nDue Date: ${newDue}\n\nBank details as per invoice.\n\nThanks,\nSteve\n${process.env.BUSINESS_NAME}`;
      await resend.emails.send({
        from: FROM_EMAIL,
        to:   [existing.customerEmail],
        subject: `Updated Invoice ${existing.invoiceNumber} — ${process.env.BUSINESS_NAME}`,
        text:    emailBody,
        attachments: [{ filename: `Invoice-${existing.invoiceNumber}-v${newVersion}.pdf`, content: pdfBuffer.toString('base64') }]
      });
    }

    const updated = await airtable.updateInvoice(id, {
      totalExGST:  exGST, gstAmount: gst, totalIncGST: incGST,
      dueDate:     newDue, version: newVersion, lastEdited: updatedInvoiceData.lastEdited
    });

    // Sync edit to Xero
    if (existing.xeroInvoiceId && xero.getStatus().connected) {
      xero.syncWithLog(
        () => xero.patchXeroInvoice(existing.xeroInvoiceId, { lineItems: newLineItems, dueDate: newDue }),
        { action: 'PATCH_INVOICE', entityType: 'Invoice', entityId: existing.invoiceNumber }
      ).catch(err => console.warn('[Invoice] Xero patch failed (non-fatal):', err.message));
    }

    res.json({
      success: true,
      emailSent: wasSent && sendUpdate,
      invoice: updated,
      message: wasSent && sendUpdate
        ? `Updated invoice v${newVersion} sent to ${existing.customerEmail}`
        : `Invoice updated (v${newVersion}) — not re-sent`
    });
  } catch (err) {
    console.error('[Invoice] Error editing invoice:', err);
    res.status(500).json({ error: err.message });
  }
}

// ─── Status + Reminder controls ──────────────────────────────────────────────

async function getAllInvoices(req, res) {
  try {
    const invoices = await airtable.getAllInvoices();
    res.json({ invoices });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

async function getInvoice(req, res) {
  try {
    const invoice = await airtable.getInvoiceById(req.params.id);
    res.json({ invoice });
  } catch (err) { res.status(404).json({ error: 'Invoice not found' }); }
}

async function updateInvoiceStatus(req, res) {
  try {
    const { status } = req.body;
    const validStatuses = ['Draft', 'Unpaid', 'Paid', 'Overdue', 'Partially Paid', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }
    const updated = await airtable.updateInvoice(req.params.id, { status });
    res.json({ success: true, invoice: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

async function toggleReminders(req, res) {
  try {
    const { disabled } = req.body;
    const updated = await airtable.updateInvoice(req.params.id, { remindersDisabled: !!disabled });
    res.json({ success: true, invoice: updated, remindersDisabled: !!disabled });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildInvoiceEmailBody({ customerName, invoiceNumber, totalIncGST, dueDate, jobType }) {
  return `Hi ${customerName},

Thank you for choosing ${process.env.BUSINESS_NAME || 'us'} for your recent ${jobType}.

Please find your tax invoice attached (Invoice ${invoiceNumber}).

Amount Due: $${Number(totalIncGST).toFixed(2)} AUD (inc GST)
Payment Due By: ${new Date(dueDate).toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })}

Payment details are included on the invoice. Please use Invoice ${invoiceNumber} as your reference.

If you have any questions, don't hesitate to give us a call.

Thanks again — it was a pleasure working for you.

Steve
${process.env.BUSINESS_NAME || 'Rapid Response Plumbing'}
${process.env.BUSINESS_PHONE || ''}`;
}

module.exports = { createInvoice, editInvoice, getAllInvoices, getInvoice, updateInvoiceStatus, toggleReminders };
