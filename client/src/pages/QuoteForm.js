/**
 * Quote Form Page
 *
 * Lets the user fill in job details and generate a professional AI quote.
 * On submit, calls POST /api/quotes which:
 *   → GPT writes the email  → PDF generated  → Email sent  → Saved to Airtable
 *
 * Also shows a live list of recent quotes with their status.
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const STATUS_COLORS = {
  'Sent':        'bg-blue-100 text-blue-700',
  'Followed Up': 'bg-yellow-100 text-yellow-700',
  'Accepted':    'bg-green-100 text-green-700',
  'Rejected':    'bg-red-100 text-red-700',
};

export default function QuoteForm() {
  const [form, setForm] = useState({
    customerName: '', customerEmail: '', customerPhone: '',
    jobType: '', location: '', estimatedHours: '', materialsNeeded: '', materialsCost: ''
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);
  const [quotes, setQuotes]   = useState([]);
  const [loadingQuotes, setLoadingQuotes] = useState(true);

  // Load existing quotes on mount
  useEffect(() => { fetchQuotes(); }, []);

  async function fetchQuotes() {
    try {
      const res = await axios.get('/api/quotes');
      setQuotes(res.data.quotes || []);
    } catch (e) {
      // Airtable may not be configured — show empty state
      setQuotes([]);
    } finally {
      setLoadingQuotes(false);
    }
  }

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await axios.post('/api/quotes', form);
      setResult(res.data);
      setForm({ customerName: '', customerEmail: '', customerPhone: '', jobType: '', location: '', estimatedHours: '', materialsNeeded: '', materialsCost: '' });
      fetchQuotes(); // Refresh list
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  // Quick pricing preview
  const labourCost   = (parseFloat(form.estimatedHours) || 0) * 120;
  const materials    = parseFloat(form.materialsCost) || 0;
  const subtotal     = labourCost + materials;
  const gst          = subtotal * 0.10;
  const total        = subtotal + gst;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* ── Left: Form ── */}
      <div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-1">New Quote</h2>
          <p className="text-sm text-gray-500 mb-6">Fill in the job details and AI will write a professional quote email with PDF attachment.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <fieldset>
              <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Customer Details</legend>
              <div className="grid grid-cols-2 gap-3">
                <input name="customerName"  value={form.customerName}  onChange={handleChange} placeholder="Full Name *" required className="input col-span-2" />
                <input name="customerEmail" value={form.customerEmail} onChange={handleChange} placeholder="Email *" type="email" required className="input" />
                <input name="customerPhone" value={form.customerPhone} onChange={handleChange} placeholder="Phone" className="input" />
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Job Details</legend>
              <div className="space-y-3">
                <select name="jobType" value={form.jobType} onChange={handleChange} required className="input">
                  <option value="">Select Job Type *</option>
                  <option>General Plumbing</option>
                  <option>Leak Repair</option>
                  <option>Hot Water System Replacement</option>
                  <option>Drain Clearing</option>
                  <option>Bathroom Renovation</option>
                  <option>Tap / Fixture Replacement</option>
                  <option>Emergency Call-Out</option>
                </select>
                <input name="location" value={form.location} onChange={handleChange} placeholder="Job Address *" required className="input" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">Hours × $120/hr</label>
                    <input name="estimatedHours" value={form.estimatedHours} onChange={handleChange} placeholder="Est. Hours *" type="number" min="0.5" step="0.5" required className="input mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Materials Cost (AUD)</label>
                    <input name="materialsCost" value={form.materialsCost} onChange={handleChange} placeholder="e.g. 250" type="number" min="0" className="input mt-1" />
                  </div>
                </div>
                <textarea name="materialsNeeded" value={form.materialsNeeded} onChange={handleChange} placeholder="Materials needed (for AI context)" rows={2} className="input resize-none" />
              </div>
            </fieldset>

            {/* Live price preview */}
            {subtotal > 0 && (
              <div className="bg-blue-50 rounded-lg p-4 text-sm space-y-1">
                <div className="flex justify-between text-gray-600">
                  <span>Labour ({form.estimatedHours}h × $120)</span>
                  <span>${labourCost.toFixed(2)}</span>
                </div>
                {materials > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Materials</span>
                    <span>${materials.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>GST (10%)</span>
                  <span>${gst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-blue-700 text-base border-t border-blue-200 pt-1 mt-1">
                  <span>Total (inc GST)</span>
                  <span>${total.toFixed(2)} AUD</span>
                </div>
              </div>
            )}

            <button type="submit" disabled={loading} className="w-full btn-primary">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Generating AI Quote...
                </span>
              ) : '✉️ Generate & Send Quote'}
            </button>
          </form>

          {/* Success / error messages */}
          {result && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700 font-medium">✅ {result.message}</p>
              <p className="text-sm text-green-600 mt-1">Quote #{result.quote?.quoteNumber} — Total: ${result.quote?.totalIncGST?.toFixed(2)} AUD (inc GST)</p>
            </div>
          )}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 font-medium">❌ {error}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Quote List ── */}
      <div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Recent Quotes</h2>
          {loadingQuotes ? (
            <p className="text-gray-400 text-sm">Loading...</p>
          ) : quotes.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-2">📋</p>
              <p>No quotes yet. Create your first one!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {quotes.map(q => (
                <div key={q.id} className="border border-gray-100 rounded-lg p-4 hover:border-blue-200 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-800">{q.customerName}</p>
                      <p className="text-sm text-gray-500">{q.jobType}</p>
                      <p className="text-xs text-gray-400 mt-1">{q.quoteNumber} · {q.location}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-800">${Number(q.totalIncGST).toFixed(2)}</p>
                      <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[q.status] || 'bg-gray-100 text-gray-600'}`}>
                        {q.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Global input styles injected via style tag */}
      <style>{`
        .input { width: 100%; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; transition: border-color 0.15s; }
        .input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
        .btn-primary { background: #2563eb; color: white; padding: 0.625rem 1rem; border-radius: 0.5rem; font-weight: 600; font-size: 0.875rem; border: none; cursor: pointer; transition: background 0.15s; }
        .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
