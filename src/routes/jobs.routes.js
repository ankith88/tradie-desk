const express = require('express');
const router  = express.Router();
const { createJob, getRunToday, getAllJobs, getJob,
        startJob, markDayDone, completeJob, putOnHold,
        rescheduleJob, updateJob } = require('../controllers/jobs.controller');

router.post('/',                createJob);
router.get('/run',              getRunToday);      // must be before /:id
router.get('/',                 getAllJobs);
router.get('/:id',              getJob);
router.patch('/:id',            updateJob);
router.post('/:id/start',       startJob);
router.post('/:id/day-done',    markDayDone);
router.post('/:id/complete',    completeJob);
router.post('/:id/hold',        putOnHold);
router.post('/:id/reschedule',  rescheduleJob);

module.exports = router;
