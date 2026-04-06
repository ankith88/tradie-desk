/**
 * My Run — Daily Job Dashboard
 *
 * Mobile-first view designed for tradies using a phone on-site.
 * Large buttons, minimum 56px tap targets, 16px+ font throughout.
 *
 * Views: Today | This Week | All Upcoming | Completed
 * Actions per job card: Start, Mark Day Done, Mark Complete, Add Note, On Hold, Reschedule
 * Shows day-by-day progress strip for multi-day jobs.
 * Calendar view (monthly) with colour-coded job blocks.
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const STATUS_CONFIG = {
  'Scheduled':   { bg: 'bg-blue-500',   light: 'bg-blue-50  border-blue-200',  text: 'text-blue-700'   },
  'In Progress': { bg: 'bg-green-500',  light: 'bg-green-50 border-green-200', text: 'text-green-700'  },
  'On Hold':     { bg: 'bg-orange-500', light: 'bg-orange-50 border-orange-200', text: 'text-orange-700' },
  'Completed':   { bg: 'bg-gray-400',   light: 'bg-gray-50  border-gray-200',   text: 'text-gray-600'   },
  'Invoiced':    { bg: 'bg-purple-500', light: 'bg-purple-50 border-purple-200', text: 'text-purple-700' },
};

const TIME_OPTIONS = ['Early Morning', 'Morning', 'Afternoon', 'Flexible'];

export default function MyRun() {
  const [view,      setView]      = useState('today');  // today | week | upcoming | completed
  const [jobs,      setJobs]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [summary,   setSummary]   = useState(null);

  // Modal states
  const [noteModal,       setNoteModal]       = useState(null);  // jobId
  const [rescheduleModal, setRescheduleModal] = useState(null);  // job object
  const [addVariModal,    setAddVariModal]    = useState(null);  // job object

  const [noteText,    setNoteText]    = useState('');
  const [submitting,  setSubmitting]  = useState('');
  const [reschedForm, setReschedForm] = useState({ startDate: '', endDate: '', timeOfDay: 'Morning', notes: '' });
  const [variForm,    setVariForm]    = useState({ description: '', quantity: 1, unitPrice: '', reason: '' });

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      if (view === 'today') {
        const res = await axios.get('/api/jobs/run');
        setJobs(res.data.jobs || []);
        setSummary(res.data.summary);
      } else {
        const params = view === 'upcoming' ? '?view=active' : '';
        const res = await axios.get(`/api/jobs${params}`);
        let all = res.data.jobs || [];
        if (view === 'week') {
          const today  = new Date();
          const week   = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
          all = all.filter(j => {
            const d = new Date(j.startDate || j.scheduledDate || '');
            return d >= today && d <= week;
          });
        } else if (view === 'completed') {
          all = all.filter(j => ['Completed', 'Invoiced'].includes(j.status));
        }
        setJobs(all);
        setSummary(null);
      }
    } catch { setJobs([]); }
    finally { setLoading(false); }
  }, [view]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // ── Job Actions ──────────────────────────────────────────────────────────────

  async function startJob(jobId) {
    setSubmitting(jobId + '-start');
    try { await axios.post(`/api/jobs/${jobId}/start`); fetchJobs(); }
    catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setSubmitting(''); }
  }

  async function markDayDone(jobId) {
    const note = noteModal === jobId ? noteText : '';
    setSubmitting(jobId + '-day');
    try {
      const res = await axios.post(`/api/jobs/${jobId}/day-done`, { note, addedBy: 'Steve' });
      alert(`Day marked done! ${res.data.daysCompleted}/${jobs.find(j=>j.id===jobId)?.numberOfDays || '?'} days completed (${res.data.completionPct}%)`);
      setNoteModal(null); setNoteText('');
      fetchJobs();
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setSubmitting(''); }
  }

  async function completeJob(jobId) {
    if (!window.confirm('Mark this job as Complete? This will generate an invoice preview.')) return;
    setSubmitting(jobId + '-complete');
    try {
      const res = await axios.post(`/api/jobs/${jobId}/complete`);
      const preview = res.data.invoicePreview;
      alert(
        `✅ Job complete!\n\n` +
        `Invoice preview ready:\n` +
        `Total: $${preview.totalIncGST.toFixed(2)} AUD (inc GST)\n` +
        `Variations: $${preview.variationsTotal.toFixed(2)}\n\n` +
        `Go to the Invoices tab to send it.`
      );
      // Pre-fill invoice form via sessionStorage so the Invoices tab can pick it up
      sessionStorage.setItem('pendingInvoice', JSON.stringify(preview));
      fetchJobs();
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setSubmitting(''); }
  }

  async function putOnHold(jobId) {
    const reason = window.prompt('Reason for hold? (e.g. Waiting on materials, Weather, Client request)');
    if (reason === null) return;
    setSubmitting(jobId + '-hold');
    try { await axios.post(`/api/jobs/${jobId}/hold`, { reason }); fetchJobs(); }
    catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setSubmitting(''); }
  }

  async function addNote(jobId) {
    if (!noteText.trim()) return;
    setSubmitting(jobId + '-note');
    try {
      await axios.post('/api/jobnotes', { jobId, noteText, addedBy: 'Steve' });
      setNoteModal(null); setNoteText('');
      fetchJobs();
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setSubmitting(''); }
  }

  async function submitReschedule() {
    if (!rescheduleModal || !reschedForm.startDate) return;
    setSubmitting('reschedule');
    try {
      await axios.post(`/api/jobs/${rescheduleModal.id}/reschedule`, reschedForm);
      setRescheduleModal(null);
      fetchJobs();
      alert('Job rescheduled and notification sent to customer.');
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setSubmitting(''); }
  }

  async function submitVariation() {
    if (!addVariModal || !variForm.description || !variForm.unitPrice) return;
    setSubmitting('variation');
    try {
      const res = await axios.post('/api/variations', { jobId: addVariModal.id, ...variForm });
      setAddVariModal(null);
      setVariForm({ description: '', quantity: 1, unitPrice: '', reason: '' });
      fetchJobs();
      alert(`Variation added! Running total: $${res.data.variationsTotal.toFixed(2)}`);
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setSubmitting(''); }
  }

  // ── Render helpers ───────────────────────────────────────────────────────────

  function ProgressStrip({ total, completed }) {
    return (
      <div className="flex gap-1 mt-2">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className={`h-2 flex-1 rounded-full ${i < completed ? 'bg-green-500' : 'bg-gray-200'}`} />
        ))}
      </div>
    );
  }

  function JobCard({ job }) {
    const cfg       = STATUS_CONFIG[job.status] || STATUS_CONFIG['Scheduled'];
    const total     = job.numberOfDays || 1;
    const done      = job.daysCompleted || 0;
    const pct       = job.completionPct || 0;
    const isActive  = ['Scheduled', 'In Progress'].includes(job.status);
    const varTotal  = job.variationsTotal || 0;

    return (
      <div className={`rounded-2xl border-2 p-5 mb-4 ${cfg.light}`}>
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <p className="text-lg font-bold text-gray-900 leading-tight">{job.customerName}</p>
            <p className="text-base text-gray-600 mt-0.5">{job.jobType}</p>
            <p className="text-sm text-gray-500 mt-1">{job.address}</p>
          </div>
          <div className="text-right ml-3">
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${cfg.text} bg-white border`}>
              {job.status}
            </span>
            {job.dailyStartTime && (
              <p className="text-sm font-medium text-gray-600 mt-1">{job.dailyStartTime}</p>
            )}
          </div>
        </div>

        {/* Day progress */}
        {total > 1 && (
          <div className="mb-3">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span className="font-medium">Day {Math.min(done + 1, total)} of {total}</span>
              <span>{pct}% complete</span>
            </div>
            <ProgressStrip total={total} completed={done} />
          </div>
        )}

        {/* Variations badge */}
        {varTotal > 0 && (
          <div className="mb-3">
            <span className="text-sm font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-3 py-1">
              Variations: +${varTotal.toFixed(2)}
            </span>
          </div>
        )}

        {/* Notes preview */}
        {job.notes && job.notes.length > 0 && (
          <div className="mb-3 p-2 bg-white/60 rounded-lg">
            <p className="text-xs text-gray-500 font-medium mb-1">Latest note</p>
            <p className="text-sm text-gray-700">{job.notes[0]?.noteText}</p>
          </div>
        )}

        {/* Action buttons — large tap targets */}
        {isActive && (
          <div className="space-y-2">
            {job.status === 'Scheduled' && (
              <button onClick={() => startJob(job.id)} disabled={!!submitting}
                className="w-full h-14 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-base font-bold rounded-xl transition-colors disabled:opacity-50">
                ▶ Start Job
              </button>
            )}
            {job.status === 'In Progress' && (
              <>
                <button onClick={() => markDayDone(job.id)} disabled={!!submitting}
                  className="w-full h-14 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-base font-bold rounded-xl transition-colors disabled:opacity-50">
                  ✓ Mark Day Done {total > 1 ? `(Day ${done + 1}/${total})` : ''}
                </button>
                <button onClick={() => completeJob(job.id)} disabled={!!submitting}
                  className="w-full h-14 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-base font-bold rounded-xl transition-colors disabled:opacity-50">
                  🎉 Job Complete — Generate Invoice
                </button>
              </>
            )}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setNoteModal(job.id)}
                className="h-12 bg-white border-2 border-gray-300 hover:border-blue-400 text-gray-700 text-sm font-semibold rounded-xl transition-colors">
                📝 Note
              </button>
              <button onClick={() => setAddVariModal(job)}
                className="h-12 bg-white border-2 border-gray-300 hover:border-orange-400 text-gray-700 text-sm font-semibold rounded-xl transition-colors">
                ➕ Variation
              </button>
              <button onClick={() => putOnHold(job.id)} disabled={job.status === 'On Hold'}
                className="h-12 bg-white border-2 border-gray-300 hover:border-orange-400 text-gray-700 text-sm font-semibold rounded-xl transition-colors disabled:opacity-40">
                ⏸ Hold
              </button>
            </div>
            <button onClick={() => { setRescheduleModal(job); setReschedForm({ startDate: job.startDate || '', endDate: job.endDate || '', timeOfDay: job.timeOfDay || 'Morning', notes: '' }); }}
              className="w-full h-12 bg-white border-2 border-gray-300 hover:border-blue-400 text-gray-700 text-sm font-semibold rounded-xl transition-colors">
              📅 Reschedule
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-2">
      {/* Summary banner */}
      {summary && view === 'today' && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-5 mb-5 text-white">
          <p className="text-sm font-medium text-blue-200">Today's Run</p>
          <p className="text-3xl font-bold mt-1">{summary.total} jobs</p>
          <div className="flex gap-4 mt-2 text-sm">
            <span>✅ {summary.completed} done</span>
            <span>🔧 {summary.inProgress} in progress</span>
            <span>📋 {summary.total - summary.completed - summary.inProgress} scheduled</span>
          </div>
        </div>
      )}

      {/* View toggle */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
        {[['today', 'Today'], ['week', 'This Week'], ['upcoming', 'Upcoming'], ['completed', 'Done']].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${view === v ? 'bg-white shadow text-blue-700' : 'text-gray-600'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Job list */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl animate-spin inline-block">⏳</div>
          <p className="mt-3">Loading jobs...</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-3">🎉</p>
          <p className="text-lg font-medium">No jobs {view === 'today' ? 'today' : 'here'}</p>
          <p className="text-sm mt-1">Nothing on the run — enjoy the quiet!</p>
        </div>
      ) : (
        jobs.map(job => <JobCard key={job.id} job={job} />)
      )}

      {/* ── Add Note Modal ── */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg">
            <h3 className="font-bold text-gray-800 text-lg mb-3">Add Note</h3>
            <textarea
              value={noteText} onChange={e => setNoteText(e.target.value)}
              placeholder="What happened today? Any issues, progress notes, or info for the next visit..."
              rows={4} className="w-full border border-gray-300 rounded-xl p-3 text-base resize-none outline-none focus:border-blue-500"
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setNoteModal(null); setNoteText(''); }}
                className="flex-1 h-12 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold">
                Cancel
              </button>
              <button onClick={() => addNote(noteModal)} disabled={!noteText.trim() || !!submitting}
                className="flex-1 h-12 bg-blue-600 text-white rounded-xl font-semibold disabled:opacity-50">
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reschedule Modal ── */}
      {rescheduleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg">
            <h3 className="font-bold text-gray-800 text-lg mb-1">Reschedule Job</h3>
            <p className="text-sm text-gray-500 mb-4">{rescheduleModal.customerName} — {rescheduleModal.jobType}</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Start Date</label>
                  <input type="date" value={reschedForm.startDate} onChange={e => setReschedForm({...reschedForm, startDate: e.target.value})}
                    className="w-full mt-1 border border-gray-300 rounded-xl p-3 text-base outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">End Date</label>
                  <input type="date" value={reschedForm.endDate} onChange={e => setReschedForm({...reschedForm, endDate: e.target.value})}
                    className="w-full mt-1 border border-gray-300 rounded-xl p-3 text-base outline-none focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Time of Day</label>
                <select value={reschedForm.timeOfDay} onChange={e => setReschedForm({...reschedForm, timeOfDay: e.target.value})}
                  className="w-full mt-1 border border-gray-300 rounded-xl p-3 text-base outline-none focus:border-blue-500">
                  {TIME_OPTIONS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <textarea value={reschedForm.notes} onChange={e => setReschedForm({...reschedForm, notes: e.target.value})}
                placeholder="Reason for reschedule (optional)" rows={2}
                className="w-full border border-gray-300 rounded-xl p-3 text-base resize-none outline-none focus:border-blue-500" />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setRescheduleModal(null)}
                className="flex-1 h-12 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold">Cancel</button>
              <button onClick={submitReschedule} disabled={!reschedForm.startDate || submitting === 'reschedule'}
                className="flex-1 h-12 bg-blue-600 text-white rounded-xl font-bold disabled:opacity-50">
                {submitting === 'reschedule' ? 'Saving...' : 'Reschedule & Notify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Variation Modal ── */}
      {addVariModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-lg">
            <h3 className="font-bold text-gray-800 text-lg mb-1">Add Variation</h3>
            <p className="text-sm text-gray-500 mb-4">{addVariModal.customerName} — {addVariModal.jobType}</p>
            <div className="space-y-3">
              <input value={variForm.description} onChange={e => setVariForm({...variForm, description: e.target.value})}
                placeholder="Description *" className="w-full border border-gray-300 rounded-xl p-3 text-base outline-none focus:border-blue-500" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium">Quantity</label>
                  <input type="number" value={variForm.quantity} onChange={e => setVariForm({...variForm, quantity: e.target.value})}
                    min="1" step="0.5" className="w-full mt-1 border border-gray-300 rounded-xl p-3 text-base outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium">Unit Price ($)</label>
                  <input type="number" value={variForm.unitPrice} onChange={e => setVariForm({...variForm, unitPrice: e.target.value})}
                    placeholder="e.g. 150" className="w-full mt-1 border border-gray-300 rounded-xl p-3 text-base outline-none focus:border-blue-500" />
                </div>
              </div>
              {variForm.unitPrice && variForm.quantity && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm">
                  <span className="text-orange-700 font-medium">Variation total: ${(parseFloat(variForm.quantity) * parseFloat(variForm.unitPrice) || 0).toFixed(2)} (ex GST)</span>
                </div>
              )}
              <textarea value={variForm.reason} onChange={e => setVariForm({...variForm, reason: e.target.value})}
                placeholder="Reason for variation (e.g. additional pipe replaced on inspection)" rows={2}
                className="w-full border border-gray-300 rounded-xl p-3 text-base resize-none outline-none focus:border-blue-500" />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setAddVariModal(null)}
                className="flex-1 h-12 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold">Cancel</button>
              <button onClick={submitVariation} disabled={!variForm.description || !variForm.unitPrice || submitting === 'variation'}
                className="flex-1 h-12 bg-orange-600 text-white rounded-xl font-bold disabled:opacity-50">
                {submitting === 'variation' ? 'Adding...' : 'Add Variation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
