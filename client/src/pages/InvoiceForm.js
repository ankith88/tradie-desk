/**
 * Invoice Form Page
 *
 * Generate and send a tax invoice to a customer.
 * Lists existing invoices with payment status tracking.
 * Allows marking invoices as Paid.
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const STATUS_COLORS = {
  'Unpaid':    'bg-red-100 text-red-700',
  'Paid':      'bg-green-100 text-green-700',
  'Overdue':   'bg-orange-100 text-orange-700',
  'Cancelled': 'bg-gray-100 text-gray-500',
};

export default function InvoiceForm() {
  const [form, setForm] = useState({
    customerName: '', customerEmail: '', customerPhone: '',
    jobType: '', location: '',
    labourHours: '', materialsCost: '', materialsDesc: ''
  });
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState(null);
  const [invoices, setInvoices]   = useState([]);
  const [loadingInv, setLoadingInv] = useState(true);

  useEffect(() => { fetchInvoices(); }, []);

  async function fetchInvoices() {
    try {
      const res = await axios.get('/api/invoices');
      setInvoices(res.data.invoices || []);
    } catch { setInvoices([]); }
    finally { setLoadingInv(false); }
  }

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setResult(null); setError(null);

    // Build line items from form inputs
    const labourCost   = (parseFloat(form.labourHours) || 0) * 120;
    const materials    = parseFloat(form.materialsCost) || 0;
    const totalExGST   = labourCost + materials;
    const gstAmount    = totalExGST * 0.10;
    const totalIncGST  = totalExGST + gstAmount;

    const lineItems = [];
    if (labourCost > 0) lineItems.push({ description: `Labour — ${form.jobType}`, qty: parseFloat(form.labourHours), unitPrice: 120, amount: labourCost });
    if (materials  > 0) lineItems.push({ description: `Materials — ${form.materialsDesc || 'Supplies'}`, qty: 1, unitPrice: materials, amount: materials });

    try {
      const res = await axios.post('/api/invoices', {
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone,
        jobType: form.jobType,
        location: form.location,
        lineItems, totalExGST, gstAmount, totalIncGST
      });
      setResult(res.data);
      setForm({ customerName: '', customerEmail: '', customerPhone: '', jobType: '', location: '', labourHours: '', materialsCost: '', materialsDesc: '' });
      fetchInvoices();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  async function markPaid(id) {
    try {
      await axios.patch(`/api/invoices/${id}/status`, { status: 'Paid' });
      fetchInvoices();
    } catch { alert('Failed to update'); }
  }

  // Live total
  const labourTotal = (parseFloat(form.labourHours) || 0) * 120;
  const matTotal    = parseFloat(form.materialsCost) || 0;
  const subtotal    = labourTotal + matTotal;
  const gst         = subtotal * 0.10;
  const total       = subtotal + gst;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* ── Left: Invoice Form ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Create Invoice</h2>
        <p className="text-sm text-gray-500 mb-6">Generates a PDF tax invoice with GST and emails it to the customer automatically.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset>
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Customer</legend>
            <div className="grid grid-cols-2 gap-3">
              <input name="customerName"  value={form.customerName}  onChange={handleChange} placeholder="Full Name *" required className="input col-span-2" />
              <input name="customerEmail" value={form.customerEmail} onChange={handleChange} placeholder="Email *" type="email" required className="input" />
              <input name="customerPhone" value={form.customerPhone} onChange={handleChange} placeholder="Phone" className="input" />
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Job</legend>
            <div className="space-y-3">
              <select name="jobType" value={form.jobType} onChange={handleChange} required className="input">
                <option value="">Job Type *</option>
                <option>General Plumbing</option>
                <option>Leak Repair</option>
                <option>Hot Water System Replacement</option>
                <option>Drain Clearing</option>
                <option>Bathroom Renovation</option>
                <option>Emergency Call-Out</option>
              </select>
              <input name="location" value={form.location} onChange={handleChange} placeholder="Job Address" className="input" />
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pricing</legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Hours × $120/hr</label>
                <input name="labourHours" value={form.labourHours} onChange={handleChange} placeholder="e.g. 2.5" type="number" min="0" step="0.5" className="input mt-1" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Materials ($)</label>
                <input name="materialsCost" value={form.materialsCost} onChange={handleChange} placeholder="e.g. 350" type="number" min="0" className="input mt-1" />
              </div>
              <input name="materialsDesc" value={form.materialsDesc} onChange={handleChange} placeholder="Materials description" className="input col-span-2" />
            </div>
          </fieldset>

          {/* Live GST preview */}
          {subtotal > 0 && (
            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1 border border-gray-100">
              <div className="flex justify-between text-gray-600"><span>Subtotal (ex GST)</span><span>${subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-gray-600"><span>GST (10%)</span><span>${gst.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-gray-800 text-base border-t border-gray-200 pt-2 mt-1">
                <span>Total (inc GST)</span><span>${total.toFixed(2)} AUD</span>
              </div>
              <p className="text-xs text-gray-400 pt-1">Due in 14 days from issue date</p>
            </div>
          )}

          <button type="submit" disabled={loading} className="w-full btn-primary">
            {loading ? 'Generating Invoice...' : '🧾 Generate & Send Invoice'}
          </button>
        </form>

        {result && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700 font-medium">✅ {result.message}</p>
            <p className="text-sm text-green-600 mt-1">Due: ${result.invoice?.totalIncGST?.toFixed(2)} AUD · Due {result.invoice?.dueDate}</p>
          </div>
        )}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 font-medium">❌ {error}</p>
          </div>
        )}
      </div>

      {/* ── Right: Invoice List ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Invoices</h2>
        {loadingInv ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : invoices.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-2">🧾</p>
            <p>No invoices yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map(inv => (
              <div key={inv.id} className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-800">{inv.customerName}</p>
                    <p className="text-sm text-gray-500">{inv.jobType}</p>
                    <p className="text-xs text-gray-400 mt-1">{inv.invoiceNumber} · Due {inv.dueDate}</p>
                    {inv.firstReminderSentAt  && <p className="text-xs text-orange-500 mt-0.5">1st reminder sent</p>}
                    {inv.secondReminderSentAt && <p className="text-xs text-red-500 mt-0.5">2nd reminder sent</p>}
                  </div>
                  <div className="text-right space-y-2">
                    <p className="font-bold text-gray-800">${Number(inv.totalIncGST).toFixed(2)}</p>
                    <span className={`text-xs px-2 py-1 rounded-full block text-center ${STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-600'}`}>
                      {inv.status}
                    </span>
                    {inv.status === 'Unpaid' && (
                      <button onClick={() => markPaid(inv.id)} className="text-xs text-green-600 hover:text-green-800 font-medium">
                        Mark Paid
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .input { width: 100%; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; }
        .input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
        .btn-primary { background: #2563eb; color: white; padding: 0.625rem 1rem; border-radius: 0.5rem; font-weight: 600; font-size: 0.875rem; border: none; cursor: pointer; }
        .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
