const express = require('express');
const router  = express.Router();
const { createQuote, getAllQuotes, getQuote, updateQuoteStatus } = require('../controllers/quotes.controller');

router.post('/',        createQuote);       // Create quote + send email
router.get('/',         getAllQuotes);       // List all quotes
router.get('/:id',      getQuote);          // Get single quote
router.patch('/:id',    updateQuoteStatus); // Update status

module.exports = router;
