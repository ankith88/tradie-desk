const express = require('express');
const router  = express.Router();
const { createInvoice, getAllInvoices, getInvoice, updateInvoiceStatus } = require('../controllers/invoices.controller');

router.post('/',            createInvoice);        // Generate + send invoice
router.get('/',             getAllInvoices);        // List all invoices
router.get('/:id',          getInvoice);            // Get single invoice
router.patch('/:id/status', updateInvoiceStatus);   // Mark Paid / Unpaid

module.exports = router;
