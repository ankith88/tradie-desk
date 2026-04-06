/**
 * Invoice Form Page
 *
 * Create, preview, edit, and track invoices.
 * Picks up pending invoice data from sessionStorage when coming from job completion.
 * Shows edit history version badge, reminder toggle, and variation totals.
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const STATUS_COLORS = {
  'Draft':          'bg-gray-100 text-gray-600',
  'Unpaid':         'bg-red-100 text-red-700',
  'Sent':           'bg-blue-100 text-blue-700',
  'Overdue':        'bg-orange-100 text-orange-700',
  'Partially Paid': 'bg-yellow-100 text-yellow-700',
  'Paid':           'bg-green-100 text-green-700',
  'Cancelled':      'bg-gray-100 text-gray-400',
};

export default function InvoiceForm() {
  const [form, setForm] = useState({
    customerName: '', customerEmail: '', customerPhone: '',
    jobType: '', location: '', labourHours: '', materialsCost: '', materialsDesc: ''
  });
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState(null);
  const [invoices,   setInvoices]   = useState([]);
  const [loadingInv, setLoadingInv] = useState(true);

  // Preview modal (from job completion via sessionStorage)
  const [previewData,    setPreviewData]    = useState(null);
  const [previewSending, setPreviewSending] = useState(false);

  // Edit invoice modal
  const [editModal,   setEditModal]   = useState(null);
  const [editLineItems, setEditLineItems] = useState([]);
  const [editDueDate, setEditDueDate] = useState('');
  const [editNote,    setEditNote]    = useState('');
  const [editSend,    setEditSend]    = useState(true);
  const [editSubmitting, setEditSubmitting] = useState(false);

  useEffect(() => {
    fetchInvoices();
    // Check if we have a pending invoice from job completion
    const pending = sessionStorage.getItem('pendingInvoice');
    if (pending) {
      try {
        const data = JSON.parse(pending);
        setPreviewData(data);
        sessionStorage.removeItem('pendingInvoice');
      } catch { /* ignore */ }
    }
  }, []);

  async function fetchInvoices() {
    try {
      const res = await axios.get('/api/invoices');
      setInvoices(res.data.invoices || []);
    } catch { setInvoices([]); }
    finally { setLoadingInv(false); }
  }

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  async function handleSubmit(e, saveAsDraft = false) {
    e && e.preventDefault();
    setLoading(true); setResult(null); setError(null);

    const labourCost  = (parseFloat(form.labourHours) || 0) * 120;
    const materials   = parseFloat(form.materialsCost) || 0;
    const totalExGST  = labourCost + materials;
    const gstAmount   = totalExGST * 0.10;
    const totalIncGST = totalExGST + gstAmount;
    const lineItems   = [];
    if (labourCost > 0) lineItems.push({ description: `Labour — ${form.jobType}`, qty: parseFloat(form.labourHours), unitPrice: 120, amount: labourCost });
    if (materials  > 0) lineItems.push({ description: `Materials — ${form.materialsDesc || 'Supplies'}`, qty: 1, unitPrice: materials, amount: materials });

    try {
      const res = await axios.post('/api/invoices', {
        customerName: form.customerName, customerEmail: form.customerEmail,
        customerPhone: form.customerPhone, jobType: form.jobType,
        location: form.location, lineItems, totalExGST, gstAmount, totalIncGST,
        saveAsDraft
      });
      setResult(res.data);
      setForm({ customerName: '', customerEmail: '', customerPhone: '', jobType: '', location: '', labourHours: '', materialsCost: '', materialsDesc: '' });
      fetchInvoices();
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  }

  // Send invoice from the job-completion preview
  async function sendFromPreview() {
    if (!previewData) return;
    setPreviewSending(true);
    try {
      await axios.post('/api/invoices', { ...previewData, saveAsDraft: false });
      setPreviewData(null);
      fetchInvoices();
      alert('Invoice sent successfully!');
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setPreviewSending(false); }
  }

  async function savePreviewAsDraft() {
    if (!previewData) return;
    setPreviewSending(true);
    try {
      await axios.post('/api/invoices', { ...previewData, saveAsDraft: true });
      setPreviewData(null);
      fetchInvoices();
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setPreviewSending(false); }
  }

  // Edit invoice
  function openEditModal(inv) {
    setEditModal(inv);
    let li = [];
    try { li = JSON.parse(inv.lineItems || '[]'); } catch { li = []; }
    setEditLineItems(li.length > 0 ? li : [
      { description: inv.jobType || 'Service', qty: 1, unitPrice: Number(inv.totalExGST), amount: Number(inv.totalExGST) }
    ]);
    setEditDueDate(inv.dueDate || '');
    setEditNote('');
    setEditSend(true);
  }

  function updateLineItem(i, field, value) {
    const updated = [...editLineItems];
    updated[i][field] = field === 'description' ? value : parseFloat(value) || 0;
    if (field !== 'description') updated[i].amount = (updated[i].qty || 1) * (updated[i].unitPrice || 0);
    setEditLineItems(updated);
  }

  function addLineItem() {
    setEditLineItems([...editLineItems, { description: '', qty: 1, unitPrice: 0, amount: 0 }]);
  }

  function removeLineItem(i) {
    setEditLineItems(editLineItems.filter((_, idx) => idx !== i));
  }

  async function submitEdit() {
    setEditSubmitting(true);
    try {
      const res = await axios.put(`/api/invoices/${editModal.id}/edit`, {
        lineItems: editLineItems, dueDate: editDueDate, clientNote: editNote, sendUpdate: editSend
      });
      setEditModal(null);
      fetchInvoices();
      alert(res.data.message);
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setEditSubmitting(false); }
  }

  async function markPaid(id) {
    try { await axios.patch(`/api/invoices/${id}/status`, { status: 'Paid' }); fetchInvoices(); }
    catch { alert('Failed to update'); }
  }

  async function toggleReminders(id, disabled) {
    try { await axios.patch(`/api/invoices/${id}/reminders`, { disabled }); fetchInvoices(); }
    catch { alert('Failed to update'); }
  }

  // Totals preview
  const labourTotal = (parseFloat(form.labourHours) || 0) * 120;
  const matTotal    = parseFloat(form.materialsCost) || 0;
  const subtotal    = labourTotal + matTotal;
  const gst         = subtotal * 0.10;
  const total       = subtotal + gst;

  const editSubtotal  = editLineItems.reduce((s, i) => s + (i.amount || 0), 0);
  const editGST       = editSubtotal * 0.10;
  const editTotal     = editSubtotal + editGST;

  return (
    <div>
      {/* ── Job completion preview banner ── */}
      {previewData && (
        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-5 mb-6">
          <h3 className="font-bold text-green-800 text-lg mb-2">✅ Job Complete — Invoice Ready to Send</h3>
          <p className="text-sm text-green-700 mb-3">Review the details below before sending to {previewData.customerName}.</p>
          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div><span className="text-gray-500">Customer:</span> <span className="font-medium">{previewData.customerName}</span></div>
            <div><span className="text-gray-500">Job:</span> <span className="font-medium">{previewData.jobType}</span></div>
            <div><span className="text-gray-500">Total (inc GST):</span> <span className="font-bold text-green-700">${Number(previewData.totalIncGST).toFixed(2)}</span></div>
            {previewData.variationsTotal > 0 && (
              <div><span className="text-gray-500">Variations:</span> <span className="font-medium text-orange-600">+${Number(previewData.variationsTotal).toFixed(2)}</span></div>
            )}
            {previewData.pendingVariations > 0 && (
              <div className="col-span-2 text-orange-600 font-medium">⚠️ {previewData.pendingVariations} variation(s) pending client approval — approve them before sending</div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={sendFromPreview} disabled={previewSending} className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-sm disabled:opacity-50">
              {previewSending ? 'Sending...' : '📧 Send Invoice Now'}
            </button>
            <button onClick={savePreviewAsDraft} disabled={previewSending} className="flex-1 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg text-sm disabled:opacity-50">
              Save as Draft
            </button>
            <button onClick={() => setPreviewData(null)} className="px-4 py-2.5 text-gray-400 hover:text-gray-600 text-sm">Dismiss</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ── Left: Create Invoice Form ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-1">Create Invoice</h2>
          <p className="text-sm text-gray-500 mb-6">Generates PDF tax invoice with GST and emails it automatically.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <fieldset>
              <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Customer</legend>
              <div className="grid grid-cols-2 gap-3">
                <input name="customerName"  value={form.customerName}  onChange={handleChange} placeholder="Full Name *" required className="inp col-span-2" />
                <input name="customerEmail" value={form.customerEmail} onChange={handleChange} placeholder="Email *" type="email" required className="inp" />
                <input name="customerPhone" value={form.customerPhone} onChange={handleChange} placeholder="Phone" className="inp" />
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Job</legend>
              <div className="space-y-3">
                <select name="jobType" value={form.jobType} onChange={handleChange} required className="inp">
                  <option value="">Job Type *</option>
                  {['General Plumbing','Leak Repair','Hot Water System Replacement','Drain Clearing','Bathroom Renovation','Emergency Call-Out'].map(t=><option key={t}>{t}</option>)}
                </select>
                <input name="location" value={form.location} onChange={handleChange} placeholder="Job Address" className="inp" />
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-500">Hours × $120/hr</label>
                    <input name="labourHours" value={form.labourHours} onChange={handleChange} placeholder="e.g. 2.5" type="number" min="0" step="0.5" className="inp mt-1" /></div>
                  <div><label className="text-xs text-gray-500">Materials ($)</label>
                    <input name="materialsCost" value={form.materialsCost} onChange={handleChange} placeholder="e.g. 350" type="number" min="0" className="inp mt-1" /></div>
                </div>
                <input name="materialsDesc" value={form.materialsDesc} onChange={handleChange} placeholder="Materials description" className="inp" />
              </div>
            </fieldset>
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
            <div className="flex gap-3">
              <button type="submit" disabled={loading} className="flex-1 btn-primary">{loading ? 'Generating...' : '🧾 Send Invoice'}</button>
              <button type="button" onClick={e => handleSubmit(null, true)} disabled={loading} className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50">Save Draft</button>
            </div>
          </form>
          {result && <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg"><p className="text-green-700 font-medium">✅ {result.message}</p></div>}
          {error  && <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg"><p className="text-red-700 font-medium">❌ {error}</p></div>}
        </div>

        {/* ── Right: Invoice List ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Invoices</h2>
          {loadingInv ? <p className="text-gray-400 text-sm">Loading...</p>
            : invoices.length === 0 ? (
              <div className="text-center py-12 text-gray-400"><p className="text-4xl mb-2">🧾</p><p>No invoices yet</p></div>
            ) : (
            <div className="space-y-3">
              {invoices.map(inv => (
                <div key={inv.id} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800">{inv.customerName}</p>
                      <p className="text-sm text-gray-500">{inv.jobType}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{inv.invoiceNumber} · v{inv.version || 1} · Due {inv.dueDate}</p>
                      {inv.hasVariations && <p className="text-xs text-orange-600 mt-0.5">Variations: +${Number(inv.variationsTotal || 0).toFixed(2)}</p>}
                      {inv.reminder1SentAt && <p className="text-xs text-orange-500 mt-0.5">1st reminder sent</p>}
                      {inv.reminder2SentAt && <p className="text-xs text-orange-600 mt-0.5">2nd reminder sent</p>}
                      {inv.reminder3SentAt && <p className="text-xs text-red-600 mt-0.5 font-medium">⚠️ Final notice sent</p>}
                      {inv.remindersDisabled && <p className="text-xs text-gray-400 mt-0.5">Reminders disabled</p>}
                    </div>
                    <div className="text-right ml-3 space-y-1.5">
                      <p className="font-bold text-gray-800">${Number(inv.totalIncGST).toFixed(2)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full block text-center ${STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-600'}`}>{inv.status}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button onClick={() => openEditModal(inv)} className="text-xs py-1.5 px-3 border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 font-medium">✏️ Edit</button>
                    {inv.status !== 'Paid' && inv.status !== 'Cancelled' && (
                      <button onClick={() => markPaid(inv.id)} className="text-xs py-1.5 px-3 border border-green-300 text-green-600 rounded-lg hover:bg-green-50 font-medium">✓ Paid</button>
                    )}
                    <button onClick={() => toggleReminders(inv.id, !inv.remindersDisabled)}
                      className="text-xs py-1.5 px-3 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50">
                      {inv.remindersDisabled ? '🔔 Enable Reminders' : '🔕 Disable Reminders'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Edit Invoice Modal ── */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-gray-800 text-lg">Edit Invoice</h3>
                <p className="text-sm text-gray-500">{editModal.invoiceNumber} — {editModal.customerName}</p>
              </div>
              <button onClick={() => setEditModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Line items editor */}
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Line Items</h4>
              <div className="space-y-2">
                {editLineItems.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input value={item.description} onChange={e => updateLineItem(i, 'description', e.target.value)}
                      placeholder="Description" className="col-span-5 inp text-xs" />
                    <input type="number" value={item.qty} onChange={e => updateLineItem(i, 'qty', e.target.value)}
                      placeholder="Qty" min="0" step="0.5" className="col-span-2 inp text-xs text-center" />
                    <input type="number" value={item.unitPrice} onChange={e => updateLineItem(i, 'unitPrice', e.target.value)}
                      placeholder="Unit $" min="0" className="col-span-2 inp text-xs" />
                    <span className="col-span-2 text-xs text-gray-600 text-right">${(item.amount || 0).toFixed(2)}</span>
                    <button onClick={() => removeLineItem(i)} className="col-span-1 text-red-400 hover:text-red-600 text-xs">✕</button>
                  </div>
                ))}
              </div>
              <button onClick={addLineItem} className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium">+ Add line item</button>
            </div>

            {/* Totals preview */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
              <div className="flex justify-between text-gray-600"><span>Subtotal (ex GST)</span><span>${editSubtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-gray-600"><span>GST (10%)</span><span>${editGST.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-1 mt-1"><span>Total (inc GST)</span><span>${editTotal.toFixed(2)} AUD</span></div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div><label className="text-xs text-gray-500 font-medium">Due Date</label>
                <input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} className="inp mt-1" /></div>
            </div>

            <textarea value={editNote} onChange={e => setEditNote(e.target.value)}
              placeholder="Optional note to client (e.g. 'Updated to reflect additional work discussed on-site')"
              rows={2} className="inp resize-none mb-4 w-full" />

            {['Unpaid', 'Overdue', 'Sent'].includes(editModal.status) && (
              <div className="flex items-center gap-2 mb-4">
                <input type="checkbox" id="editSend" checked={editSend} onChange={e => setEditSend(e.target.checked)} className="w-4 h-4" />
                <label htmlFor="editSend" className="text-sm text-gray-700">Re-send updated invoice to {editModal.customerEmail}</label>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setEditModal(null)} className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-600 text-sm font-medium">Cancel</button>
              <button onClick={submitEdit} disabled={editSubmitting} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                {editSubmitting ? 'Saving...' : editSend ? 'Save & Resend' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .inp { width: 100%; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; }
        .inp:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
        .btn-primary { background: #2563eb; color: white; padding: 0.625rem 1rem; border-radius: 0.5rem; font-weight: 600; font-size: 0.875rem; border: none; cursor: pointer; }
        .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
