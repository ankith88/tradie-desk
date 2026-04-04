/**
 * Jobs Dashboard Page
 *
 * Displays all scheduled jobs in a list view.
 * Allows creating new jobs and updating job status.
 * Status flow: Scheduled → In Progress → Completed → Invoiced
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const STATUS_CONFIG = {
  'Scheduled':  { color: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500' },
  'In Progress':{ color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  'Completed':  { color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  'Invoiced':   { color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
};

export default function JobsDashboard() {
  const [jobs, setJobs]                 = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [successMsg, setSuccessMsg]     = useState('');
  const [form, setForm] = useState({
    customerName: '', customerEmail: '', customerPhone: '',
    jobType: '', address: '', scheduledDate: '', scheduledTime: '', notes: '', quoteRef: ''
  });

  useEffect(() => { fetchJobs(); }, []);

  async function fetchJobs() {
    try {
      const res = await axios.get('/api/jobs');
      setJobs(res.data.jobs || []);
    } catch { setJobs([]); }
    finally { setLoading(false); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await axios.post('/api/jobs', form);
      setSuccessMsg('Job scheduled!');
      setShowForm(false);
      setForm({ customerName: '', customerEmail: '', customerPhone: '', jobType: '', address: '', scheduledDate: '', scheduledTime: '', notes: '', quoteRef: '' });
      fetchJobs();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id, status) {
    try {
      await axios.patch(`/api/jobs/${id}`, { status });
      fetchJobs();
    } catch (e) {
      alert('Failed to update status');
    }
  }

  // Group jobs by status for better overview
  const grouped = Object.keys(STATUS_CONFIG).reduce((acc, status) => {
    acc[status] = jobs.filter(j => j.status === status);
    return acc;
  }, {});

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Job Schedule</h2>
          <p className="text-gray-500 text-sm mt-1">{jobs.length} total jobs</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold">
          {showForm ? 'Cancel' : '+ Schedule Job'}
        </button>
      </div>

      {successMsg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">✅ {successMsg}</div>
      )}

      {/* New Job Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <h3 className="font-bold text-gray-800 mb-4">New Job</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            <input name="customerName"  value={form.customerName}  onChange={e => setForm({...form, customerName: e.target.value})}  placeholder="Customer Name *" required className="input" />
            <input name="customerEmail" value={form.customerEmail} onChange={e => setForm({...form, customerEmail: e.target.value})} placeholder="Email" type="email" className="input" />
            <input name="customerPhone" value={form.customerPhone} onChange={e => setForm({...form, customerPhone: e.target.value})} placeholder="Phone" className="input" />
            <select name="jobType" value={form.jobType} onChange={e => setForm({...form, jobType: e.target.value})} required className="input">
              <option value="">Job Type *</option>
              <option>General Plumbing</option>
              <option>Leak Repair</option>
              <option>Hot Water System Replacement</option>
              <option>Drain Clearing</option>
              <option>Bathroom Renovation</option>
              <option>Emergency Call-Out</option>
            </select>
            <input name="address" value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Job Address *" required className="input col-span-2" />
            <input name="scheduledDate" value={form.scheduledDate} onChange={e => setForm({...form, scheduledDate: e.target.value})} type="date" required className="input" />
            <input name="scheduledTime" value={form.scheduledTime} onChange={e => setForm({...form, scheduledTime: e.target.value})} type="time" className="input" />
            <textarea name="notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Notes (gate code, access info, etc.)" rows={2} className="input col-span-2 resize-none" />
            <input name="quoteRef" value={form.quoteRef} onChange={e => setForm({...form, quoteRef: e.target.value})} placeholder="Quote Ref (e.g. Q-123456)" className="input" />
            <button type="submit" disabled={submitting} className="btn-primary rounded-lg text-sm">
              {submitting ? 'Scheduling...' : 'Schedule Job'}
            </button>
          </form>
        </div>
      )}

      {/* Status columns */}
      {loading ? (
        <p className="text-gray-400">Loading jobs...</p>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-3">📅</p>
          <p className="text-lg font-medium">No jobs scheduled yet</p>
          <p className="text-sm">Click "Schedule Job" to add one</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Object.entries(grouped).map(([status, statusJobs]) => (
            <div key={status} className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${STATUS_CONFIG[status].dot}`} />
                <h3 className="font-semibold text-gray-700 text-sm">{status}</h3>
                <span className="ml-auto bg-gray-100 text-gray-500 text-xs rounded-full px-2 py-0.5">{statusJobs.length}</span>
              </div>
              <div className="p-3 space-y-2 min-h-[100px]">
                {statusJobs.map(job => (
                  <div key={job.id} className="border border-gray-100 rounded-lg p-3 hover:border-blue-200 transition-colors">
                    <p className="font-medium text-gray-800 text-sm">{job.customerName}</p>
                    <p className="text-xs text-gray-500">{job.jobType}</p>
                    <p className="text-xs text-gray-400 mt-1 truncate">{job.address}</p>
                    {job.scheduledDate && (
                      <p className="text-xs font-medium text-blue-600 mt-1">
                        {new Date(job.scheduledDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                        {job.scheduledTime && ` · ${job.scheduledTime}`}
                      </p>
                    )}
                    {/* Status update dropdown */}
                    <select
                      value={job.status}
                      onChange={e => updateStatus(job.id, e.target.value)}
                      className="mt-2 w-full text-xs border border-gray-200 rounded px-2 py-1 text-gray-600"
                    >
                      {Object.keys(STATUS_CONFIG).map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .input { width: 100%; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; }
        .input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
        .btn-primary { background: #2563eb; color: white; font-weight: 600; border: none; cursor: pointer; }
        .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
