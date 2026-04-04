const express = require('express');
const router  = express.Router();
const { runDemo } = require('../controllers/demo.controller');

// GET /api/demo — runs the full end-to-end automation demo
// Returns a step-by-step log of everything that happened
router.get('/', runDemo);
router.post('/', runDemo); // also accepts POST for flexibility

module.exports = router;
