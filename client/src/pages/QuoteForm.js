/**
 * Quote Form Page
 *
 * Create quotes and manage existing quotes.
 * Supports edit with versioning, history panel, and conditional re-send logic.
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const STATUS_COLORS = {
  'Sent':                'bg-blue-100 text-blue-700',
  'Followed Up':         'bg-yellow-100 text-yellow-700',
  'Accepted':            'bg-green-100 text-green-700',
  'Rejected':            'bg-red-100 text-red-700',
  'Awaiting Re-approval':'bg-orange-100 text-orange-700',
};

export default function QuoteForm() {
  const [form, setForm] = useState({
    customerName: '', customerEmail: '', customerPhone: '',
    jobType: '', location: '', estimatedHours: '', materialsNeeded: '', materialsCost: ''
  });
  const [loading,       setLoading]       = useState(false);
  const [result,        setResult]        = useState(null);
  const [error,         setError]         = useState(null);
  const [quotes,        setQuotes]        = useState([]);
  const [loadingQuotes, setLoadingQuotes] = useState(true);

  // Edit state
  const [editModal,     setEditModal]     = useState(null);  // quote being edited
  const [editForm,      setEditForm]      = useState({});
  const [editSubmitting,setEditSubmitting]= useState(false);
  const [editResult,    setEditResult]    = useState(null);

  // History panel
  const [historyPanel,  setHistoryPanel]  = useState(null);  // { quoteId, history }
  const [loadingHistory,setLoadingHistory]= useState(false);

  // Manual accept
  const [acceptingId,   setAcceptingId]   = useState(null);

  useEffect(() => { fetchQuotes(); }, []);

  async function fetchQuotes() {
    try {
      const res = await axios.get('/api/quotes');
      setQuotes(res.data.quotes || []);
    } catch { setQuotes([]); }
    finally { setLoadingQuotes(false); }
  }

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setResult(null); setError(null);
    try {
      const res = await axios.post('/api/quotes', form);
      setResult(res.data);
      setForm({ customerName: '', customerEmail: '', customerPhone: '', jobType: '', location: '', estimatedHours: '', materialsNeeded: '', materialsCost: '' });
      fetchQuotes();
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  }

  // ── Edit Quote ──────────────────────────────────────────────────────────────

  function openEditModal(quote) {
    setEditModal(quote);
    setEditForm({
      jobType:       quote.jobType       || '',
      location:      quote.location      || '',
      estimatedHours:quote.estimatedHours|| '',
      materialsNeeded:quote.materialsNeeded||'',
      materialsCost: '',
      changesSummary:''
    });
    setEditResult(null);
  }

  async function submitEdit(forceReApproval = false) {
    setEditSubmitting(true); setEditResult(null);
    try {
      const res = await axios.put(`/api/quotes/${editModal.id}/edit`, { ...editForm, forceReApproval });
      setEditResult(res.data);
      fetchQuotes();
    } catch (e) {
      setEditResult({ error: e.response?.data?.error || e.message });
    } finally { setEditSubmitting(false); }
  }

  async function acceptOnBehalf(quote) {
    if (!window.confirm(`Accept quote ${quote.quoteNumber} on behalf of ${quote.customerName}?`)) return;
    setAcceptingId(quote.id);
    try {
      await axios.patch(`/api/quotes/${quote.id}`, { status: 'Accepted' });
      fetchQuotes();
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setAcceptingId(null); }
  }

  async function loadHistory(quoteId) {
    setHistoryPanel(null); setLoadingHistory(true);
    try {
      const res = await axios.get(`/api/quotes/${quoteId}/history`);
      setHistoryPanel({ quoteId, ...res.data });
    } catch { setHistoryPanel({ quoteId, history: [], error: 'Could not load history' }); }
    finally { setLoadingHistory(false); }
  }

  // Live preview
  const labourCost = (parseFloat(form.estimatedHours) || 0) * 120;
  const materials  = parseFloat(form.materialsCost) || 0;
  const subtotal   = labourCost + materials;
  const gst        = subtotal * 0.10;
  const total      = subtotal + gst;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* ── Left: New Quote Form ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-1">New Quote</h2>
        <p className="text-sm text-gray-500 mb-6">AI writes a professional email + PDF, sent automatically.</p>
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
                <option value="">Select Job Type *</option>
                {['General Plumbing','Leak Repair','Hot Water System Replacement','Drain Clearing','Bathroom Renovation','Tap / Fixture Replacement','Emergency Call-Out'].map(t=><option key={t}>{t}</option>)}
              </select>
              <input name="location" value={form.location} onChange={handleChange} placeholder="Job Address *" required className="inp" />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Hours × $120/hr</label>
                  <input name="estimatedHours" value={form.estimatedHours} onChange={handleChange} placeholder="Hours *" type="number" min="0.5" step="0.5" required className="inp mt-1" /></div>
                <div><label className="text-xs text-gray-500">Materials Cost ($)</label>
                  <input name="materialsCost" value={form.materialsCost} onChange={handleChange} placeholder="e.g. 250" type="number" min="0" className="inp mt-1" /></div>
              </div>
              <textarea name="materialsNeeded" value={form.materialsNeeded} onChange={handleChange} placeholder="Materials description" rows={2} className="inp resize-none" />
            </div>
          </fieldset>
          {subtotal > 0 && (
            <div className="bg-blue-50 rounded-lg p-4 text-sm space-y-1">
              <div className="flex justify-between text-gray-600"><span>Labour ({form.estimatedHours}h × $120)</span><span>${labourCost.toFixed(2)}</span></div>
              {materials > 0 && <div className="flex justify-between text-gray-600"><span>Materials</span><span>${materials.toFixed(2)}</span></div>}
              <div className="flex justify-between text-gray-600"><span>GST (10%)</span><span>${gst.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-blue-700 text-base border-t border-blue-200 pt-1 mt-1"><span>Total (inc GST)</span><span>${total.toFixed(2)} AUD</span></div>
            </div>
          )}
          <button type="submit" disabled={loading} className="w-full btn-primary">
            {loading ? 'Generating AI Quote...' : '✉️ Generate & Send Quote'}
          </button>
        </form>
        {result && <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg"><p className="text-green-700 font-medium">✅ {result.message}</p></div>}
        {error  && <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg"><p className="text-red-700">❌ {error}</p></div>}
      </div>

      {/* ── Right: Quote List ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Recent Quotes</h2>
        {loadingQuotes ? <p className="text-gray-400 text-sm">Loading...</p>
          : quotes.length === 0 ? (
            <div className="text-center py-12 text-gray-400"><p className="text-4xl mb-2">📋</p><p>No quotes yet.</p></div>
          ) : (
          <div className="space-y-3">
            {quotes.map(q => (
              <div key={q.id} className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800">{q.customerName}</p>
                    <p className="text-sm text-gray-500">{q.jobType}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{q.quoteNumber} · v{q.version || 1}</p>
                  </div>
                  <div className="text-right ml-3">
                    <p className="font-bold text-gray-800">${Number(q.totalIncGST).toFixed(2)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[q.status] || 'bg-gray-100 text-gray-600'}`}>{q.status}</span>
                  </div>
                </div>
                {/* Action buttons */}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => openEditModal(q)}
                    className="flex-1 text-xs py-1.5 border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 font-medium">
                    ✏️ Edit Quote
                  </button>
                  <button onClick={() => loadHistory(q.id)}
                    className="text-xs py-1.5 px-3 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 font-medium">
                    🕐 History
                  </button>
                </div>
                {!['Accepted', 'Rejected'].includes(q.status) && (
                  <button
                    onClick={() => acceptOnBehalf(q)}
                    disabled={acceptingId === q.id}
                    className="w-full mt-2 text-xs py-1.5 bg-green-50 border border-green-300 text-green-700 rounded-lg hover:bg-green-100 font-medium disabled:opacity-50">
                    {acceptingId === q.id ? 'Accepting...' : '✅ Accept on behalf of client'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Edit Quote Modal ── */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h3 className="font-bold text-gray-800 text-lg mb-1">Edit Quote</h3>
            <p className="text-sm text-gray-500 mb-4">{editModal.quoteNumber} — {editModal.customerName} (current: v{editModal.version || 1})</p>

            {!editResult ? (
              <div className="space-y-3">
                <select value={editForm.jobType} onChange={e => setEditForm({...editForm, jobType: e.target.value})} className="inp">
                  {['General Plumbing','Leak Repair','Hot Water System Replacement','Drain Clearing','Bathroom Renovation','Tap / Fixture Replacement','Emergency Call-Out'].map(t=><option key={t}>{t}</option>)}
                </select>
                <input value={editForm.location} onChange={e => setEditForm({...editForm, location: e.target.value})} placeholder="Job Address" className="inp" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" value={editForm.estimatedHours} onChange={e => setEditForm({...editForm, estimatedHours: e.target.value})} placeholder="Hours" min="0.5" step="0.5" className="inp" />
                  <input type="number" value={editForm.materialsCost} onChange={e => setEditForm({...editForm, materialsCost: e.target.value})} placeholder="Materials cost ($)" min="0" className="inp" />
                </div>
                <textarea value={editForm.materialsNeeded} onChange={e => setEditForm({...editForm, materialsNeeded: e.target.value})} placeholder="Materials description" rows={2} className="inp resize-none" />
                <input value={editForm.changesSummary} onChange={e => setEditForm({...editForm, changesSummary: e.target.value})} placeholder="Summary of changes (for AI email context)" className="inp" />

                {editModal.status === 'Accepted' && (
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700">
                    ⚠️ This quote has already been accepted. Sending an update will require client re-approval.
                  </div>
                )}

                <div className="flex gap-2 mt-2">
                  <button onClick={() => setEditModal(null)} className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-600 text-sm font-medium">Cancel</button>
                  {editModal.status === 'Accepted' ? (
                    <>
                      <button onClick={() => submitEdit(false)} disabled={editSubmitting} className="flex-1 py-2 bg-gray-100 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium disabled:opacity-50">
                        Save Internally Only
                      </button>
                      <button onClick={() => submitEdit(true)} disabled={editSubmitting} className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                        {editSubmitting ? 'Sending...' : 'Send for Re-approval'}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => submitEdit(false)} disabled={editSubmitting} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">
                      {editSubmitting ? 'Updating...' : 'Update & Resend'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div>
                {editResult.error
                  ? <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">❌ {editResult.error}</div>
                  : <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
                      ✅ {editResult.message}
                      {editResult.emailSent && <p className="text-sm mt-1">Email sent to customer.</p>}
                    </div>
                }
                <button onClick={() => setEditModal(null)} className="w-full mt-4 py-2 border border-gray-300 rounded-lg text-gray-600 text-sm">Close</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── History Panel ── */}
      {(historyPanel || loadingHistory) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-800">Edit History</h3>
              <button onClick={() => setHistoryPanel(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            {loadingHistory ? <p className="text-gray-400 text-sm">Loading...</p>
              : historyPanel?.history?.length === 0 ? <p className="text-gray-400 text-sm">No edits recorded yet.</p>
              : (
              <div className="space-y-3">
                {(historyPanel?.history || []).map((h, i) => (
                  <div key={i} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-bold text-blue-600">v{h.version}</span>
                        <p className="text-sm text-gray-700 mt-0.5">{h.changes}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(h.changedAt).toLocaleString('en-AU')}</p>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        {h.previousTotal && <span className="line-through">${Number(h.previousTotal).toFixed(2)}</span>}
                        <span className="ml-2 font-medium text-gray-700">${Number(h.newTotal).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
