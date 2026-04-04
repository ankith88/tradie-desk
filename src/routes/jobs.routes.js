const express = require('express');
const router  = express.Router();
const { createJob, getAllJobs, getJob, updateJob } = require('../controllers/jobs.controller');

router.post('/',     createJob);   // Schedule new job
router.get('/',      getAllJobs);   // Get all jobs (calendar feed)
router.get('/:id',   getJob);      // Get single job
router.patch('/:id', updateJob);   // Update status, date, notes

module.exports = router;
