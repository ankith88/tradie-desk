/**
 * Quotes Controller
 *
 *   POST   /api/quotes              — Create quote (AI email + PDF + Airtable + Xero)
 *   GET    /api/quotes              — List all quotes
 *   GET    /api/quotes/:id          — Get a single quote
 *   PATCH  /api/quotes/:id          — Update status
 *   PUT    /api/quotes/:id/edit     — Edit quote fields (versioning + conditional re-send)
 *   GET    /api/quotes/:id/history  — Get all versions of this quote
 *   POST   /api/quotes/:id/restore  — Restore a previous version
 */

const airtable = require('../services/airtable.service');
const { generateQuoteEmail, generateUpdatedQuoteEmail, generateReApprovalEmail } = require('../services/openai.service');
const { generateQuotePDF } = require('../services/pdf.service');
const { sendQuoteEmail } = require('../services/email.service');
const xero = require('../services/xero.service');

const LABOUR_RATE = 120;

// ─── Create Quote ─────────────────────────────────────────────────────────────

async function createQuote(req, res) {
  try {
    const { customerName, customerEmail, customerPhone, jobType, location,
            estimatedHours, materialsNeeded, materialsCost = 0 } = req.body;

    if (!customerName || !customerEmail || !jobType || !location || !estimatedHours) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const labourCost  = parseFloat(estimatedHours) * LABOUR_RATE;
    const materials   = parseFloat(materialsCost) || 0;
    const totalExGST  = labourCost + materials;
    const gstAmount   = totalExGST * 0.10;
    const totalIncGST = totalExGST + gstAmount;
    const quoteNumber = `Q-${Date.now().toString().slice(-6)}`;
    const createdAt   = new Date().toISOString();
    const validUntil  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const version     = 1;

    const lineItems = [
      { description: `Labour — ${jobType}`, qty: parseFloat(estimatedHours), unitPrice: LABOUR_RATE, amount: labourCost }
    ];
    if (materials > 0) lineItems.push({ description: `Materials — ${materialsNeeded}`, qty: 1, unitPrice: materials, amount: materials });

    const quoteData = { quoteNumber, customerName, customerEmail, customerPhone, jobType, location,
                        estimatedHours: parseFloat(estimatedHours), materialsNeeded, lineItems,
                        totalExGST, gstAmount, totalIncGST, createdAt, validUntil, version };

    const emailBody = await generateQuoteEmail(quoteData);
    const pdfBuffer = await generateQuotePDF(quoteData);
    await sendQuoteEmail(customerEmail, customerName, emailBody, quoteNumber, pdfBuffer);

    const savedQuote = await airtable.createQuote({
      quoteNumber, customerName, customerEmail, customerPhone: customerPhone || '',
      jobType, location, estimatedHours: parseFloat(estimatedHours),
      materialsNeeded: materialsNeeded || '', totalExGST, gstAmount, totalIncGST,
      status: 'Sent', emailBody, createdAt, validUntil, followUpSentAt: '',
      version, previousVersionId: '', lastEdited: '', editHistory: '[]', xeroQuoteId: ''
    });

    // Sync to Xero (non-blocking)
    if (xero.getStatus().connected) {
      xero.syncWithLog(
        () => xero.createXeroQuote({ ...quoteData, lineItems }),
        { action: 'CREATE_QUOTE', entityType: 'Quote', entityId: quoteNumber }
      ).then(xeroQuoteId => airtable.updateQuote(savedQuote.id, { xeroQuoteId }))
       .catch(err => console.warn('[Quote] Xero sync failed (non-fatal):', err.message));
    }

    res.status(201).json({
      success: true,
      message: `Quote ${quoteNumber} sent to ${customerEmail}`,
      quote: { id: savedQuote.id, quoteNumber, customerName, customerEmail,
               totalExGST, gstAmount, totalIncGST, status: 'Sent', version, createdAt }
    });
  } catch (err) {
    console.error('[Quote] Error creating quote:', err);
    res.status(500).json({ error: err.message });
  }
}

// ─── Edit Quote ───────────────────────────────────────────────────────────────

/**
 * Edit a quote. Creates a new version record in Airtable.
 *
 * Behaviour depends on current status:
 *   - Sent / Followed Up → resend updated quote email, reset follow-up timer
 *   - Accepted           → requires forceReApproval flag from frontend
 *                          if set: email client, status → Awaiting Re-approval
 *                          if not set: save as internal draft only (no email)
 *   - Other statuses     → update silently
 */
