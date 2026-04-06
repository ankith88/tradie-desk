/**
 * Variations Controller
 *
 *   POST   /api/variations              — Add a variation to a job
 *   GET    /api/variations/job/:jobId   — Get all variations for a job
 *   PATCH  /api/variations/:id/approve  — Mark variation as client-approved
 */

const airtable = require('../services/airtable.service');
const xero     = require('../services/xero.service');

async function addVariation(req, res) {
  try {
    const { jobId, quoteId, description, quantity, unitPrice, reason } = req.body;

    if (!jobId || !description || !unitPrice) {
      return res.status(400).json({ error: 'Missing required fields: jobId, description, unitPrice' });
    }

    const qty   = parseFloat(quantity)  || 1;
    const price = parseFloat(unitPrice) || 0;
    const total = qty * price;

    const variation = await airtable.createVariation({
      jobId,
      quoteId:       quoteId    || '',
      description,
      quantity:      qty,
      unitPrice:     price,
      total,
      reason:        reason     || '',
      clientApproved: false,
      dateAdded:     new Date().toISOString().split('T')[0]
    });

    // Update job card's running variation total
    const allVariations    = await airtable.getVariationsForJob(jobId);
    const variationsTotal  = allVariations.reduce((s, v) => s + (parseFloat(v.total) || 0), 0);
    await airtable.updateJob(jobId, { variationsTotal }).catch(() => {});

    res.status(201).json({ success: true, variation, variationsTotal });
  } catch (err) {
    console.error('[Variations] Error adding variation:', err);
    res.status(500).json({ error: err.message });
  }
}

async function getVariationsForJob(req, res) {
  try {
    const variations = await airtable.getVariationsForJob(req.params.jobId);
    const total = variations.reduce((s, v) => s + (parseFloat(v.total) || 0), 0);
    res.json({ variations, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function approveVariation(req, res) {
  try {
    const variation = await airtable.updateVariation(req.params.id, { clientApproved: true });

    // If the job has an associated invoice in Xero, patch it with the new line item
    if (variation.jobId) {
      const job = await airtable.getJobById(variation.jobId).catch(() => null);
      if (job) {
        // Rebuild all approved line items for this job's invoice sync
        const allVariations = await airtable.getVariationsForJob(variation.jobId);
        const approvedItems = allVariations
          .filter(v => v.clientApproved)
          .map(v => ({
            description: `Variation: ${v.description}`,
            qty:         v.quantity,
            unitPrice:   v.unitPrice,
            amount:      v.total
          }));

        // Find associated invoice and patch Xero
        const allInvoices = await airtable.getAllInvoices();
        const inv = allInvoices.find(i => i.jobRef === variation.jobId && i.xeroInvoiceId);
        if (inv && xero.getStatus().connected) {
          const allLineItems = await rebuildInvoiceLineItems(inv, approvedItems);
          xero.syncWithLog(
            () => xero.patchXeroInvoice(inv.xeroInvoiceId, { lineItems: allLineItems }),
            { action: 'PATCH_INVOICE_VARIATION', entityType: 'Invoice', entityId: inv.invoiceNumber }
          ).catch(err => console.warn('[Variations] Xero patch failed (non-fatal):', err.message));
        }
      }
    }

    res.json({ success: true, variation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Rebuild combined line items for a Xero invoice PATCH when a variation is approved
async function rebuildInvoiceLineItems(invoice, newVariationItems) {
  let baseItems = [];
  try { baseItems = JSON.parse(invoice.lineItems || '[]'); } catch { baseItems = []; }

  // Remove old variation line items, re-add all current approved ones
  const nonVariationItems = baseItems.filter(i => !i.description?.startsWith('Variation:'));
  return [...nonVariationItems, ...newVariationItems];
}

module.exports = { addVariation, getVariationsForJob, approveVariation };
