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

const { v4: uuidv4 } = require('uuid');
const airtable = require('../services/airtable.service');
const { generateQuoteEmail, generateUpdatedQuoteEmail, generateReApprovalEmail } = require('../services/openai.service');
const { generateQuotePDF } = require('../services/pdf.service');
const { sendQuoteEmail } = require('../services/email.service');
const xero = require('../services/xero.service');
const { Resend } = require('resend');

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

    const acceptanceToken = uuidv4();
    const serverUrl = process.env.SERVER_URL || 'http://localhost:3001';
    const acceptUrl = `${serverUrl}/api/quotes/accept?token=${acceptanceToken}`;

    const emailBody = await generateQuoteEmail(quoteData);
    const pdfBuffer = await generateQuotePDF(quoteData);

    // Save to Airtable FIRST so the token is persisted before the email goes out.
    // This ensures the acceptance link in the email is always valid.
    const savedQuote = await airtable.createQuote({
      quoteNumber, customerName, customerEmail, customerPhone: customerPhone || '',
      jobType, location, estimatedHours: parseFloat(estimatedHours),
      materialsNeeded: materialsNeeded || '', totalExGST, gstAmount, totalIncGST,
      status: 'Sent', emailBody, createdAt, validUntil, followUpSentAt: '',
      version, previousVersionId: '', lastEdited: '', editHistory: '[]', xeroQuoteId: '',
      acceptanceToken
    });

    await sendQuoteEmail(customerEmail, customerName, emailBody, quoteNumber, pdfBuffer, acceptUrl);

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

// ─── Accept Quote by Token (client clicks email link) ─────────────────────────

async function acceptQuoteByToken(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).send(acceptanceHtmlPage('error', 'Invalid link — no token provided.'));

  try {
    const quotes = await airtable.getAllQuotes();
    const quote  = quotes.find(q => q.acceptanceToken === token);

    if (!quote) return res.status(404).send(acceptanceHtmlPage('error', 'This acceptance link is invalid or has already been used.'));

    if (quote.status === 'Accepted') {
      return res.send(acceptanceHtmlPage('already', `Quote ${quote.quoteNumber} is already marked as accepted. Thank you!`));
    }

    // Mark as accepted
    await airtable.updateQuote(quote.id, { status: 'Accepted', acceptanceToken: '' });

    // Sync to Xero (non-blocking)
    if (quote.xeroQuoteId && xero.getStatus().connected) {
      xero.syncWithLog(
        () => xero.acceptXeroQuote(quote.xeroQuoteId),
        { action: 'ACCEPT_QUOTE', entityType: 'Quote', entityId: quote.quoteNumber }
      ).catch(err => console.warn('[Quote] Xero accept failed (non-fatal):', err.message));
    }

    // Notify tradie by email (non-blocking)
    const tradieEmail = process.env.BUSINESS_EMAIL;
    if (tradieEmail && tradieEmail !== 'onboarding@resend.dev') {
      const resend = new Resend(process.env.RESEND_API_KEY);
      resend.emails.send({
        from: `Tradie Desk <onboarding@resend.dev>`,
        to: [tradieEmail],
        subject: `✅ Quote Accepted — ${quote.quoteNumber} (${quote.customerName})`,
        text: `Great news!\n\n${quote.customerName} has accepted quote ${quote.quoteNumber} for ${quote.jobType} at ${quote.location}.\n\nTotal: $${Number(quote.totalIncGST).toFixed(2)} inc GST\n\nLog in to Tradie Desk to schedule the job.`,
      }).catch(err => console.warn('[Quote] Tradie notification failed (non-fatal):', err.message));
    }

    return res.send(acceptanceHtmlPage('success', quote));
  } catch (err) {
    console.error('[Quote] acceptQuoteByToken error:', err);
    return res.status(500).send(acceptanceHtmlPage('error', 'Something went wrong. Please contact us directly.'));
  }
}

/** Render a self-contained HTML confirmation page returned to the client's browser. */
function acceptanceHtmlPage(type, data) {
  const styles = `
    body { font-family: Arial, sans-serif; background: #f9fafb; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: white; border-radius: 16px; padding: 48px 40px; max-width: 480px; width: 90%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    h1 { margin: 0 0 12px; font-size: 28px; }
    p { color: #555; line-height: 1.6; margin: 8px 0; }
    .detail { background: #f0fdf4; border-radius: 8px; padding: 16px; margin-top: 24px; text-align: left; font-size: 14px; color: #166534; }
    .detail strong { display: block; font-size: 16px; margin-bottom: 4px; }`;

  if (type === 'success') {
    const q = data;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Quote Accepted</title><style>${styles}</style></head>
<body><div class="card">
  <div style="font-size:56px">✅</div>
  <h1 style="color:#16a34a">Quote Accepted!</h1>
  <p>Thank you, <strong>${q.customerName}</strong>. We've received your acceptance and will be in touch shortly to confirm scheduling.</p>
  <div class="detail">
    <strong>${process.env.BUSINESS_NAME}</strong>
    ${q.quoteNumber} — ${q.jobType}<br>
    ${q.location}<br>
    <strong style="margin-top:8px;display:block">Total: $${Number(q.totalIncGST).toFixed(2)} inc GST</strong>
  </div>
  <p style="margin-top:24px;font-size:13px;color:#888">Questions? Call us on ${process.env.BUSINESS_PHONE || ''}</p>
</div></body></html>`;
  }

  if (type === 'already') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Already Accepted</title><style>${styles}</style></head>
<body><div class="card">
  <div style="font-size:56px">👍</div>
  <h1 style="color:#2563eb">Already Accepted</h1>
  <p>${data}</p>
</div></body></html>`;
  }

  // error
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title><style>${styles}</style></head>
<body><div class="card">
  <div style="font-size:56px">❌</div>
  <h1 style="color:#dc2626">Something went wrong</h1>
  <p>${data}</p>
  <p style="margin-top:16px;font-size:13px;color:#888">Please contact us directly on ${process.env.BUSINESS_PHONE || ''}</p>
</div></body></html>`;
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

    if (status === 'Accepted') {
      // Xero sync
      if (updated.xeroQuoteId && xero.getStatus().connected) {
        xero.syncWithLog(
          () => xero.acceptXeroQuote(updated.xeroQuoteId),
          { action: 'ACCEPT_QUOTE', entityType: 'Quote', entityId: updated.quoteNumber }
        ).catch(err => console.warn('[Quote] Xero accept failed (non-fatal):', err.message));
      }

      // Notify tradie (manual accept on behalf of client)
      const tradieEmail = process.env.BUSINESS_EMAIL;
      if (tradieEmail && tradieEmail !== 'onboarding@resend.dev') {
        const resend = new Resend(process.env.RESEND_API_KEY);
        resend.emails.send({
          from: `Tradie Desk <onboarding@resend.dev>`,
          to: [tradieEmail],
          subject: `✅ Quote Accepted (Manual) — ${updated.quoteNumber} (${updated.customerName})`,
          text: `You manually accepted quote ${updated.quoteNumber} on behalf of ${updated.customerName}.\n\nJob: ${updated.jobType} at ${updated.location}\nTotal: $${Number(updated.totalIncGST).toFixed(2)} inc GST\n\nLog in to Tradie Desk to schedule the job.`,
        }).catch(err => console.warn('[Quote] Tradie notification failed (non-fatal):', err.message));
      }
    }

    res.json({ success: true, quote: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = { createQuote, editQuote, getQuoteHistory, restoreQuoteVersion, getAllQuotes, getQuote, updateQuoteStatus, acceptQuoteByToken };
