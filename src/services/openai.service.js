/**
 * OpenAI Service
 *
 * Handles all AI-generated content: quotes, follow-ups, and invoice text.
 * Uses GPT-4o for professional, context-aware writing tailored to Australian trades.
 */

const OpenAI = require('openai');

// Initialise OpenAI client with API key from environment
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Business context injected into every AI prompt so responses feel authentic
const BUSINESS_CONTEXT = `
You are writing on behalf of ${process.env.BUSINESS_NAME || 'Rapid Response Plumbing'},
a Sydney-based plumbing business owned by Steve.
Services: general plumbing, leak repairs, hot water systems, drain clearing.
Standard hourly rate: $120 + GST.
Write in a friendly but professional Australian tone.
Always use AUD. Include GST (10%) separately. Keep emails concise and actionable.
`.trim();

/**
 * Generate a professional quote email body using GPT.
 *
 * @param {Object} quoteData - Job details from the quote form
 * @param {string} quoteData.customerName
 * @param {string} quoteData.customerEmail
 * @param {string} quoteData.jobType
 * @param {string} quoteData.location
 * @param {number} quoteData.estimatedHours
 * @param {string} quoteData.materialsNeeded
 * @param {number} quoteData.totalExGST
 * @param {number} quoteData.gstAmount
 * @param {number} quoteData.totalIncGST
 * @param {string} quoteData.quoteNumber
 * @returns {Promise<string>} HTML email body
 */
async function generateQuoteEmail(quoteData) {
  const {
    customerName, jobType, location, estimatedHours,
    materialsNeeded, totalExGST, gstAmount, totalIncGST, quoteNumber
  } = quoteData;

  const prompt = `
${BUSINESS_CONTEXT}

Write a professional quote email to ${customerName} for the following job:
- Job Type: ${jobType}
- Location: ${location}
- Estimated Hours: ${estimatedHours} hours at $120/hr
- Materials: ${materialsNeeded || 'None specified'}
- Quote Number: ${quoteNumber}
- Subtotal (ex GST): $${totalExGST.toFixed(2)}
- GST (10%): $${gstAmount.toFixed(2)}
- Total (inc GST): $${totalIncGST.toFixed(2)}

The email should:
1. Thank them for reaching out
2. Summarise the scope of work clearly
3. Present the pricing with GST shown separately
4. Mention the quote is valid for 30 days
5. Include a clear call to action (reply to accept)
6. Sign off from Steve

Return ONLY the email body as plain text (no subject line, no HTML tags). Keep it under 250 words.
`.trim();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 600,
    temperature: 0.7
  });

  return response.choices[0].message.content.trim();
}

/**
 * Generate a personalised follow-up email for an unaccepted quote.
 *
 * @param {Object} quoteData - Original quote details
 * @returns {Promise<string>} Follow-up email body (plain text)
 */
async function generateFollowUpEmail(quoteData) {
  const { customerName, jobType, totalIncGST, quoteNumber } = quoteData;

  const prompt = `
${BUSINESS_CONTEXT}

Write a friendly follow-up email to ${customerName} about a quote that hasn't been responded to.

Quote details:
- Quote Number: ${quoteNumber}
- Job: ${jobType}
- Total (inc GST): $${totalIncGST.toFixed(2)}
- Sent 48 hours ago

The email should:
1. Be warm and non-pushy — we value their business
2. Briefly remind them of the job quoted
3. Offer to answer any questions or adjust the scope
4. Include a clear call to action
5. Mention we have availability this week (if they'd like to proceed)
6. Sign off from Steve

Return ONLY the email body as plain text (no subject line). Keep it under 180 words.
`.trim();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 400,
    temperature: 0.8
  });

  return response.choices[0].message.content.trim();
}

/**
 * Generate a polite payment reminder email.
 *
 * @param {Object} invoiceData - Invoice details
 * @param {'first'|'second'} reminderNumber - Which reminder this is
 * @returns {Promise<string>} Reminder email body (plain text)
 */
async function generatePaymentReminder(invoiceData, reminderNumber) {
  const { customerName, invoiceNumber, totalIncGST, dueDate } = invoiceData;
  const isSecond = reminderNumber === 'second';

  const prompt = `
${BUSINESS_CONTEXT}

Write a payment reminder email to ${customerName}.

Invoice details:
- Invoice Number: ${invoiceNumber}
- Amount Due (inc GST): $${totalIncGST.toFixed(2)}
- Due Date: ${dueDate}
- This is the ${isSecond ? 'SECOND (firmer)' : 'FIRST (polite)'} reminder

The tone should be:
${isSecond
  ? '- Firmer and more direct, but still professional. Mention that payment is now overdue and request it be settled immediately. Mention potential for further action if unpaid.'
  : '- Friendly and gentle. Just a helpful nudge in case they forgot.'}

Include bank details: ${process.env.BUSINESS_BANK_DETAILS || 'as per invoice'}.
Sign off from Steve.

Return ONLY the email body as plain text (no subject line). Keep it under 200 words.
`.trim();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 450,
    temperature: 0.7
  });

  return response.choices[0].message.content.trim();
}

module.exports = { generateQuoteEmail, generateFollowUpEmail, generatePaymentReminder };
