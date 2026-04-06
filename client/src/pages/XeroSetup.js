/**
 * Xero Setup Page
 *
 * Lets the tradie connect or disconnect their Xero account.
 * Shows live connection status: Connected / Token Expired / Disconnected.
 *
 * Also explains what syncs to Xero and what the webhook does,
 * so the tradie understands what they're enabling.
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function XeroSetup() {
  const [status, setStatus]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  // Check for OAuth result in URL params (redirected back from Xero)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const xeroParam = params.get('xero');
    if (xeroParam === 'connected') {
      const org = params.get('org') || 'your organisation';
      // Clean the URL without reloading
      window.history.replaceState({}, '', window.location.pathname);
    }
    fetchStatus();
  }, []);

  async function fetchStatus() {
    setLoading(true);
    try {
      const res = await axios.get('/api/xero/status');
      setStatus(res.data);
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect Xero? Future quotes and invoices will not sync to Xero.')) return;
    setDisconnecting(true);
    try {
      await axios.post('/api/xero/disconnect');
      setStatus({ connected: false });
    } catch (e) {
      alert('Failed to disconnect: ' + (e.response?.data?.error || e.message));
    } finally {
      setDisconnecting(false);
    }
  }

  // Clicking Connect redirects the browser to the backend auth route,
  // which redirects to Xero, which redirects back to /api/xero/callback,
  // which redirects back here with ?xero=connected
  function handleConnect() {
    window.location.href = 'http://localhost:3001/api/xero/auth';
  }

  const statusBadge = () => {
    if (!status) return null;
    if (!status.connected) return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
        <span className="w-2 h-2 rounded-full bg-gray-400" />
        Not Connected
      </span>
    );
    if (status.expired) return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-700">
        <span className="w-2 h-2 rounded-full bg-orange-500" />
        Token Expired — Reconnect
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        Connected
      </span>
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800">Settings</h2>
        <p className="text-gray-500 text-sm mt-1">Connect Tradie Desk to your other tools</p>
      </div>

      {/* Xero Connection Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {/* Xero logo placeholder */}
              <div className="w-12 h-12 bg-[#13B5EA] rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                X
              </div>
              <div>
                <h3 className="font-bold text-gray-800 text-lg">Xero Accounting</h3>
                <p className="text-sm text-gray-500 mt-0.5">Sync quotes and invoices directly to your Xero account</p>
              </div>
            </div>
            <div className="ml-4 flex-shrink-0">
              {loading ? (
                <span className="text-gray-400 text-sm">Checking...</span>
              ) : statusBadge()}
            </div>
          </div>

          {/* Connected state details */}
          {status?.connected && !status?.expired && (
            <div className="mt-4 p-3 bg-green-50 rounded-lg text-sm text-green-700 space-y-1">
              <p><strong>Tenant ID:</strong> {status.tenantId}</p>
              <p><strong>Token expires:</strong> {new Date(status.expiresAt).toLocaleString('en-AU')} (auto-refreshes)</p>
            </div>
          )}

          {/* Expired state */}
          {status?.expired && (
            <div className="mt-4 p-3 bg-orange-50 rounded-lg text-sm text-orange-700">
              Your Xero token has expired and could not be refreshed automatically. Please reconnect.
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-5 flex gap-3">
            {!status?.connected || status?.expired ? (
              <button
                onClick={handleConnect}
                className="px-5 py-2 bg-[#13B5EA] hover:bg-[#0fa0d0] text-white font-semibold rounded-lg text-sm transition-colors"
              >
                Connect to Xero
              </button>
            ) : (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="px-5 py-2 bg-white border border-red-300 hover:bg-red-50 text-red-600 font-semibold rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect Xero'}
              </button>
            )}
            <button
              onClick={fetchStatus}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium"
            >
              Refresh status
            </button>
          </div>
        </div>

        {/* What syncs section */}
        <div className="border-t border-gray-100 bg-gray-50 p-6">
          <h4 className="font-semibold text-gray-700 text-sm mb-3">What syncs to Xero</h4>
          <div className="space-y-2">
            {[
              { icon: '📋', label: 'New Quote', desc: 'Created as a DRAFT quote in Xero automatically' },
              { icon: '✅', label: 'Quote Accepted', desc: 'Xero quote status updated to ACCEPTED' },
              { icon: '🧾', label: 'New Invoice', desc: 'Created as AUTHORISED in Xero with PDF attached. Due date set to 14 days.' },
              { icon: '💰', label: 'Invoice Paid (via webhook)', desc: 'When marked paid in Xero, Tradie Desk updates automatically and cancels any pending reminders' },
            ].map(item => (
              <div key={item.label} className="flex gap-3 text-sm">
                <span className="text-base flex-shrink-0">{item.icon}</span>
                <div>
                  <span className="font-medium text-gray-700">{item.label}</span>
                  <span className="text-gray-500"> — {item.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Setup instructions */}
      {!status?.connected && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h4 className="font-semibold text-blue-800 mb-2">How to connect</h4>
          <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
            <li>Go to <strong>developer.xero.com</strong> → New App → Web App</li>
            <li>Set redirect URI to: <code className="bg-blue-100 px-1 rounded">http://localhost:3001/api/xero/callback</code></li>
            <li>Copy your Client ID and Client Secret into <code className="bg-blue-100 px-1 rounded">.env</code></li>
            <li>Restart the server (<code className="bg-blue-100 px-1 rounded">npm run dev</code>)</li>
            <li>Click "Connect to Xero" above and authorise the app</li>
          </ol>
          <p className="text-xs text-blue-600 mt-3">
            For webhooks: in the Xero developer portal, add a webhook pointing to{' '}
            <code className="bg-blue-100 px-1 rounded">https://your-domain/api/xero/webhook</code> and
            add the signing key as <code className="bg-blue-100 px-1 rounded">XERO_WEBHOOK_KEY</code> in .env.
          </p>
        </div>
      )}
    </div>
  );
}
