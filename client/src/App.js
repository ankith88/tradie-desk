/**
 * App.js — Root Component
 *
 * Bottom navigation bar (mobile-style) + top notification bell.
 * Tabs: Dashboard (My Run today widget) | My Run | Quotes | Jobs | Invoices | Demo | Settings
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import QuoteForm     from './pages/QuoteForm';
import JobsDashboard from './pages/JobsDashboard';
import InvoiceForm   from './pages/InvoiceForm';
import DemoRunner    from './pages/DemoRunner';
import XeroSetup     from './pages/XeroSetup';
import MyRun         from './pages/MyRun';

// ── Nav items ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'run',      label: 'My Run',   icon: '🏃', component: MyRun },
  { id: 'quotes',   label: 'Quotes',   icon: '📋', component: QuoteForm },
  { id: 'jobs',     label: 'Jobs',     icon: '🗓', component: JobsDashboard },
  { id: 'invoices', label: 'Invoices', icon: '🧾', component: InvoiceForm },
  { id: 'demo',     label: 'Demo',     icon: '⚡', component: DemoRunner },
  { id: 'settings', label: 'Settings', icon: '⚙️', component: XeroSetup },
];

// ── Notification Bell ─────────────────────────────────────────────────────────
function NotificationBell() {
  const [counts,  setCounts]  = useState({ quotes: 0, jobs: 0, invoices: 0, variations: 0 });
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);

  async function fetchCounts() {
    setLoading(true);
    try {
      const [quotesRes, jobsRes, invoicesRes] = await Promise.all([
        axios.get('/api/quotes').catch(() => ({ data: { quotes: [] } })),
        axios.get('/api/jobs/run').catch(() => ({ data: { jobs: [] } })),
        axios.get('/api/invoices').catch(() => ({ data: { invoices: [] } }))
      ]);

      const quotes        = quotesRes.data.quotes || [];
      const todayJobs     = jobsRes.data.jobs || [];
      const invoices      = invoicesRes.data.invoices || [];

      const today = new Date().toISOString().split('T')[0];
      const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      setCounts({
        quotes:    quotes.filter(q => q.status === 'Sent' && q.createdAt < cutoff48h && !q.followUpSentAt).length,
        jobs:      todayJobs.filter(j => j.status === 'Scheduled').length,
        invoices:  invoices.filter(i => i.status === 'Overdue').length,
        variations:0  // could extend to count pending variation approvals
      });
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchCounts(); }, []);

  const total = counts.quotes + counts.jobs + counts.invoices + counts.variations;

  return (
    <div className="relative">
      <button onClick={() => { setOpen(!open); if (!open) fetchCounts(); }}
        className="relative p-2 text-blue-100 hover:text-white transition-colors">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-3 border-b border-gray-100 flex justify-between items-center">
            <h4 className="font-semibold text-gray-800 text-sm">Notifications</h4>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
          </div>
          <div className="divide-y divide-gray-50">
            {counts.quotes > 0 && (
              <div className="p-3 flex gap-3">
                <span className="text-yellow-500 text-lg">📋</span>
                <div><p className="text-sm font-medium text-gray-700">{counts.quotes} quote{counts.quotes !== 1 ? 's' : ''} awaiting follow-up</p>
                  <p className="text-xs text-gray-400">48h+ since sending</p></div>
              </div>
            )}
            {counts.jobs > 0 && (
              <div className="p-3 flex gap-3">
                <span className="text-blue-500 text-lg">🗓</span>
                <div><p className="text-sm font-medium text-gray-700">{counts.jobs} job{counts.jobs !== 1 ? 's' : ''} starting today</p>
                  <p className="text-xs text-gray-400">Check My Run view</p></div>
              </div>
            )}
            {counts.invoices > 0 && (
              <div className="p-3 flex gap-3">
                <span className="text-red-500 text-lg">💸</span>
                <div><p className="text-sm font-medium text-gray-700">{counts.invoices} overdue invoice{counts.invoices !== 1 ? 's' : ''}</p>
                  <p className="text-xs text-gray-400">Payment reminders will send automatically</p></div>
              </div>
            )}
            {total === 0 && (
              <div className="p-4 text-center text-gray-400 text-sm">All clear — nothing needs attention ✅</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Today's Run Summary Widget ─────────────────────────────────────────────────
function TodayWidget({ onNavigate }) {
  const [run, setRun] = useState(null);

  useEffect(() => {
    axios.get('/api/jobs/run')
      .then(r => setRun(r.data))
      .catch(() => setRun(null));
  }, []);

  if (!run || run.jobs.length === 0) return null;
  const next = run.jobs.find(j => j.status === 'Scheduled' || j.status === 'In Progress');

  return (
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4 mb-6 text-white cursor-pointer hover:from-blue-700 hover:to-blue-800 transition-colors"
      onClick={() => onNavigate('run')}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-blue-200 text-xs font-medium uppercase tracking-wide">Today's Run</p>
          <p className="text-2xl font-bold mt-0.5">{run.summary.total} jobs</p>
          <p className="text-blue-200 text-sm mt-1">
            ✅ {run.summary.completed} done &nbsp;·&nbsp; 🔧 {run.summary.inProgress} in progress
          </p>
        </div>
        {next && (
          <div className="text-right">
            <p className="text-blue-200 text-xs">Next up</p>
            <p className="font-semibold text-sm mt-0.5">{next.customerName}</p>
            <p className="text-blue-200 text-xs">{next.dailyStartTime || next.timeOfDay || 'Flexible'}</p>
          </div>
        )}
      </div>
      <p className="text-blue-300 text-xs mt-2">Tap to open My Run →</p>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState('run');
  const ActiveComponent = TABS.find(t => t.id === activeTab)?.component;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Top nav */}
      <nav className="bg-blue-700 shadow-lg sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔧</span>
              <div>
                <h1 className="text-white font-bold text-base leading-tight">Tradie Desk</h1>
                <p className="text-blue-300 text-xs">{process.env.REACT_APP_BUSINESS_NAME || 'Rapid Response Plumbing'}</p>
              </div>
            </div>
            <NotificationBell />
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Show today's run widget only on non-run tabs */}
        {activeTab !== 'run' && activeTab !== 'demo' && activeTab !== 'settings' && (
          <TodayWidget onNavigate={setActiveTab} />
        )}
        {ActiveComponent && <ActiveComponent />}
      </main>

      {/* Bottom navigation bar — mobile-style, always visible */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40">
        <div className="max-w-6xl mx-auto flex">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[56px] transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-600 border-t-2 border-blue-600 -mt-px'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="text-[10px] font-medium mt-0.5">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
