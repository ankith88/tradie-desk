const express = require('express');
const router  = express.Router();
const { createInvoice, editInvoice, getAllInvoices, getInvoice,
        updateInvoiceStatus, toggleReminders } = require('../controllers/invoices.controller');

router.post('/',                   createInvoice);
router.get('/',                    getAllInvoices);
router.get('/:id',                 getInvoice);
router.put('/:id/edit',            editInvoice);
router.patch('/:id/status',        updateInvoiceStatus);
router.patch('/:id/reminders',     toggleReminders);

module.exports = router;
