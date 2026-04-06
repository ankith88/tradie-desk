const express = require('express');
const router  = express.Router();
const { addNote, getNotesForJob } = require('../controllers/jobnotes.controller');

router.post('/',           addNote);
router.get('/:jobId',      getNotesForJob);

module.exports = router;
