const express = require('express');
const router  = express.Router();
const { addVariation, getVariationsForJob, approveVariation } = require('../controllers/variations.controller');

router.post('/',                      addVariation);
router.get('/job/:jobId',             getVariationsForJob);
router.patch('/:id/approve',          approveVariation);

module.exports = router;
