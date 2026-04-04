/**
 * Email Service (Resend)
 *
 * Handles all outbound emails using the Resend API.
 * Resend is free up to 3,000 emails/month — perfect for an MVP.
 * Sign up at: https://resend.com
 */

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// The "from" address — must be a verified domain in Resend.
// During development, Resend allows sending from onboarding@resend.dev
const FROM_EMAIL = process.env.BUSINESS_EMAIL
  ? `${process.env.BUSINESS_NAME} <${process.env.BUSINESS_EMAIL}>`
  : 'Tradie Desk <onboarding@resend.dev>';

/**
 * Send a quote email to a customer.
 *
 * @param {string} toEmail - Customer's email address
 * @param {string} customerName - Customer's name (for subject line)
 * @param {string} emailBody - Plain text email body (from GPT)
 * @param {string} quoteNumber - Used in subject line
 * @param {Buffer|null} pdfAttachment - Optional PDF attachment
 */
async function sendQuoteEmail(toEmail, customerName, emailBody, quoteNumber, pdfAttachment = null) {
  const payload = {
    from: FROM_EMAIL,
    to: [toEmail],
    subject: `Your Quote from ${process.env.BUSINESS_NAME} — Ref: ${quoteNumber}`,
    text: emailBody,
    // Wrap plain text in minimal HTML for better email client rendering
    html: textToHtml(emailBody)
  };

  if (pdfAttachment) {
    payload.attachments = [{
      filename: `Quote-${quoteNumber}.pdf`,
      content: pdfAttachment.toString('base64')
    }];
  }

  const { data, error } = await resend.emails.send(payload);
  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
  return data;
}

/**
 * Send a follow-up email for an unaccepted quote.
 */
async function sendFollowUpEmail(toEmail, customerName, emailBody, quoteNumber) {
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [toEmail],
    subject: `Following up on your quote — Ref: ${quoteNumber}`,
    text: emailBody,
    html: textToHtml(emailBody)
  });

  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
  return data;
}

/**
 * Send an invoice email with a PDF attachment.
 */
async function sendInvoiceEmail(toEmail, customerName, emailBody, invoiceNumber, pdfBuffer) {
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [toEmail],
    subject: `Invoice ${invoiceNumber} from ${process.env.BUSINESS_NAME}`,
    text: emailBody,
    html: textToHtml(emailBody),
    attachments: [{
      filename: `Invoice-${invoiceNumber}.pdf`,
      content: pdfBuffer.toString('base64')
    }]
  });

  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
  return data;
}

/**
 * Send a payment reminder email.
 */
async function sendPaymentReminder(toEmail, customerName, emailBody, invoiceNumber) {
  const reminderNum = emailBody.toLowerCase().includes('second') ? '2nd' : '1st';
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [toEmail],
    subject: `Payment Reminder — Invoice ${invoiceNumber}`,
    text: emailBody,
    html: textToHtml(emailBody)
  });

  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
  return data;
}

/**
 * Convert plain text to a simple HTML email.
 * Converts newlines to <br> and wraps in a basic styled container.
 */
function textToHtml(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const withLineBreaks = escaped.replace(/\n/g, '<br>');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #eee; font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <p>${withLineBreaks}</p>
    <div class="footer">
      <strong>${process.env.BUSINESS_NAME}</strong><br>
      ABN: ${process.env.BUSINESS_ABN}<br>
      ${process.env.BUSINESS_PHONE || ''} | ${process.env.BUSINESS_EMAIL || ''}
    </div>
  </div>
</body>
</html>`.trim();
}

module.exports = { sendQuoteEmail, sendFollowUpEmail, sendInvoiceEmail, sendPaymentReminder };
