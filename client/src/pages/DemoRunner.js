/**
 * Demo Runner Page
 *
 * One-click demo that triggers the full end-to-end automation workflow:
 *   Quote → Follow-Up → Job Scheduled → Invoice Sent
 *
 * Shows a live step-by-step log as each stage completes.
 * Perfect for client demos — just hit the button and watch it run.
 */

import React, { useState } from 'react';
import axios from 'axios';

export default function DemoRunner() {
  const [running, setRunning]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);

  async function runDemo() {
    setRunning(true);
    setResult(null);
    setError(null);

    try {
      const res = await axios.get('/api/demo');
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      if (e.response?.data?.completedSteps) {
        setResult({ steps: e.response.data.completedSteps, success: false });
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-8 text-white mb-6">
        <h2 className="text-2xl font-bold mb-2">⚡ End-to-End Demo</h2>
        <p className="text-blue-100 mb-6">
          Runs the complete Tradie Desk automation in one click. A real quote email + PDF is sent,
          followed by a follow-up, then an invoice — all powered by GPT-4o.
        </p>
        <div className="grid grid-cols-4 gap-2 text-center text-sm mb-6">
          {['1. Create Quote', '2. Follow-Up Email', '3. Schedule Job', '4. Send Invoice'].map((step, i) => (
            <div key={i} className="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
              <p className="font-medium">{step}</p>
            </div>
          ))}
        </div>
        <button
          onClick={runDemo}
          disabled={running}
          className="bg-white text-blue-700 font-bold px-8 py-3 rounded-xl text-sm hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {running ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Running Demo... (this takes ~15-20 seconds)
            </span>
          ) : '🚀 Run Full Demo Now'}
        </button>
        {running && (
          <p className="text-blue-200 text-xs mt-3">
            GPT is writing emails, PDFs are being generated, real emails are being sent...
          </p>
        )}
      </div>

      {/* Summary card */}
      {result?.summary && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
          <h3 className="font-bold text-green-800 text-lg mb-3">✅ Demo Complete!</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-500">Customer:</span> <span className="font-medium">{result.summary.customer}</span></div>
            <div><span className="text-gray-500">Email sent to:</span> <span className="font-medium">{result.summary.email}</span></div>
            <div><span className="text-gray-500">Quote #:</span> <span className="font-medium">{result.summary.quoteNumber}</span></div>
            <div><span className="text-gray-500">Invoice #:</span> <span className="font-medium">{result.summary.invoiceNumber}</span></div>
            <div><span className="text-gray-500">Total (inc GST):</span> <span className="font-bold text-green-700">{result.summary.totalIncGST}</span></div>
            <div><span className="text-gray-500">Emails sent:</span> <span className="font-medium">{result.summary.emailsSent} emails</span></div>
            <div><span className="text-gray-500">Time taken:</span> <span className="font-medium">{result.summary.durationSeconds}s</span></div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-red-700 font-medium">❌ {error}</p>
        </div>
      )}

      {/* Step log */}
      {result?.steps && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-bold text-gray-800">Automation Log</h3>
            <p className="text-xs text-gray-400 mt-0.5">Every action taken during the demo run</p>
          </div>
          <div className="p-4 space-y-2">
            {result.steps.map((step, i) => (
              <div key={i} className={`flex gap-3 p-3 rounded-lg text-sm ${
                step.message.startsWith('✅') ? 'bg-green-50' :
                step.message.startsWith('❌') ? 'bg-red-50' :
                step.message.startsWith('⚠️') ? 'bg-yellow-50' :
                step.message.startsWith('🎉') ? 'bg-blue-50' :
                'bg-gray-50'
              }`}>
                <span className="text-gray-400 text-xs font-mono w-5 flex-shrink-0 mt-0.5">{String(step.step).padStart(2, '0')}</span>
                <div className="flex-1">
                  <p className="text-gray-700">{step.message}</p>
                  {step.data && (
                    <pre className="text-xs text-gray-400 mt-1 overflow-x-auto">
                      {JSON.stringify(step.data, null, 2)}
                    </pre>
                  )}
                </div>
                <span className="text-xs text-gray-300 flex-shrink-0 hidden sm:block">
                  {new Date(step.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info box when idle */}
      {!result && !running && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="font-bold text-gray-700 mb-3">What the demo does</h3>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex gap-3">
              <span className="text-blue-500 font-bold">1</span>
              <div><strong>Creates a quote</strong> for John Mitchell (Hot Water System, $680 materials + 3hrs labour). GPT-4o writes a professional email. A PDF quote is generated and emailed with it.</div>
            </div>
            <div className="flex gap-3">
              <span className="text-blue-500 font-bold">2</span>
              <div><strong>Sends a follow-up</strong> simulating 48 hours of no response. GPT writes a personalised (non-generic) nudge email.</div>
            </div>
            <div className="flex gap-3">
              <span className="text-blue-500 font-bold">3</span>
              <div><strong>Accepts the quote</strong> and schedules a job in the dashboard with all customer + job details.</div>
            </div>
            <div className="flex gap-3">
              <span className="text-blue-500 font-bold">4</span>
              <div><strong>Completes the job</strong> and generates a proper tax invoice (ABN, GST shown separately, bank details, 14-day terms). Emails the PDF invoice to the customer.</div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            ⚙️ Payment reminders (7d + 14d overdue) run automatically via cron — no demo step needed, they just happen in the background.
          </p>
        </div>
      )}
    </div>
  );
}
