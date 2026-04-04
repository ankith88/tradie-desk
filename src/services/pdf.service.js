/**
 * PDF Service (pdf-lib)
 *
 * Generates professional PDF quotes and invoices entirely in Node.js.
 * pdf-lib creates PDFs from scratch — no headless browser needed.
 * All dollar amounts are in AUD. GST (10%) is always shown separately.
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

// Colour palette
const COLORS = {
  primary:   rgb(0.07, 0.45, 0.78),   // Blue
  dark:      rgb(0.1,  0.1,  0.1),
  mid:       rgb(0.4,  0.4,  0.4),
  light:     rgb(0.9,  0.9,  0.9),
  white:     rgb(1,    1,    1),
  accent:    rgb(0.07, 0.65, 0.45)    // Green (for "paid" stamps etc.)
};

/**
 * Generate a PDF quote.
 *
 * @param {Object} quoteData
 * @returns {Promise<Buffer>} PDF as a Buffer (ready to attach to email)
 */
async function generateQuotePDF(quoteData) {
  const {
    quoteNumber, customerName, customerEmail, customerPhone,
    jobType, location, estimatedHours, materialsNeeded,
    lineItems = [], totalExGST, gstAmount, totalIncGST,
    createdAt, validUntil
  } = quoteData;

  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  const fontBold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontNormal = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let y = height - 50;

  // ── Header bar ──────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: COLORS.primary });

  page.drawText(process.env.BUSINESS_NAME || 'Rapid Response Plumbing', {
    x: 40, y: height - 45, size: 20, font: fontBold, color: COLORS.white
  });
  page.drawText('QUOTE', {
    x: width - 110, y: height - 45, size: 24, font: fontBold, color: COLORS.white
  });

  y = height - 100;

  // ── Business & quote meta ────────────────────────────────────────────────────
  drawText(page, fontNormal, `ABN: ${process.env.BUSINESS_ABN || ''}`, 40, y, 9, COLORS.mid);
  drawText(page, fontNormal, `Email: ${process.env.BUSINESS_EMAIL || ''}`, 40, y - 14, 9, COLORS.mid);
  drawText(page, fontNormal, `Phone: ${process.env.BUSINESS_PHONE || ''}`, 40, y - 28, 9, COLORS.mid);

  drawText(page, fontBold,   `Quote #: ${quoteNumber}`, width - 200, y, 10, COLORS.dark);
  drawText(page, fontNormal, `Date: ${formatDate(createdAt)}`, width - 200, y - 15, 9, COLORS.mid);
  drawText(page, fontNormal, `Valid Until: ${formatDate(validUntil)}`, width - 200, y - 30, 9, COLORS.mid);

  y -= 60;

  // ── Customer details ─────────────────────────────────────────────────────────
  drawSectionHeader(page, fontBold, 'PREPARED FOR', 40, y, width);
  y -= 20;
  drawText(page, fontBold,   customerName,       40, y,       11, COLORS.dark);
  drawText(page, fontNormal, customerEmail || '', 40, y - 14, 9,  COLORS.mid);
  drawText(page, fontNormal, customerPhone || '', 40, y - 28, 9,  COLORS.mid);
  drawText(page, fontNormal, `Job Location: ${location}`, 40, y - 42, 9, COLORS.mid);

  y -= 80;

  // ── Job summary ──────────────────────────────────────────────────────────────
  drawSectionHeader(page, fontBold, 'SCOPE OF WORK', 40, y, width);
  y -= 20;
  drawText(page, fontNormal, `Job Type: ${jobType}`, 40, y, 10, COLORS.dark);
  y -= 15;
  drawText(page, fontNormal, `Estimated Duration: ${estimatedHours} hour(s)`, 40, y, 10, COLORS.dark);
  y -= 15;
  if (materialsNeeded) {
    drawText(page, fontNormal, `Materials: ${materialsNeeded}`, 40, y, 10, COLORS.dark);
    y -= 15;
  }
  y -= 10;

  // ── Line items table ─────────────────────────────────────────────────────────
  drawSectionHeader(page, fontBold, 'PRICING BREAKDOWN', 40, y, width);
  y -= 25;

  // Table header
  page.drawRectangle({ x: 40, y: y - 5, width: width - 80, height: 20, color: COLORS.light });
  drawText(page, fontBold, 'Description',       50,          y, 9, COLORS.dark);
  drawText(page, fontBold, 'Qty',               340,         y, 9, COLORS.dark);
  drawText(page, fontBold, 'Unit Price',        400,         y, 9, COLORS.dark);
  drawText(page, fontBold, 'Amount',            490,         y, 9, COLORS.dark);
  y -= 20;

  // Table rows
  const items = lineItems.length > 0 ? lineItems : [
    { description: `Labour — ${jobType}`, qty: estimatedHours, unitPrice: 120, amount: estimatedHours * 120 },
    ...(materialsNeeded ? [{ description: `Materials — ${materialsNeeded}`, qty: 1, unitPrice: 0, amount: 0 }] : [])
  ];

  for (const item of items) {
    drawText(page, fontNormal, item.description,            50,  y, 9, COLORS.dark);
    drawText(page, fontNormal, String(item.qty),            350, y, 9, COLORS.dark);
    drawText(page, fontNormal, `$${item.unitPrice.toFixed(2)}`, 400, y, 9, COLORS.dark);
    drawText(page, fontNormal, `$${item.amount.toFixed(2)}`,    490, y, 9, COLORS.dark);
    y -= 18;
  }

  y -= 10;

  // ── Totals box ───────────────────────────────────────────────────────────────
  const totalsX = width - 220;
  page.drawRectangle({ x: totalsX - 10, y: y - 65, width: 185, height: 75, color: COLORS.light });

  drawText(page, fontNormal, 'Subtotal (ex GST):',   totalsX,       y - 5,  9, COLORS.mid);
  drawText(page, fontNormal, `$${totalExGST.toFixed(2)}`, totalsX + 130, y - 5,  9, COLORS.dark);

  drawText(page, fontNormal, 'GST (10%):',           totalsX,       y - 20, 9, COLORS.mid);
  drawText(page, fontNormal, `$${gstAmount.toFixed(2)}`,   totalsX + 130, y - 20, 9, COLORS.dark);

  // Divider line
  page.drawLine({ start: { x: totalsX - 10, y: y - 28 }, end: { x: totalsX + 175, y: y - 28 }, thickness: 0.5, color: COLORS.mid });

  drawText(page, fontBold,   'TOTAL (inc GST):',     totalsX,       y - 42, 10, COLORS.primary);
  drawText(page, fontBold,   `$${totalIncGST.toFixed(2)} AUD`, totalsX + 115, y - 42, 10, COLORS.primary);

  y -= 100;

  // ── Footer notes ─────────────────────────────────────────────────────────────
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: COLORS.light });
  y -= 15;
  drawText(page, fontNormal, 'To accept this quote, please reply to this email or call us directly.', 40, y, 9, COLORS.mid);
  y -= 13;
  drawText(page, fontNormal, `This quote is valid for 30 days from ${formatDate(createdAt)}.`, 40, y, 9, COLORS.mid);
  y -= 13;
  drawText(page, fontNormal, 'All prices are in Australian Dollars (AUD). GST is included as shown.', 40, y, 9, COLORS.mid);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Generate a PDF invoice.
 *
 * @param {Object} invoiceData
 * @returns {Promise<Buffer>} PDF as a Buffer
 */
