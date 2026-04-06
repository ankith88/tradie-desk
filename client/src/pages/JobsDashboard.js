/**
 * Jobs Dashboard
 *
 * Kanban-style job board. New jobs include full scheduling fields.
 * Schedule Job modal is shown immediately when quote is accepted.
 * Progress strips for multi-day jobs.
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const STATUS_CONFIG = {
  'Scheduled':  { color: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500' },
  'In Progress':{ color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  'On Hold':    { color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  'Completed':  { color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  'Invoiced':   { color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
};

const TIME_OPTIONS = ['Early Morning', 'Morning', 'Afternoon', 'Flexible'];

const EMPTY_FORM = {
  customerName: '', customerEmail: '', customerPhone: '',
  jobType: '', address: '', startDate: '', endDate: '',
  numberOfDays: '', timeOfDay: 'Morning', dailyStartTime: '',
  assignedTo: '', notes: '', quoteRef: ''
};

export default function JobsDashboard() {
  const [jobs,       setJobs]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [form,       setForm]       = useState(EMPTY_FORM);

  useEffect(() => { fetchJobs(); }, []);

  async function fetchJobs() {
    try {
      const res = await axios.get('/api/jobs');
      setJobs(res.data.jobs || []);
    } catch { setJobs([]); }
    finally { setLoading(false); }
  }

  // Auto-calculate number of days when both dates are set
  function handleDateChange(field, value) {
    const updated = { ...form, [field]: value };
    if (updated.startDate && updated.endDate) {
      const days = Math.max(1, Math.ceil((new Date(updated.endDate) - new Date(updated.startDate)) / (1000 * 60 * 60 * 24)) + 1);
      updated.numberOfDays = String(days);
    }
    setForm(updated);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post('/api/jobs', form);
      setSuccessMsg('Job scheduled!');
      setShowForm(false); setForm(EMPTY_FORM);
      fetchJobs();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) { alert(e.response?.data?.error || e.message); }
    finally { setSubmitting(false); }
  }

  async function updateStatus(id, status) {
    try { await axios.patch(`/api/jobs/${id}`, { status }); fetchJobs(); }
    catch { alert('Failed to update status'); }
  }

  const grouped = Object.keys(STATUS_CONFIG).reduce((acc, status) => {
    acc[status] = jobs.filter(j => j.status === status);
    return acc;
  }, {});

  function ProgressStrip({ total, done }) {
    if (!total || total <= 1) return null;
    return (
      <div className="flex gap-0.5 mt-2">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i < done ? 'bg-green-500' : 'bg-gray-200'}`} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Job Schedule</h2>
          <p className="text-gray-500 text-sm mt-1">{jobs.length} total jobs</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg">
          {showForm ? 'Cancel' : '+ Schedule Job'}
        </button>
      </div>

      {successMsg && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">✅ {successMsg}</div>}

      {/* New Job Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <h3 className="font-bold text-gray-800 mb-4">Schedule New Job</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            <input value={form.customerName}  onChange={e => setForm({...form, customerName: e.target.value})}  placeholder="Customer Name *" required className="inp" />
            <input value={form.customerEmail} onChange={e => setForm({...form, customerEmail: e.target.value})} placeholder="Email" type="email" className="inp" />
            <input value={form.customerPhone} onChange={e => setForm({...form, customerPhone: e.target.value})} placeholder="Phone" className="inp" />
            <select value={form.jobType} onChange={e => setForm({...form, jobType: e.target.value})} required className="inp">
              <option value="">Job Type *</option>
              {['General Plumbing','Leak Repair','Hot Water System Replacement','Drain Clearing','Bathroom Renovation','Emergency Call-Out'].map(t=><option key={t}>{t}</option>)}
            </select>
            <input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Job Address *" required className="inp col-span-2" />

            {/* Scheduling fields */}
            <div><label className="text-xs text-gray-500">Start Date *</label>
              <input type="date" value={form.startDate} onChange={e => handleDateChange('startDate', e.target.value)} required className="inp mt-1" /></div>
            <div><label className="text-xs text-gray-500">End Date</label>
              <input type="date" value={form.endDate} onChange={e => handleDateChange('endDate', e.target.value)} className="inp mt-1" /></div>
            <div><label className="text-xs text-gray-500">No. of Days</label>
              <input type="number" value={form.numberOfDays} onChange={e => setForm({...form, numberOfDays: e.target.value})} placeholder="1" min="1" className="inp mt-1" /></div>
            <div><label className="text-xs text-gray-500">Time of Day</label>
              <select value={form.timeOfDay} onChange={e => setForm({...form, timeOfDay: e.target.value})} className="inp mt-1">
                {TIME_OPTIONS.map(t=><option key={t}>{t}</option>)}</select></div>
            <div><label className="text-xs text-gray-500">Daily Start Time</label>
              <input type="time" value={form.dailyStartTime} onChange={e => setForm({...form, dailyStartTime: e.target.value})} className="inp mt-1" /></div>
            <div><label className="text-xs text-gray-500">Assigned To</label>
              <input value={form.assignedTo} onChange={e => setForm({...form, assignedTo: e.target.value})} placeholder="Steve" className="inp mt-1" /></div>

            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Notes (gate code, access, special instructions)" rows={2} className="inp col-span-2 resize-none" />
            <input value={form.quoteRef} onChange={e => setForm({...form, quoteRef: e.target.value})} placeholder="Quote Ref (e.g. Q-123456)" className="inp" />
            <button type="submit" disabled={submitting} className="py-2 bg-blue-600 text-white text-sm font-bold rounded-lg disabled:opacity-50">
              {submitting ? 'Scheduling...' : 'Schedule Job'}
            </button>
          </form>
        </div>
      )}

      {/* Kanban columns */}
      {loading ? <p className="text-gray-400">Loading jobs...</p>
        : jobs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-5xl mb-3">📅</p>
            <p className="text-lg font-medium">No jobs scheduled yet</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {Object.entries(grouped).map(([status, statusJobs]) => (
            <div key={status} className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="p-3 border-b border-gray-100 flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${STATUS_CONFIG[status].dot}`} />
                <h3 className="font-semibold text-gray-700 text-sm">{status}</h3>
                <span className="ml-auto bg-gray-100 text-gray-500 text-xs rounded-full px-2 py-0.5">{statusJobs.length}</span>
              </div>
              <div className="p-2 space-y-2 min-h-[80px]">
                {statusJobs.map(job => {
                  const total = job.numberOfDays || 1;
                  const done  = job.daysCompleted || 0;
                  return (
                    <div key={job.id} className="border border-gray-100 rounded-lg p-3 hover:border-blue-200 transition-colors">
                      <p className="font-medium text-gray-800 text-sm">{job.customerName}</p>
                      <p className="text-xs text-gray-500">{job.jobType}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{job.address}</p>
                      {job.startDate && (
                        <p className="text-xs font-medium text-blue-600 mt-1">
                          {new Date(job.startDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                          {total > 1 && ` · ${total} days`}
                        </p>
                      )}
                      {total > 1 && <ProgressStrip total={total} done={done} />}
                      {job.variationsTotal > 0 && (
                        <p className="text-xs text-orange-600 mt-1">Variations: +${Number(job.variationsTotal).toFixed(2)}</p>
                      )}
                      <select value={job.status} onChange={e => updateStatus(job.id, e.target.value)}
                        className="mt-2 w-full text-xs border border-gray-200 rounded px-2 py-1 text-gray-600">
                        {Object.keys(STATUS_CONFIG).map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .inp { width: 100%; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; }
        .inp:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
      `}</style>
    </div>
  );
}
