/**
 * Jobs Controller
 *
 *   POST   /api/jobs                     — Create / schedule a job
 *   GET    /api/jobs                     — List all jobs
 *   GET    /api/jobs/run                 — Today's run (jobs for today)
 *   GET    /api/jobs/:id                 — Get a single job + notes + variations
 *   PATCH  /api/jobs/:id                 — Update fields
 *   POST   /api/jobs/:id/start           — Start job (Scheduled → In Progress)
 *   POST   /api/jobs/:id/day-done        — Mark day complete + increment progress
 *   POST   /api/jobs/:id/complete        — Mark job complete (triggers invoice preview)
 *   POST   /api/jobs/:id/hold            — Put on hold
 *   POST   /api/jobs/:id/reschedule      — Reschedule + notify customer
 */

const airtable  = require('../services/airtable.service');
const { generateRescheduleEmail } = require('../services/openai.service');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = `${process.env.BUSINESS_NAME || 'Tradie Desk'} <${process.env.BUSINESS_EMAIL || 'onboarding@resend.dev'}>`;

const JOB_STATUSES = ['Scheduled', 'In Progress', 'On Hold', 'Completed', 'Invoiced'];

// ─── Create / Schedule Job ────────────────────────────────────────────────────

async function createJob(req, res) {
  try {
    const {
      customerName, customerEmail, customerPhone,
      jobType, address, startDate, endDate, numberOfDays,
      timeOfDay, dailyStartTime, assignedTo, notes, quoteRef,
      // legacy field aliases
      scheduledDate, scheduledTime
    } = req.body;

    if (!customerName || !jobType || !address) {
      return res.status(400).json({ error: 'Missing required fields: customerName, jobType, address' });
    }

    const jobNumber = `J-${Date.now().toString().slice(-6)}`;

    // Support both old scheduledDate and new startDate field names
    const start = startDate || scheduledDate || '';
    const end   = endDate || '';
    const days  = numberOfDays ? parseInt(numberOfDays) : (start && end
      ? Math.max(1, Math.ceil((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24)) + 1)
      : 1);

    const job = await airtable.createJob({
      jobNumber,
      customerName,
      customerEmail:   customerEmail   || '',
      customerPhone:   customerPhone   || '',
      jobType,
      address,
      startDate:       start,
      endDate:         end,
      scheduledDate:   start,          // keep legacy field populated
      numberOfDays:    days,
      daysCompleted:   0,
      completionPct:   0,
      timeOfDay:       timeOfDay       || 'Flexible',
      dailyStartTime:  dailyStartTime  || scheduledTime || '',
      assignedTo:      assignedTo      || '',
      scheduleNotes:   notes           || '',
      status:          'Scheduled',
      quoteRef:        quoteRef        || '',
      holdReason:      '',
      actualStartDate: '',
      actualEndDate:   '',
      createdAt:       new Date().toISOString()
    });

    res.status(201).json({ success: true, job });
  } catch (err) {
    console.error('[Jobs] Error creating job:', err);
    res.status(500).json({ error: err.message });
  }
}

// ─── My Run — Today's Jobs ────────────────────────────────────────────────────

