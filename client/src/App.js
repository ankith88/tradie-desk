/**
 * App.js — Root Component
 *
 * Simple tab-based navigation. Each tab is a full feature module.
 * No router needed — keeps the demo setup simple.
 */

import React, { useState } from 'react';
import QuoteForm from './pages/QuoteForm';
import JobsDashboard from './pages/JobsDashboard';
import InvoiceForm from './pages/InvoiceForm';
import DemoRunner from './pages/DemoRunner';
import XeroSetup from './pages/XeroSetup';

const TABS = [
  { id: 'quotes',   label: '📋 Quotes',    component: QuoteForm },
  { id: 'jobs',     label: '📅 Jobs',      component: JobsDashboard },
  { id: 'invoices', label: '🧾 Invoices',  component: InvoiceForm },
  { id: 'demo',     label: '⚡ Demo',      component: DemoRunner },
  { id: 'settings', label: '⚙️ Settings',  component: XeroSetup },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('quotes');

  const ActiveComponent = TABS.find(t => t.id === activeTab)?.component;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top Nav ── */}
      <nav className="bg-blue-700 shadow-lg">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔧</span>
              <div>
                <h1 className="text-white font-bold text-lg leading-tight">Tradie Desk</h1>
                <p className="text-blue-200 text-xs">Rapid Response Plumbing</p>
              </div>
            </div>
            <div className="flex gap-1">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-white text-blue-700'
                      : 'text-blue-100 hover:bg-blue-600'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </nav>

      {/* ── Page Content ── */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {ActiveComponent && <ActiveComponent />}
      </main>
    </div>
  );
}
