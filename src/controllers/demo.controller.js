/**
 * Demo Controller — End-to-End Simulation
 *
 * The /demo endpoint runs the FULL automation workflow in one shot:
 *
 *   1. Create a quote (GPT generates email + PDF, sends to customer)
 *   2. Simulate 48 hours passing → send follow-up email
 *   3. Accept the quote → create a job
 *   4. Complete the job → generate and send invoice
 *   5. Return a full log of every step
 *
 * This is designed to show clients the entire system working end-to-end.
 * It uses the DEMO_EMAIL env var (or falls back to BUSINESS_EMAIL) so you
 * don't accidentally email real customers during demos.
 */

const { generateQuoteEmail, generateFollowUpEmail } = require('../services/openai.service');
const { generateQuotePDF, generateInvoicePDF } = require('../services/pdf.service');
const { sendQuoteEmail, sendFollowUpEmail, sendInvoiceEmail } = require('../services/email.service');
const airtable = require('../services/airtable.service');

// Sample customer data used for demo — looks realistic for a client presentation
const DEMO_CUSTOMER = {
  customerName:    'John Mitchell',
  customerEmail:   process.env.DEMO_EMAIL || process.env.BUSINESS_EMAIL || 'demo@example.com',
  customerPhone:   '0421 987 654',
  jobType:         'Hot Water System Replacement',
  location:        '42 Harbour View Rd, Manly NSW 2095',
  estimatedHours:  3,
  materialsNeeded: 'Rheem 250L gas hot water unit, copper fittings, isolation valve',
  materialsCost:   680
};

