const express = require('express');
const router  = express.Router();
const { createQuote, editQuote, getQuoteHistory, restoreQuoteVersion,
        getAllQuotes, getQuote, updateQuoteStatus } = require('../controllers/quotes.controller');

router.post('/',                  createQuote);
router.get('/',                   getAllQuotes);
router.get('/:id',                getQuote);
router.patch('/:id',              updateQuoteStatus);
router.put('/:id/edit',           editQuote);
router.get('/:id/history',        getQuoteHistory);
router.post('/:id/restore',       restoreQuoteVersion);

module.exports = router;
