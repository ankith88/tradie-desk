/**
 * Airtable Service
 *
 * All database operations go through here. Airtable acts as our database —
 * it's free, has a visual UI for the client to view their data, and has a
 * simple REST API.
 *
 * Required Tables in your Airtable Base:
 *   - Quotes:   quoteNumber, customerName, customerEmail, customerPhone,
 *               jobType, location, estimatedHours, materialsNeeded,
 *               totalExGST, gstAmount, totalIncGST, status, emailBody,
 *               createdAt, followUpSentAt, validUntil
 *
 *   - Jobs:     jobNumber, customerName, customerEmail, customerPhone,
 *               jobType, address, scheduledDate, scheduledTime,
 *               status, notes, quoteRef, createdAt
 *
 *   - Invoices: invoiceNumber, quoteRef, jobRef, customerName,
 *               customerEmail, customerPhone, jobType, location,
 *               totalExGST, gstAmount, totalIncGST, issueDate, dueDate,
 *               status, firstReminderSentAt, secondReminderSentAt
 */

const Airtable = require('airtable');

// Initialise Airtable with personal access token
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

// ─── Quotes ───────────────────────────────────────────────────────────────────

async function createQuote(quoteData) {
  const record = await base('Quotes').create([{ fields: quoteData }]);
  return { id: record[0].id, ...record[0].fields };
}

async function getQuoteById(recordId) {
  const record = await base('Quotes').find(recordId);
  return { id: record.id, ...record.fields };
}

async function updateQuote(recordId, fields) {
  const record = await base('Quotes').update(recordId, fields);
  return { id: record.id, ...record.fields };
}

/**
 * Get all quotes that are still in 'Sent' status and were created
 * more than 48 hours ago (candidates for follow-up emails).
 */
async function getQuotesPendingFollowUp() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const records = await base('Quotes').select({
    filterByFormula: `AND({status} = 'Sent', {followUpSentAt} = '', {createdAt} < '${cutoff}')`
  }).all();
  return records.map(r => ({ id: r.id, ...r.fields }));
}

async function getAllQuotes() {
  const records = await base('Quotes').select({
    sort: [{ field: 'createdAt', direction: 'desc' }]
  }).all();
  return records.map(r => ({ id: r.id, ...r.fields }));
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

async function createJob(jobData) {
  const record = await base('Jobs').create([{ fields: jobData }]);
  return { id: record[0].id, ...record[0].fields };
}

async function getJobById(recordId) {
  const record = await base('Jobs').find(recordId);
  return { id: record.id, ...record.fields };
}

async function updateJob(recordId, fields) {
  const record = await base('Jobs').update(recordId, fields);
  return { id: record.id, ...record.fields };
}

async function getAllJobs() {
  const records = await base('Jobs').select({
    sort: [{ field: 'scheduledDate', direction: 'asc' }]
  }).all();
  return records.map(r => ({ id: r.id, ...r.fields }));
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

async function createInvoice(invoiceData) {
  const record = await base('Invoices').create([{ fields: invoiceData }]);
  return { id: record[0].id, ...record[0].fields };
}

async function getInvoiceById(recordId) {
  const record = await base('Invoices').find(recordId);
  return { id: record.id, ...record.fields };
}

async function updateInvoice(recordId, fields) {
  const record = await base('Invoices').update(recordId, fields);
  return { id: record.id, ...record.fields };
}

/**
 * Get invoices that are unpaid and 7 days past due — ready for 1st reminder.
 */
async function getInvoicesPendingFirstReminder() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const records = await base('Invoices').select({
    filterByFormula: `AND({status} = 'Unpaid', {firstReminderSentAt} = '', {dueDate} < '${cutoff}')`
  }).all();
  return records.map(r => ({ id: r.id, ...r.fields }));
}

/**
 * Get invoices that are unpaid, had a first reminder, and are now 14 days past due.
 */
async function getInvoicesPendingSecondReminder() {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const records = await base('Invoices').select({
    filterByFormula: `AND({status} = 'Unpaid', {firstReminderSentAt} != '', {secondReminderSentAt} = '', {dueDate} < '${cutoff}')`
  }).all();
  return records.map(r => ({ id: r.id, ...r.fields }));
}

async function getAllInvoices() {
  const records = await base('Invoices').select({
    sort: [{ field: 'issueDate', direction: 'desc' }]
  }).all();
  return records.map(r => ({ id: r.id, ...r.fields }));
}

module.exports = {
  createQuote, getQuoteById, updateQuote, getQuotesPendingFollowUp, getAllQuotes,
  createJob, getJobById, updateJob, getAllJobs,
  createInvoice, getInvoiceById, updateInvoice, getAllInvoices,
  getInvoicesPendingFirstReminder, getInvoicesPendingSecondReminder
};