async function editQuote(req, res) {
  try {
    const { id } = req.params;
    const { jobType, location, estimatedHours, materialsNeeded, materialsCost,
            notes, forceReApproval, changesSummary } = req.body;

    const existing = await airtable.getQuoteById(id);
    if (!existing) return res.status(404).json({ error: 'Quote not found' });

    // ── Recalculate pricing ──────────────────────────────────────────────────
    const hours      = parseFloat(estimatedHours) || existing.estimatedHours;
    const matCost    = parseFloat(materialsCost)  || 0;
    const labourCost = hours * LABOUR_RATE;
    const totalExGST = labourCost + matCost;
    const gstAmount  = totalExGST * 0.10;
    const totalIncGST = totalExGST + gstAmount;
    const newVersion  = (existing.version || 1) + 1;

    const lineItems = [
      { description: `Labour — ${jobType || existing.jobType}`, qty: hours, unitPrice: LABOUR_RATE, amount: labourCost }
    ];
    if (matCost > 0) lineItems.push({ description: `Materials — ${materialsNeeded || existing.materialsNeeded}`, qty: 1, unitPrice: matCost, amount: matCost });

    // ── Build edit history entry ─────────────────────────────────────────────
    let editHistory = [];
    try { editHistory = JSON.parse(existing.editHistory || '[]'); } catch { editHistory = []; }
    editHistory.push({
      version: newVersion,
      changedAt: new Date().toISOString(),
      changes: changesSummary || 'Quote details updated',
      previousTotal: existing.totalIncGST,
      newTotal: totalIncGST
    });

    // ── Determine what to do based on current status ─────────────────────────
    const currentStatus  = existing.status;
    const wasAccepted    = currentStatus === 'Accepted';
    const wasSentOrFollowedUp = ['Sent', 'Followed Up'].includes(currentStatus);

    const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const updatedQuoteData = {
      ...existing,
      jobType:         jobType        || existing.jobType,
      location:        location       || existing.location,
      estimatedHours:  hours,
      materialsNeeded: materialsNeeded || existing.materialsNeeded,
      lineItems,
      totalExGST, gstAmount, totalIncGST,
      version:          newVersion,
      previousVersionId: id,
      lastEdited:        new Date().toISOString(),
      editHistory:       JSON.stringify(editHistory),
      validUntil
    };

    // ── Handle accepted quote requiring re-approval ──────────────────────────
    if (wasAccepted && !forceReApproval) {
      // Save edits as internal draft — no email sent
      const updated = await airtable.updateQuote(id, {
        jobType:         updatedQuoteData.jobType,
        location:        updatedQuoteData.location,
        estimatedHours:  updatedQuoteData.estimatedHours,
        materialsNeeded: updatedQuoteData.materialsNeeded,
        totalExGST, gstAmount, totalIncGST,
        version:          newVersion,
        lastEdited:       updatedQuoteData.lastEdited,
        editHistory:      updatedQuoteData.editHistory
      });
      return res.json({ success: true, savedAsDraft: true, quote: updated,
                        message: 'Changes saved as internal draft — no email sent to client.' });
    }

    // ── Determine new status and email type ──────────────────────────────────
    let newStatus, emailBody, emailSubjectPrefix;
    if (wasAccepted) {
      newStatus = 'Awaiting Re-approval';
      emailBody = await generateReApprovalEmail(updatedQuoteData, changesSummary || 'scope updated');
      emailSubjectPrefix = 'Updated Quote (Re-approval Required)';
    } else if (wasSentOrFollowedUp) {
      newStatus = 'Sent';
      emailBody = await generateUpdatedQuoteEmail(updatedQuoteData, changesSummary || 'scope updated');
      emailSubjectPrefix = 'Updated Quote';
    } else {
      newStatus = currentStatus; // Rejected etc — just update silently
      emailBody = null;
    }

    // ── Generate new PDF ─────────────────────────────────────────────────────
    const pdfBuffer = await generateQuotePDF(updatedQuoteData);

    // ── Send email if required ───────────────────────────────────────────────
    if (emailBody) {
      const { Resend } = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: `${process.env.BUSINESS_NAME} <${process.env.BUSINESS_EMAIL || 'onboarding@resend.dev'}>`,
        to: [existing.customerEmail],
        subject: `${emailSubjectPrefix} #${existing.quoteNumber} from ${process.env.BUSINESS_NAME}`,
        text: emailBody,
        attachments: [{ filename: `Quote-${existing.quoteNumber}-v${newVersion}.pdf`, content: pdfBuffer.toString('base64') }]
      });
    }

    // ── Save updated record ───────────────────────────────────────────────────
    const updated = await airtable.updateQuote(id, {
      jobType:          updatedQuoteData.jobType,
      location:         updatedQuoteData.location,
      estimatedHours:   updatedQuoteData.estimatedHours,
      materialsNeeded:  updatedQuoteData.materialsNeeded,
      totalExGST, gstAmount, totalIncGST,
      status:           newStatus,
      version:          newVersion,
      lastEdited:       updatedQuoteData.lastEdited,
      editHistory:      updatedQuoteData.editHistory,
      validUntil,
      followUpSentAt:   wasSentOrFollowedUp ? '' : existing.followUpSentAt // reset follow-up timer
    });

    // ── Sync edit to Xero (non-blocking) ─────────────────────────────────────
    if (existing.xeroQuoteId && xero.getStatus().connected) {
      xero.syncWithLog(
        () => xero.patchXeroQuote(existing.xeroQuoteId, { ...updatedQuoteData, xeroStatus: wasAccepted ? 'ACCEPTED' : 'DRAFT' }),
        { action: 'PATCH_QUOTE', entityType: 'Quote', entityId: existing.quoteNumber }
      ).catch(err => console.warn('[Quote] Xero patch failed (non-fatal):', err.message));
    }

    res.json({
      success: true,
      emailSent: !!emailBody,
      newStatus,
      quote: updated,
      message: emailBody ? `Updated quote v${newVersion} sent to ${existing.customerEmail}` : `Quote updated (v${newVersion}) — no email sent`
    });

  } catch (err) {
    console.error('[Quote] Error editing quote:', err);
    res.status(500).json({ error: err.message });
  }
}

