/**
 * Cron Service — Background Automation
 *
 * Runs every 6 hours and handles:
 *   - Quote 48h follow-ups
 *   - Invoice payment reminders: day 1 (polite), day 7 (firmer), day 14 (final)
 *   - Auto-marks invoices as Overdue when past due date
 */

const cron = require('node-cron');
const airtable = require('./airtable.service');
const { generateFollowUpEmail, generatePaymentReminder } = require('./openai.service');
const { sendFollowUpEmail, sendPaymentReminder } = require('./email.service');

console.log('⏰ Cron jobs initialised — automation is running');

// ─── Quote Follow-Up (every 6 hours) ─────────────────────────────────────────
cron.schedule('0 */6 * * *', async () => {
  console.log('[Cron] Running quote follow-up check...');
  try {
    const quotes = await airtable.getQuotesPendingFollowUp();
    for (const quote of quotes) {
      try {
        const emailBody = await generateFollowUpEmail(quote);
        await sendFollowUpEmail(quote.customerEmail, quote.customerName, emailBody, quote.quoteNumber);
        await airtable.updateQuote(quote.id, { status: 'Followed Up', followUpSentAt: new Date().toISOString() });
        console.log(`[Cron] Follow-up sent for ${quote.quoteNumber}`);
      } catch (err) {
        console.error(`[Cron] Follow-up failed for ${quote.quoteNumber}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Cron] Quote follow-up check failed:', err.message);
  }
});

// ─── Invoice Overdue Status Update (every 6 hours) ───────────────────────────
// Mark invoices as Overdue when past due date but not yet Paid or Cancelled
cron.schedule('0 */6 * * *', async () => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const all = await airtable.getAllInvoices();
    for (const inv of all) {
      if (inv.status === 'Unpaid' && inv.dueDate && inv.dueDate < today) {
        await airtable.updateInvoice(inv.id, { status: 'Overdue' });
      }
    }
  } catch (err) {
    console.error('[Cron] Overdue status update failed:', err.message);
  }
});

// ─── Invoice Reminder 1: Day 1 overdue (every 6 hours) ───────────────────────
cron.schedule('0 */6 * * *', async () => {
  console.log('[Cron] Running invoice reminder 1 check...');
  try {
    const invoices = await airtable.getInvoicesPendingReminder1();
    for (const invoice of invoices) {
      try {
        const emailBody = await generatePaymentReminder(invoice, 'first');
        await sendPaymentReminder(invoice.customerEmail, invoice.customerName, emailBody, invoice.invoiceNumber);
        await airtable.updateInvoice(invoice.id, { reminder1SentAt: new Date().toISOString() });
        console.log(`[Cron] Reminder 1 sent for ${invoice.invoiceNumber}`);
      } catch (err) {
        console.error(`[Cron] Reminder 1 failed for ${invoice.invoiceNumber}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Cron] Reminder 1 check failed:', err.message);
  }
});

// ─── Invoice Reminder 2: Day 7 overdue (every 6 hours) ───────────────────────
cron.schedule('0 */6 * * *', async () => {
  console.log('[Cron] Running invoice reminder 2 check...');
  try {
    const invoices = await airtable.getInvoicesPendingReminder2();
    for (const invoice of invoices) {
      try {
        const emailBody = await generatePaymentReminder(invoice, 'second');
        await sendPaymentReminder(invoice.customerEmail, invoice.customerName, emailBody, invoice.invoiceNumber);
        await airtable.updateInvoice(invoice.id, { reminder2SentAt: new Date().toISOString() });
        console.log(`[Cron] Reminder 2 sent for ${invoice.invoiceNumber}`);
      } catch (err) {
        console.error(`[Cron] Reminder 2 failed for ${invoice.invoiceNumber}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Cron] Reminder 2 check failed:', err.message);
  }
});

// ─── Invoice Reminder 3: Day 14 overdue — Final Notice (every 6 hours) ───────
cron.schedule('0 */6 * * *', async () => {
  console.log('[Cron] Running invoice reminder 3 (final notice) check...');
  try {
    const invoices = await airtable.getInvoicesPendingReminder3();
    for (const invoice of invoices) {
      try {
        const emailBody = await generatePaymentReminder(invoice, 'third');
        await sendPaymentReminder(invoice.customerEmail, invoice.customerName, emailBody, invoice.invoiceNumber);
        await airtable.updateInvoice(invoice.id, { reminder3SentAt: new Date().toISOString() });
        console.log(`[Cron] Reminder 3 (final) sent for ${invoice.invoiceNumber}`);
      } catch (err) {
        console.error(`[Cron] Reminder 3 failed for ${invoice.invoiceNumber}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Cron] Reminder 3 check failed:', err.message);
  }
});