async function generateInvoicePDF(invoiceData) {
  const {
    invoiceNumber, quoteNumber, customerName, customerEmail, customerPhone,
    jobType, location, jobCompletedDate,
    lineItems = [], totalExGST, gstAmount, totalIncGST,
    issueDate, dueDate, bankDetails
  } = invoiceData;

  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();

  const fontBold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontNormal = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let y = height - 50;

  // ── Header ───────────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: COLORS.primary });
  page.drawText(process.env.BUSINESS_NAME || 'Rapid Response Plumbing', {
    x: 40, y: height - 45, size: 20, font: fontBold, color: COLORS.white
  });
  page.drawText('TAX INVOICE', {
    x: width - 145, y: height - 45, size: 22, font: fontBold, color: COLORS.white
  });

  y = height - 100;

  // Business meta
  drawText(page, fontNormal, `ABN: ${process.env.BUSINESS_ABN || ''}`, 40, y, 9, COLORS.mid);
  drawText(page, fontNormal, `Email: ${process.env.BUSINESS_EMAIL || ''}`, 40, y - 14, 9, COLORS.mid);
  drawText(page, fontNormal, `Phone: ${process.env.BUSINESS_PHONE || ''}`, 40, y - 28, 9, COLORS.mid);
  drawText(page, fontNormal, process.env.BUSINESS_ADDRESS || '', 40, y - 42, 9, COLORS.mid);

  // Invoice meta
  drawText(page, fontBold,   `Invoice #: ${invoiceNumber}`, width - 200, y, 10, COLORS.dark);
  if (quoteNumber) drawText(page, fontNormal, `Quote Ref: ${quoteNumber}`, width - 200, y - 15, 9, COLORS.mid);
  drawText(page, fontNormal, `Issue Date: ${formatDate(issueDate)}`, width - 200, y - 30, 9, COLORS.mid);
  drawText(page, fontNormal, `Due Date: ${formatDate(dueDate)}`, width - 200, y - 45, 9, COLORS.mid);

  y -= 75;

  // ── Bill to ──────────────────────────────────────────────────────────────────
  drawSectionHeader(page, fontBold, 'BILL TO', 40, y, width);
  y -= 20;
  drawText(page, fontBold,   customerName,       40, y,       11, COLORS.dark);
  drawText(page, fontNormal, customerEmail || '', 40, y - 14, 9,  COLORS.mid);
  drawText(page, fontNormal, customerPhone || '', 40, y - 28, 9,  COLORS.mid);
  drawText(page, fontNormal, `Job Location: ${location}`, 40, y - 42, 9, COLORS.mid);
  if (jobCompletedDate) {
    drawText(page, fontNormal, `Job Completed: ${formatDate(jobCompletedDate)}`, 40, y - 56, 9, COLORS.mid);
    y -= 14;
  }
  y -= 80;

  // ── Line items ───────────────────────────────────────────────────────────────
  drawSectionHeader(page, fontBold, 'SERVICES PROVIDED', 40, y, width);
  y -= 25;

  page.drawRectangle({ x: 40, y: y - 5, width: width - 80, height: 20, color: COLORS.light });
  drawText(page, fontBold, 'Description', 50,   y, 9, COLORS.dark);
  drawText(page, fontBold, 'Qty',         340,  y, 9, COLORS.dark);
  drawText(page, fontBold, 'Unit Price',  400,  y, 9, COLORS.dark);
  drawText(page, fontBold, 'Amount',      490,  y, 9, COLORS.dark);
  y -= 20;

  for (const item of lineItems) {
    drawText(page, fontNormal, item.description,                      50,  y, 9, COLORS.dark);
    drawText(page, fontNormal, String(item.qty),                      350, y, 9, COLORS.dark);
    drawText(page, fontNormal, `$${Number(item.unitPrice).toFixed(2)}`, 400, y, 9, COLORS.dark);
    drawText(page, fontNormal, `$${Number(item.amount).toFixed(2)}`,    490, y, 9, COLORS.dark);
    y -= 18;
  }

  y -= 15;

  // ── Totals ───────────────────────────────────────────────────────────────────
  const totalsX = width - 220;
  page.drawRectangle({ x: totalsX - 10, y: y - 70, width: 185, height: 80, color: COLORS.light });

  drawText(page, fontNormal, 'Subtotal (ex GST):',        totalsX,        y - 5,  9, COLORS.mid);
  drawText(page, fontNormal, `$${totalExGST.toFixed(2)}`, totalsX + 130,  y - 5,  9, COLORS.dark);
  drawText(page, fontNormal, 'GST (10%):',                totalsX,        y - 20, 9, COLORS.mid);
  drawText(page, fontNormal, `$${gstAmount.toFixed(2)}`,  totalsX + 130,  y - 20, 9, COLORS.dark);

  page.drawLine({ start: { x: totalsX - 10, y: y - 28 }, end: { x: totalsX + 175, y: y - 28 }, thickness: 0.5, color: COLORS.mid });

  drawText(page, fontBold, 'AMOUNT DUE:',                 totalsX,        y - 45, 11, COLORS.primary);
  drawText(page, fontBold, `$${totalIncGST.toFixed(2)} AUD`, totalsX + 100, y - 45, 11, COLORS.primary);

  drawText(page, fontNormal, `Payment Due By: ${formatDate(dueDate)}`, totalsX - 10, y - 62, 8, COLORS.mid);

  y -= 100;

  // ── Payment details ───────────────────────────────────────────────────────────
  drawSectionHeader(page, fontBold, 'PAYMENT DETAILS', 40, y, width);
  y -= 20;
  const bankLines = (bankDetails || process.env.BUSINESS_BANK_DETAILS || 'Contact us for bank details').split('|');
  for (const line of bankLines) {
    drawText(page, fontNormal, line.trim(), 40, y, 9, COLORS.dark);
    y -= 14;
  }
  drawText(page, fontNormal, `Reference: Invoice ${invoiceNumber}`, 40, y, 9, COLORS.mid);

  y -= 30;

  // ── Footer ────────────────────────────────────────────────────────────────────
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: COLORS.light });
  y -= 12;
  drawText(page, fontNormal, 'Thank you for your business! Payment within 14 days is greatly appreciated.', 40, y, 8, COLORS.mid);
  y -= 12;
  drawText(page, fontNormal, 'This is a tax invoice for GST purposes. ABN registered business.', 40, y, 8, COLORS.mid);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function drawText(page, font, text, x, y, size, color) {
  page.drawText(String(text), { x, y, size, font, color });
}

function drawSectionHeader(page, font, text, x, y, pageWidth) {
  page.drawRectangle({ x, y: y - 4, width: pageWidth - 80, height: 16, color: rgb(0.93, 0.93, 0.93) });
  page.drawText(text, { x: x + 5, y, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
}

module.exports = { generateQuotePDF, generateInvoicePDF };