// ─── Quote History ────────────────────────────────────────────────────────────

async function getQuoteHistory(req, res) {
  try {
    const existing = await airtable.getQuoteById(req.params.id);
    let editHistory = [];
    try { editHistory = JSON.parse(existing.editHistory || '[]'); } catch { editHistory = []; }
    res.json({ quoteNumber: existing.quoteNumber, currentVersion: existing.version, history: editHistory });
  } catch (err) {
    res.status(404).json({ error: 'Quote not found' });
  }
}

/**
 * Restore a previous version of a quote.
 * This creates a NEW version record (does not delete current).
 * The changes are pre-populated from the history entry — the tradie then edits/resends.
 */
async function restoreQuoteVersion(req, res) {
  try {
    const { id } = req.params;
    const { targetVersion } = req.body; // version number to restore to

    const existing  = await airtable.getQuoteById(id);
    let editHistory = [];
    try { editHistory = JSON.parse(existing.editHistory || '[]'); } catch { editHistory = []; }

    const versionEntry = editHistory.find(h => h.version === parseInt(targetVersion));
    if (!versionEntry) return res.status(404).json({ error: `Version ${targetVersion} not found in history` });

    // Return the version data so the frontend can pre-populate an edit form
    res.json({ success: true, versionEntry, message: `To restore, submit an edit with the values from version ${targetVersion}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Standard CRUD ────────────────────────────────────────────────────────────

async function getAllQuotes(req, res) {
  try {
    const quotes = await airtable.getAllQuotes();
    res.json({ quotes });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

async function getQuote(req, res) {
  try {
    const quote = await airtable.getQuoteById(req.params.id);
    res.json({ quote });
  } catch (err) { res.status(404).json({ error: 'Quote not found' }); }
}

async function updateQuoteStatus(req, res) {
  try {
    const { status } = req.body;
    const validStatuses = ['Sent', 'Followed Up', 'Accepted', 'Rejected', 'Awaiting Re-approval'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }
    const updated = await airtable.updateQuote(req.params.id, { status });

    if (status === 'Accepted' && updated.xeroQuoteId && xero.getStatus().connected) {
      xero.syncWithLog(
        () => xero.acceptXeroQuote(updated.xeroQuoteId),
        { action: 'ACCEPT_QUOTE', entityType: 'Quote', entityId: updated.quoteNumber }
      ).catch(err => console.warn('[Quote] Xero accept failed (non-fatal):', err.message));
    }

    res.json({ success: true, quote: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = { createQuote, editQuote, getQuoteHistory, restoreQuoteVersion, getAllQuotes, getQuote, updateQuoteStatus };
