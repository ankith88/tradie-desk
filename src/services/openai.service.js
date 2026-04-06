/**
 * OpenAI Service
 *
 * All AI-generated email content goes through here.
 * Uses GPT-4o for professional, context-aware Australian trade business writing.
 */

const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BUSINESS_CONTEXT = `
You are writing on behalf of ${process.env.BUSINESS_NAME || 'Rapid Response Plumbing'},
a Sydney-based plumbing business owned by Steve.
Services: general plumbing, leak repairs, hot water systems, drain clearing.
Standard hourly rate: $120 + GST.
Write in a friendly but professional Australian tone.
Always use AUD. Include GST (10%) separately. Keep emails concise and actionable.
`.trim();

// ─── Quotes ───────────────────────────────────────────────────────────────────

async function generateQuoteEmail(quoteData) {
  const { customerName, jobType, location, estimatedHours, materialsNeeded,
          totalExGST, gstAmount, totalIncGST, quoteNumber } = quoteData;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: `
${BUSINESS_CONTEXT}

Write a professional quote email to ${customerName} for the following job:
- Job Type: ${jobType}
- Location: ${location}
- Estimated Hours: ${estimatedHours} hours at $120/hr
- Materials: ${materialsNeeded || 'None specified'}
- Quote Number: ${quoteNumber}
- Subtotal (ex GST): $${Number(totalExGST).toFixed(2)}
- GST (10%): $${Number(gstAmount).toFixed(2)}
- Total (inc GST): $${Number(totalIncGST).toFixed(2)}

The email should:
1. Thank them for reaching out
2. Summarise the scope of work clearly
3. Present the pricing with GST shown separately
4. Mention the quote is valid for 30 days
5. Include a clear call to action (reply to accept)
6. Sign off from Steve

Return ONLY the email body as plain text (no subject line, no HTML tags). Keep it under 250 words.
`.trim() }],
    max_tokens: 600, temperature: 0.7
  });
  return response.choices[0].message.content.trim();
}

/**
 * Generate an "updated quote" email sent after an edit.
 * Explains what changed and asks the client to review.
 */
async function generateUpdatedQuoteEmail(quoteData, changes) {
  const { customerName, jobType, quoteNumber, totalIncGST, version } = quoteData;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: `
${BUSINESS_CONTEXT}

Write a professional email to ${customerName} informing them that their quote has been updated.

Quote details:
- Quote Number: ${quoteNumber} (Version ${version})
- Job: ${jobType}
- New Total (inc GST): $${Number(totalIncGST).toFixed(2)}
- What changed: ${changes || 'Scope and/or pricing updated'}

The email should:
1. Open with a brief apology/explanation for the update
2. Clearly state what changed (use the "What changed" details above)
3. Present the updated total
4. Ask them to review and confirm acceptance
5. Reassure them they can ask questions
6. Sign off from Steve

Return ONLY the email body as plain text. Under 200 words.
`.trim() }],
    max_tokens: 500, temperature: 0.7
  });
  return response.choices[0].message.content.trim();
}

/**
 * Generate a "quote requires re-approval" email (edited after acceptance).
 */
async function generateReApprovalEmail(quoteData, changes) {
  const { customerName, jobType, quoteNumber, totalIncGST, version } = quoteData;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: `
${BUSINESS_CONTEXT}

Write a professional email to ${customerName} explaining that their previously accepted quote has been revised and requires their re-approval.

Quote details:
- Quote Number: ${quoteNumber} (Version ${version})
- Job: ${jobType}
- Updated Total (inc GST): $${Number(totalIncGST).toFixed(2)}
- What changed: ${changes}

The email should:
1. Acknowledge their original acceptance and apologise for the change
2. Clearly explain what changed and why it was necessary
3. State the updated total
4. Ask for their re-approval via reply
5. Be warm and reassuring
6. Sign off from Steve

Return ONLY the email body as plain text. Under 220 words.
`.trim() }],
    max_tokens: 550, temperature: 0.7
  });
  return response.choices[0].message.content.trim();
}

async function generateFollowUpEmail(quoteData) {
  const { customerName, jobType, totalIncGST, quoteNumber } = quoteData;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: `
${BUSINESS_CONTEXT}

Write a friendly follow-up email to ${customerName} about a quote that hasn't been responded to.

Quote details:
- Quote Number: ${quoteNumber}
- Job: ${jobType}
- Total (inc GST): $${Number(totalIncGST).toFixed(2)}
- Sent 48 hours ago

The email should:
1. Be warm and non-pushy — we value their business
2. Briefly remind them of the job quoted
3. Offer to answer any questions or adjust the scope
4. Include a clear call to action
5. Mention we have availability this week (if they'd like to proceed)
6. Sign off from Steve

Return ONLY the email body as plain text (no subject line). Keep it under 180 words.
`.trim() }],
    max_tokens: 400, temperature: 0.8
  });
  return response.choices[0].message.content.trim();
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

/**
 * Generate a reschedule notification email to the customer.
 */
async function generateRescheduleEmail(jobData, oldDates, newDates) {
  const { customerName, jobType } = jobData;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: `
${BUSINESS_CONTEXT}

Write a professional email to ${customerName} notifying them that their job has been rescheduled.

Job details:
- Job Type: ${jobType}
- Previous Schedule: ${oldDates}
- New Schedule: ${newDates}

The email should:
1. Apologise for any inconvenience caused by the reschedule
2. Clearly state the new dates/times
3. Offer to discuss if the new time doesn't work for them
4. Be warm and professional
5. Sign off from Steve

Return ONLY the email body as plain text. Under 180 words.
`.trim() }],
    max_tokens: 450, temperature: 0.7
  });
  return response.choices[0].message.content.trim();
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

/**
 * Generate a payment reminder email. Supports 3 reminder levels:
 *   'first'  — day 1 overdue, polite nudge
 *   'second' — day 7 overdue, firmer
 *   'third'  — day 14 overdue, final notice
 */
async function generatePaymentReminder(invoiceData, reminderNumber) {
  const { customerName, invoiceNumber, totalIncGST, dueDate } = invoiceData;

  const toneMap = {
    first:  'Friendly and gentle. Just a helpful nudge — they may have simply forgotten.',
    second: 'Firmer and more direct, but still professional. Payment is now significantly overdue. Mention consequences of non-payment.',
    third:  'Serious and direct. This is a final notice. Payment is very overdue. Mention that the matter may be escalated if not resolved immediately. Still professional — no threats.'
  };

  const tone = toneMap[reminderNumber] || toneMap.first;
  const ordinals = { first: '1st', second: '2nd', third: '3rd (FINAL)' };

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: `
${BUSINESS_CONTEXT}

Write a payment reminder email to ${customerName}.

Invoice details:
- Invoice Number: ${invoiceNumber}
- Amount Due (inc GST): $${Number(totalIncGST).toFixed(2)}
- Due Date: ${dueDate}
- This is the ${ordinals[reminderNumber] || '1st'} reminder

Tone: ${tone}

Include bank details: ${process.env.BUSINESS_BANK_DETAILS || 'as per invoice'}.
Sign off from Steve.

Return ONLY the email body as plain text (no subject line). Keep it under 200 words.
`.trim() }],
    max_tokens: 450, temperature: 0.7
  });
  return response.choices[0].message.content.trim();
}

module.exports = {
  generateQuoteEmail,
  generateUpdatedQuoteEmail,
  generateReApprovalEmail,
  generateFollowUpEmail,
  generateRescheduleEmail,
  generatePaymentReminder
};
