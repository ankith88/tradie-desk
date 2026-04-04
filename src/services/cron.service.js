/**
 * Cron Service — Background Automation
 *
 * Runs scheduled jobs using node-cron:
 *   - Every 6 hours: check for quotes needing a follow-up (48h after send)
 *   - Every 6 hours: check for invoices needing payment reminders (7d, 14d)
 *
 * This file is loaded once at server start and runs silently in the background.
 * No manual triggering required — the automations just work.
 */

const cron = require('node-cron');
const airtable = require('./airtable.service');
const { generateFollowUpEmail, generatePaymentReminder } = require('./openai.service');
const { sendFollowUpEmail, sendPaymentReminder } = require('./email.service');

console.log('⏰ Cron jobs initialised — automation is running');

// ─── Quote Follow-Up: Every 6 hours ───────────────────────────────────────────
// Checks for quotes in 'Sent' status that haven't been followed up
// and were sent more than 48 hours ago.
cron.schedule('0 */6 * * *', async () => {
  console.log('[Cron] Running quote follow-up check...');
  try {
    const quotes = await airtable.getQuotesPendingFollowUp();
    console.log(`[Cron] Found ${quotes.length} quote(s) needing follow-up`);

    for (const quote of quotes) {
      try {
        const emailBody = await generateFollowUpEmail(quote);
        await sendFollowUpEmail(quote.customerEmail, quote.customerName, emailBody, quote.quoteNumber);
        await airtable.updateQuote(quote.id, {
          status: 'Followed Up',
          followUpSentAt: new Date().toISOString()
        });
        console.log(`[Cron] Follow-up sent for quote ${quote.quoteNumber} to ${quote.customerEmail}`);
      } catch (err) {
        console.error(`[Cron] Failed follow-up for quote ${quote.quoteNumber}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Cron] Quote follow-up check failed:', err.message);
  }
});

// ─── Invoice Reminder 1 (7 days overdue): Every 6 hours ───────────────────────
cron.schedule('0 */6 * * *', async () => {
  console.log('[Cron] Running invoice 1st reminder check...');
  try {
    const invoices = await airtable.getInvoicesPendingFirstReminder();
    console.log(`[Cron] Found ${invoices.length} invoice(s) needing 1st reminder`);

    for (const invoice of invoices) {
      try {
        const emailBody = await generatePaymentReminder(invoice, 'first');
        await sendPaymentReminder(invoice.customerEmail, invoice.customerName, emailBody, invoice.invoiceNumber);
        await airtable.updateInvoice(invoice.id, {
          firstReminderSentAt: new Date().toISOString()
        });
        console.log(`[Cron] 1st reminder sent for invoice ${invoice.invoiceNumber}`);
      } catch (err) {
        console.error(`[Cron] 1st reminder failed for invoice ${invoice.invoiceNumber}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Cron] Invoice 1st reminder check failed:', err.message);
  }
});

// ─── Invoice Reminder 2 (14 days overdue): Every 6 hours ──────────────────────
cron.schedule('0 */6 * * *', async () => {
  console.log('[Cron] Running invoice 2nd reminder check...');
  try {
    const invoices = await airtable.getInvoicesPendingSecondReminder();
    console.log(`[Cron] Found ${invoices.length} invoice(s) needing 2nd reminder`);

    for (const invoice of invoices) {
      try {
        const emailBody = await generatePaymentReminder(invoice, 'second');
        await sendPaymentReminder(invoice.customerEmail, invoice.customerName, emailBody, invoice.invoiceNumber);
        await airtable.updateInvoice(invoice.id, {
          secondReminderSentAt: new Date().toISOString()
        });
        console.log(`[Cron] 2nd reminder sent for invoice ${invoice.invoiceNumber}`);
      } catch (err) {
        console.error(`[Cron] 2nd reminder failed for invoice ${invoice.invoiceNumber}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Cron] Invoice 2nd reminder check failed:', err.message);
  }
});