async function getRunToday(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const jobs  = await airtable.getJobsForDate(today);

    // Attach notes and variations to each job for the run view
    const enriched = await Promise.all(jobs.map(async job => {
      const [notes, variations] = await Promise.all([
        airtable.getNotesForJob(job.id).catch(() => []),
        airtable.getVariationsForJob(job.id).catch(() => [])
      ]);
      const variationsTotal = variations.reduce((s, v) => s + (parseFloat(v.total) || 0), 0);
      return { ...job, notes, variations, variationsTotal };
    }));

    // Summary counts for the dashboard widget
    const completed = enriched.filter(j => j.status === 'Completed').length;
    const inProgress = enriched.filter(j => j.status === 'In Progress').length;

    res.json({ date: today, jobs: enriched, summary: { total: enriched.length, completed, inProgress } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Get All Jobs ─────────────────────────────────────────────────────────────

async function getAllJobs(req, res) {
  try {
    const view = req.query.view; // 'active' | undefined (all)
    const jobs = view === 'active' ? await airtable.getActiveJobs() : await airtable.getAllJobs();
    res.json({ jobs });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// ─── Get Single Job (with notes + variations) ─────────────────────────────────

async function getJob(req, res) {
  try {
    const job = await airtable.getJobById(req.params.id);
    const [notes, variations] = await Promise.all([
      airtable.getNotesForJob(req.params.id).catch(() => []),
      airtable.getVariationsForJob(req.params.id).catch(() => [])
    ]);
    const variationsTotal = variations.reduce((s, v) => s + (parseFloat(v.total) || 0), 0);
    res.json({ job: { ...job, notes, variations, variationsTotal } });
  } catch (err) { res.status(404).json({ error: 'Job not found' }); }
}

// ─── Start Job ────────────────────────────────────────────────────────────────

async function startJob(req, res) {
  try {
    const job = await airtable.updateJob(req.params.id, {
      status: 'In Progress',
      actualStartDate: new Date().toISOString().split('T')[0]
    });
    res.json({ success: true, job });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// ─── Mark Day Done ────────────────────────────────────────────────────────────

async function markDayDone(req, res) {
  try {
    const { note, addedBy } = req.body;
    const existing    = await airtable.getJobById(req.params.id);
    const totalDays   = existing.numberOfDays || 1;
    const newDaysCompleted = Math.min((existing.daysCompleted || 0) + 1, totalDays);
    const completionPct    = Math.round((newDaysCompleted / totalDays) * 100);

    const job = await airtable.updateJob(req.params.id, {
      daysCompleted: newDaysCompleted,
      completionPct
    });

    // Optionally save a note for this day
    if (note) {
      await airtable.createJobNote({
        jobId:    req.params.id,
        noteDate: new Date().toISOString().split('T')[0],
        noteText: note,
        addedBy:  addedBy || 'Steve'
      });
    }

    res.json({ success: true, job, daysCompleted: newDaysCompleted, completionPct });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// ─── Mark Job Complete ────────────────────────────────────────────────────────
// Returns the job + pre-built invoice data for the frontend preview modal

async function completeJob(req, res) {
  try {
    const existing   = await airtable.getJobById(req.params.id);
    const variations = await airtable.getVariationsForJob(req.params.id).catch(() => []);

    // Mark complete
    const job = await airtable.updateJob(req.params.id, {
      status:         'Completed',
      completionPct:  100,
      daysCompleted:  existing.numberOfDays || existing.daysCompleted || 1,
      actualEndDate:  new Date().toISOString().split('T')[0]
    });

    // Build invoice preview data from quote + variations
    const labourRate   = 120;
    const baseHours    = existing.estimatedHours || existing.numberOfDays || 1;
    const baseAmount   = baseHours * labourRate;
    const lineItems    = [
      { description: `Labour — ${existing.jobType}`, qty: baseHours, unitPrice: labourRate, amount: baseAmount }
    ];

    // Add approved variations
    const approvedVariations = variations.filter(v => v.clientApproved);
    for (const v of approvedVariations) {
      lineItems.push({ description: `Variation: ${v.description}`, qty: v.quantity, unitPrice: v.unitPrice, amount: v.total });
    }

    const totalExGST  = lineItems.reduce((s, i) => s + i.amount, 0);
    const gstAmount   = totalExGST * 0.10;
    const totalIncGST = totalExGST + gstAmount;

    const invoicePreview = {
      customerName:  existing.customerName,
      customerEmail: existing.customerEmail,
      customerPhone: existing.customerPhone,
      jobType:       existing.jobType,
      location:      existing.address,
      jobRef:        req.params.id,
      quoteRef:      existing.quoteRef || '',
      lineItems,
      totalExGST,
      gstAmount,
      totalIncGST,
      variationsTotal: approvedVariations.reduce((s, v) => s + parseFloat(v.total || 0), 0),
      pendingVariations: variations.filter(v => !v.clientApproved).length
    };

    res.json({ success: true, job, invoicePreview });
  } catch (err) {
    console.error('[Jobs] Error completing job:', err);
    res.status(500).json({ error: err.message });
  }
}

// ─── Put On Hold ──────────────────────────────────────────────────────────────

async function putOnHold(req, res) {
  try {
    const { reason } = req.body;
    const job = await airtable.updateJob(req.params.id, {
      status:     'On Hold',
      holdReason: reason || ''
    });
    res.json({ success: true, job });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// ─── Reschedule ───────────────────────────────────────────────────────────────

async function rescheduleJob(req, res) {
  try {
    const { startDate, endDate, numberOfDays, timeOfDay, dailyStartTime, notes } = req.body;
    const existing = await airtable.getJobById(req.params.id);

    const oldDates = `${existing.startDate || existing.scheduledDate || 'TBC'} – ${existing.endDate || 'TBC'}`;
    const newDates = `${startDate} – ${endDate || startDate}`;

    const days = numberOfDays ? parseInt(numberOfDays) : (startDate && endDate
      ? Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1)
      : existing.numberOfDays || 1);

    const job = await airtable.updateJob(req.params.id, {
      startDate, endDate, scheduledDate: startDate,
      numberOfDays: days,
      timeOfDay:   timeOfDay    || existing.timeOfDay,
      dailyStartTime: dailyStartTime || existing.dailyStartTime,
      scheduleNotes: notes || existing.scheduleNotes
    });

    // Send reschedule email to customer
    if (existing.customerEmail) {
      try {
        const emailBody = await generateRescheduleEmail(existing, oldDates, newDates);
        await resend.emails.send({
          from: FROM_EMAIL,
          to:   [existing.customerEmail],
          subject: `Your Job Has Been Rescheduled — ${process.env.BUSINESS_NAME}`,
          text:    emailBody
        });
        console.log(`[Jobs] Reschedule email sent to ${existing.customerEmail}`);
      } catch (emailErr) {
        console.warn('[Jobs] Reschedule email failed (non-fatal):', emailErr.message);
      }
    }

    res.json({ success: true, job });
  } catch (err) {
    console.error('[Jobs] Error rescheduling job:', err);
    res.status(500).json({ error: err.message });
  }
}

// ─── Generic Update ───────────────────────────────────────────────────────────

async function updateJob(req, res) {
  try {
    const allowed = ['status', 'startDate', 'endDate', 'scheduledDate', 'scheduledTime',
                     'dailyStartTime', 'scheduleNotes', 'address', 'assignedTo', 'timeOfDay'];
    const updates = {};
    for (const f of allowed) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }

    if (updates.status && !JOB_STATUSES.includes(updates.status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${JOB_STATUSES.join(', ')}` });
    }
    const job = await airtable.updateJob(req.params.id, updates);
    res.json({ success: true, job });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = { createJob, getRunToday, getAllJobs, getJob, startJob, markDayDone, completeJob, putOnHold, rescheduleJob, updateJob };
