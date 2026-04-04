/**
 * Jobs Controller
 *
 * Manages the job scheduling dashboard.
 *
 *   POST  /api/jobs        — Create a new scheduled job
 *   GET   /api/jobs        — List all jobs (calendar data)
 *   GET   /api/jobs/:id    — Get a single job
 *   PATCH /api/jobs/:id    — Update job status or details
 */

const airtable = require('../services/airtable.service');

const JOB_STATUSES = ['Scheduled', 'In Progress', 'Completed', 'Invoiced'];

async function createJob(req, res) {
  try {
    const {
      customerName, customerEmail, customerPhone,
      jobType, address, scheduledDate, scheduledTime,
      notes, quoteRef
    } = req.body;

    if (!customerName || !jobType || !address || !scheduledDate) {
      return res.status(400).json({
        error: 'Missing required fields: customerName, jobType, address, scheduledDate'
      });
    }

    const jobNumber = `J-${Date.now().toString().slice(-6)}`;

    const job = await airtable.createJob({
      jobNumber,
      customerName,
      customerEmail: customerEmail || '',
      customerPhone: customerPhone || '',
      jobType,
      address,
      scheduledDate,
      scheduledTime: scheduledTime || '',
      status: 'Scheduled',
      notes: notes || '',
      quoteRef: quoteRef || '',
      createdAt: new Date().toISOString()
    });

    res.status(201).json({ success: true, job });
  } catch (err) {
    console.error('[Jobs] Error creating job:', err);
    res.status(500).json({ error: err.message });
  }
}

async function getAllJobs(req, res) {
  try {
    const jobs = await airtable.getAllJobs();
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getJob(req, res) {
  try {
    const job = await airtable.getJobById(req.params.id);
    res.json({ job });
  } catch (err) {
    res.status(404).json({ error: 'Job not found' });
  }
}

async function updateJob(req, res) {
  try {
    const allowedFields = ['status', 'scheduledDate', 'scheduledTime', 'notes', 'address'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (updates.status && !JOB_STATUSES.includes(updates.status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${JOB_STATUSES.join(', ')}`
      });
    }

    const job = await airtable.updateJob(req.params.id, updates);
    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { createJob, getAllJobs, getJob, updateJob };