async function runDemo(req, res) {
  const log = [];     // Running log of every step (returned to caller)
  const startTime = Date.now();

  const step = (msg, data = null) => {
    const entry = { step: log.length + 1, message: msg, timestamp: new Date().toISOString(), data };
    log.push(entry);
    console.log(`[Demo] Step ${entry.step}: ${msg}`);
    return entry;
  };

  try {
    step('Demo workflow started', { customer: DEMO_CUSTOMER.customerName });

    // ══ STEP 1: Create Quote ════════════════════════════════════════════════
    step('Calculating quote pricing...');

    const labourCost  = DEMO_CUSTOMER.estimatedHours * 120;
    const materials   = DEMO_CUSTOMER.materialsCost;
    const totalExGST  = labourCost + materials;
    const gstAmount   = totalExGST * 0.10;
    const totalIncGST = totalExGST + gstAmount;
    const quoteNumber = `Q-DEMO-${Date.now().toString().slice(-4)}`;
    const createdAt   = new Date().toISOString();
    const validUntil  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const quoteData = {
      ...DEMO_CUSTOMER,
      quoteNumber, createdAt, validUntil,
      lineItems: [
        { description: `Labour — ${DEMO_CUSTOMER.jobType}`, qty: DEMO_CUSTOMER.estimatedHours, unitPrice: 120, amount: labourCost },
        { description: `Materials — ${DEMO_CUSTOMER.materialsNeeded}`, qty: 1, unitPrice: materials, amount: materials }
      ],
      totalExGST, gstAmount, totalIncGST
    };

    step('Generating AI quote email via GPT-4o...');
    const quoteEmailBody = await generateQuoteEmail(quoteData);

    step('Generating PDF quote...');
    const quotePDF = await generateQuotePDF(quoteData);

    step(`Sending quote email to ${DEMO_CUSTOMER.customerEmail}...`);
    await sendQuoteEmail(DEMO_CUSTOMER.customerEmail, DEMO_CUSTOMER.customerName, quoteEmailBody, quoteNumber, quotePDF);

    let savedQuote;
    try {
      savedQuote = await airtable.createQuote({
        quoteNumber,
        customerName: DEMO_CUSTOMER.customerName,
        customerEmail: DEMO_CUSTOMER.customerEmail,
        customerPhone: DEMO_CUSTOMER.customerPhone,
        jobType: DEMO_CUSTOMER.jobType,
        location: DEMO_CUSTOMER.location,
        estimatedHours: DEMO_CUSTOMER.estimatedHours,
        materialsNeeded: DEMO_CUSTOMER.materialsNeeded,
        totalExGST, gstAmount, totalIncGST,
        status: 'Sent',
        emailBody: quoteEmailBody,
        createdAt, validUntil,
        followUpSentAt: ''
      });
      step('Quote saved to Airtable', { quoteId: savedQuote.id });
    } catch (airtableErr) {
      step('⚠️  Airtable save skipped (not configured) — continuing demo', { reason: airtableErr.message });
      savedQuote = { id: 'demo-quote-id', quoteNumber, ...quoteData };
    }

    step('✅ STEP 1 COMPLETE — Quote created and sent!', {
      quoteNumber,
      totalExGST: `$${totalExGST.toFixed(2)}`,
      gstAmount:  `$${gstAmount.toFixed(2)}`,
      totalIncGST:`$${totalIncGST.toFixed(2)}`
    });

    // ══ STEP 2: Follow-Up Email ═════════════════════════════════════════════
    step('Simulating 48-hour wait (follow-up trigger)...');
    step('Generating personalised AI follow-up email via GPT-4o...');
    const followUpBody = await generateFollowUpEmail(quoteData);

    step(`Sending follow-up email to ${DEMO_CUSTOMER.customerEmail}...`);
    await sendFollowUpEmail(DEMO_CUSTOMER.customerEmail, DEMO_CUSTOMER.customerName, followUpBody, quoteNumber);

    try {
      await airtable.updateQuote(savedQuote.id, { status: 'Followed Up', followUpSentAt: new Date().toISOString() });
    } catch (_) { /* Airtable may not be configured */ }

    step('✅ STEP 2 COMPLETE — Follow-up email sent!');

    // ══ STEP 3: Accept Quote → Schedule Job ════════════════════════════════
    step('Customer accepted the quote — scheduling job...');

    const jobNumber = `J-DEMO-${Date.now().toString().slice(-4)}`;
    const tomorrow  = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let savedJob;
    try {
      savedJob = await airtable.createJob({
        jobNumber,
        customerName:  DEMO_CUSTOMER.customerName,
        customerEmail: DEMO_CUSTOMER.customerEmail,
        customerPhone: DEMO_CUSTOMER.customerPhone,
        jobType:       DEMO_CUSTOMER.jobType,
        address:       DEMO_CUSTOMER.location,
        scheduledDate: tomorrow,
        scheduledTime: '09:00',
        status:        'Scheduled',
        notes:         'Customer prefers morning start. Gate code: 1234.',
        quoteRef:      quoteNumber,
        createdAt:     new Date().toISOString()
      });
      await airtable.updateQuote(savedQuote.id, { status: 'Accepted' });
      step('✅ STEP 3 COMPLETE — Job scheduled in dashboard!', { jobNumber, date: tomorrow });
    } catch (airtableErr) {
      step('✅ STEP 3 COMPLETE — Job created (Airtable save skipped)', { jobNumber, date: tomorrow });
      savedJob = { id: 'demo-job-id', jobNumber };
    }

    // ══ STEP 4: Complete Job → Send Invoice ════════════════════════════════
    step('Marking job as completed — generating invoice...');

    const invoiceNumber  = `INV-DEMO-${Date.now().toString().slice(-4)}`;
    const issueDate      = new Date().toISOString().split('T')[0];
    const dueDate        = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const invoiceData = {
      invoiceNumber,
      quoteRef:    quoteNumber,
      jobRef:      jobNumber,
      customerName: DEMO_CUSTOMER.customerName,
      customerEmail: DEMO_CUSTOMER.customerEmail,
      customerPhone: DEMO_CUSTOMER.customerPhone,
      jobType:     DEMO_CUSTOMER.jobType,
      location:    DEMO_CUSTOMER.location,
      jobCompletedDate: new Date().toISOString(),
      lineItems:   quoteData.lineItems,
      totalExGST, gstAmount, totalIncGST,
      issueDate, dueDate,
      bankDetails: process.env.BUSINESS_BANK_DETAILS
    };

    step('Generating PDF invoice with GST breakdown...');
    const invoicePDF = await generateInvoicePDF(invoiceData);

    const invoiceEmailBody = `Hi ${DEMO_CUSTOMER.customerName},

Thank you for choosing ${process.env.BUSINESS_NAME || 'Rapid Response Plumbing'} — great working with you today!

Please find your tax invoice attached (${invoiceNumber}).

Amount Due: $${totalIncGST.toFixed(2)} AUD (inc GST)
Due Date: ${new Date(dueDate).toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })}

Payment details are on the invoice. Use ${invoiceNumber} as your reference.

Cheers,
Steve
${process.env.BUSINESS_NAME || 'Rapid Response Plumbing'}`;

    step(`Sending invoice to ${DEMO_CUSTOMER.customerEmail}...`);
    await sendInvoiceEmail(DEMO_CUSTOMER.customerEmail, DEMO_CUSTOMER.customerName, invoiceEmailBody, invoiceNumber, invoicePDF);

    try {
      await airtable.createInvoice({
        invoiceNumber, quoteRef: quoteNumber, jobRef: jobNumber,
        customerName: DEMO_CUSTOMER.customerName,
        customerEmail: DEMO_CUSTOMER.customerEmail,
        customerPhone: DEMO_CUSTOMER.customerPhone,
        jobType: DEMO_CUSTOMER.jobType,
        location: DEMO_CUSTOMER.location,
        totalExGST, gstAmount, totalIncGST,
        issueDate, dueDate,
        status: 'Unpaid',
        firstReminderSentAt: '', secondReminderSentAt: ''
      });
      await airtable.updateJob(savedJob.id, { status: 'Invoiced' });
    } catch (_) { /* Airtable may not be configured */ }

    step('✅ STEP 4 COMPLETE — Invoice sent!', {
      invoiceNumber,
      amount:   `$${totalIncGST.toFixed(2)} AUD (inc GST)`,
      dueDate
    });

    // ══ Summary ═════════════════════════════════════════════════════════════
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    step(`🎉 DEMO COMPLETE in ${duration}s — Full automation workflow demonstrated!`);

    res.json({
      success: true,
      summary: {
        quoteNumber,
        invoiceNumber,
        customer:     DEMO_CUSTOMER.customerName,
        email:        DEMO_CUSTOMER.customerEmail,
        totalIncGST: `$${totalIncGST.toFixed(2)} AUD`,
        emailsSent:   4,  // quote, follow-up, invoice (payment reminders are cron-based)
        durationSeconds: parseFloat(duration)
      },
      steps: log
    });

  } catch (err) {
    console.error('[Demo] Error during demo workflow:', err);
    step(`❌ Demo failed at step ${log.length}: ${err.message}`);
    res.status(500).json({
      success: false,
      error: err.message,
      completedSteps: log
    });
  }
}

module.exports = { runDemo };
