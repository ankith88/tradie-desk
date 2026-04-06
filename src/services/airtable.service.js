/**
 * Airtable Service
 *
 * All database operations go through here.
 *
 * Tables required:
 *   Quotes, Jobs, Invoices, JobNotes, Variations, SyncLog
 *
 * See README for full field lists per table.
 */

const Airtable = require('airtable');

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

async function getAllQuotes() {
  const records = await base('Quotes').select({
    sort: [{ field: 'createdAt', direction: 'desc' }]
  }).all();
  return records.map(r => ({ id: r.id, ...r.fields }));
}

/** Quotes awaiting 48h follow-up (status = Sent, no follow-up yet, created > 48h ago) */
async function getQuotesPendingFollowUp() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const records = await base('Quotes').select({
    filterByFormula: `AND({status} = 'Sent', {followUpSentAt} = '', {createdAt} < '${cutoff}')`
  }).all();
  return records.map(r => ({ id: r.id, ...r.fields }));
}

/** All versions of a quote (same quoteNumber, sorted by version asc) */
async function getQuoteVersions(quoteNumber) {
  const records = await base('Quotes').select({
    filterByFormula: `{quoteNumber} = '${quoteNumber}'`,
    sort: [{ field: 'version', direction: 'asc' }]
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
    sort: [{ field: 'startDate', direction: 'asc' }]
  }).all();
  return records.map(r => ({ id: r.id, ...r.fields }));
}

/** Jobs scheduled to start on or before today and not yet completed — for My Run */
async function getJobsForDate(dateStr) {
  // dateStr format: YYYY-MM-DD
  const records = await base('Jobs').select({
    filterByFormula: `AND({startDate} = '${dateStr}', OR({status} = 'Scheduled', {status} = 'In Progress'))`
  }).all();
  return records.map(r => ({ id: r.id, ...r.fields }));
}

/** All active jobs (not Completed or Invoiced) — for the weekly run view */
async function getActiveJobs() {
  const records = await base('Jobs').select({
    filterByFormula: `OR({status} = 'Scheduled', {status} = 'In Progress', {status} = 'On Hold')`,
    sort: [{ field: 'startDate', direction: 'asc' }]
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

async function getAllInvoices() {
  const records = await base('Invoices').select({
    sort: [{ field: 'issueDate', direction: 'desc' }]
  }).all();
  return records.map(r => ({ id: r.id, ...r.fields }));
}

/** Invoices overdue by ≥1 day, no reminder 1 sent yet, reminders not disabled */
async function getInvoicesPendingReminder1() {
  const cutoff = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const records = await base('Invoices').select({
    filterByFormula: `AND(
      OR({status} = 'Unpaid', {status} = 'Overdue'),
      {reminder1SentAt} = '',
      {remindersDisabled} != TRUE(),
      {dueDate} < '${cutoff}'
    )`
  }).all();
  return records.map(r => ({ id: r.id, ...r.fields }));
}

/** Overdue by ≥7 days, reminder 1 sent, no reminder 2 yet */
async function getInvoicesPendingReminder2() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const records = await base('Invoices').select({
    filterByFormula: `AND(
      OR({status} = 'Unpaid', {status} = 'Overdue'),
      {reminder1SentAt} != '',
      {reminder2SentAt} = '',
      {remindersDisabled} != TRUE(),
      {dueDate} < '${cutoff}'
    )`
  }).all();
  return records.map(r => ({ id: r.id, ...r.fields }));
}

/** Overdue by ≥14 days, reminder 2 sent, no reminder 3 yet */
async function getInvoicesPendingReminder3() {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const records = await base('Invoices').select({
    filterByFormula: `AND(
      OR({status} = 'Unpaid', {status} = 'Overdue'),
      {reminder2SentAt} != '',
      {reminder3SentAt} = '',
      {remindersDisabled} != TRUE(),
      {dueDate} < '${cutoff}'
    )`
  }).all();
  return records.map(r => ({ id: r.id, ...r.fields }));
}

// Keep backward-compatible aliases for old cron code
const getInvoicesPendingFirstReminder  = getInvoicesPendingReminder1;
const getInvoicesPendingSecondReminder = getInvoicesPendingReminder2;

// ─── JobNotes ─────────────────────────────────────────────────────────────────

async function createJobNote(noteData) {
  const record = await base('JobNotes').create([{ fields: noteData }]);
  return { id: record[0].id, ...record[0].fields };
}

async function getNotesForJob(jobId) {
  const records = await base('JobNotes').select({
    filterByFormula: `{jobId} = '${jobId}'`,
    sort: [{ field: 'noteDate', direction: 'desc' }]
  }).all();
  return records.map(r => ({ id: r.id, ...r.fields }));
}

// ─── Variations ───────────────────────────────────────────────────────────────

async function createVariation(variationData) {
  const record = await base('Variations').create([{ fields: variationData }]);
  return { id: record[0].id, ...record[0].fields };
}

async function getVariationsForJob(jobId) {
  const records = await base('Variations').select({
    filterByFormula: `{jobId} = '${jobId}'`,
    sort: [{ field: 'dateAdded', direction: 'asc' }]
  }).all();
  return records.map(r => ({ id: r.id, ...r.fields }));
}

async function updateVariation(recordId, fields) {
  const record = await base('Variations').update(recordId, fields);
  return { id: record.id, ...record.fields };
}

// ─── SyncLog ──────────────────────────────────────────────────────────────────

async function createSyncLog(logData) {
  try {
    const record = await base('SyncLog').create([{ fields: logData }]);
    return { id: record[0].id, ...record[0].fields };
  } catch (err) {
    // SyncLog failures should never crash anything
    console.warn('[SyncLog] Failed to write log entry:', err.message);
    return null;
  }
}

async function getAllSyncLogs() {
  const records = await base('SyncLog').select({
    sort: [{ field: 'timestamp', direction: 'desc' }],
    maxRecords: 100
  }).all();
  return records.map(r => ({ id: r.id, ...r.fields }));
}

module.exports = {
  // Quotes
  createQuote, getQuoteById, updateQuote, getAllQuotes,
  getQuotesPendingFollowUp, getQuoteVersions,
  // Jobs
  createJob, getJobById, updateJob, getAllJobs,
  getJobsForDate, getActiveJobs,
  // Invoices
  createInvoice, getInvoiceById, updateInvoice, getAllInvoices,
  getInvoicesPendingReminder1, getInvoicesPendingReminder2, getInvoicesPendingReminder3,
  getInvoicesPendingFirstReminder, getInvoicesPendingSecondReminder,
  // JobNotes
  createJobNote, getNotesForJob,
  // Variations
  createVariation, getVariationsForJob, updateVariation,
  // SyncLog
  createSyncLog, getAllSyncLogs
};
