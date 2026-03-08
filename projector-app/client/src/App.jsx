import { useState, useEffect, useRef } from 'react';

function StatusBadge({ connected }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${connected ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
      {connected ? 'Connected' : 'Disconnected'}
    </span>
  );
}

function AppBadge({ running }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${running ? 'bg-blue-900 text-blue-300' : 'bg-gray-800 text-gray-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-blue-400 animate-pulse' : 'bg-gray-500'}`} />
      {running ? 'Running' : 'Not running'}
    </span>
  );
}

function ActionButton({ onClick, disabled, color, children, fullWidth }) {
  const colors = {
    blue: 'bg-blue-600 active:bg-blue-700 hover:bg-blue-500 disabled:bg-blue-900',
    red: 'bg-red-600 active:bg-red-700 hover:bg-red-500 disabled:bg-red-900',
    yellow: 'bg-yellow-600 active:bg-yellow-700 hover:bg-yellow-500 disabled:bg-yellow-900',
    gray: 'bg-gray-700 active:bg-gray-800 hover:bg-gray-600 disabled:bg-gray-800',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${fullWidth ? 'w-full' : ''} px-4 py-3 rounded-xl text-white font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 text-sm touch-manipulation ${colors[color]}`}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-white inline-block mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsRunning, setLogsRunning] = useState(false);
  const wsRef = useRef(null);
  const logsEndRef = useRef(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      setStatus(await res.json());
    } catch {
      setStatus({ connected: false, jellyfinRunning: false });
    }
  }

  function showToast(msg, ok = true) {
    clearTimeout(toastTimer.current);
    setToast({ msg, ok });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  async function callApi(endpoint, label) {
    setActionLoading(label);
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      showToast(data.message || data.error, data.success !== false);
      await fetchStatus();
    } catch {
      showToast('Request failed — check connection', false);
    } finally {
      setActionLoading(null);
    }
  }

  function toggleLogs() {
    if (logsRunning) {
      wsRef.current?.send(JSON.stringify({ type: 'stop_logs' }));
      wsRef.current?.close();
      wsRef.current = null;
      setLogsRunning(false);
      return;
    }
    setLogs([]);
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}`);
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'start_logs' }));
    ws.onmessage = (e) => {
      const { type, data } = JSON.parse(e.data);
      if (type === 'log') setLogs((prev) => [...prev.slice(-500), data]);
      if (type === 'error') showToast(data, false);
    };
    ws.onclose = () => setLogsRunning(false);
    setLogsRunning(true);
  }

  const busy = actionLoading !== null;
  const deviceOk = status?.connected;
  const jellyfinRunning = status?.jellyfinRunning;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Safe area aware padding for iPhone notch */}
      <div className="max-w-lg mx-auto px-4 pt-safe-top pb-safe-bottom" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <div className="space-y-4">

          {/* Header */}
          <div className="flex items-start justify-between pt-2">
            <div>
              <h1 className="text-xl font-bold text-white">Projector Manager</h1>
              <p className="text-gray-500 text-xs mt-0.5">WiMiUS P62 · 192.168.1.228</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 mt-0.5">
              {status && <StatusBadge connected={deviceOk} />}
              {deviceOk && <AppBadge running={jellyfinRunning} />}
            </div>
          </div>

          {/* Device info */}
          {deviceOk && (
            <div className="bg-gray-900 rounded-2xl p-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-500 text-xs">Model</p>
                <p className="font-medium text-sm mt-0.5">{status.model}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Android</p>
                <p className="font-medium text-sm mt-0.5">{status.android}</p>
              </div>
            </div>
          )}

          {/* Disconnected state */}
          {status && !deviceOk && (
            <div className="bg-red-950 border border-red-800 rounded-2xl p-4 text-sm text-red-300">
              Projector is off or unreachable. Turn it on and refresh.
            </div>
          )}

          {/* Main Jellyfin action */}
          <div className="bg-gray-900 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-white font-semibold">Jellyfin</p>
              {deviceOk && <AppBadge running={jellyfinRunning} />}
            </div>

            <button
              onClick={() => callApi('/api/launch', 'launch')}
              disabled={busy || !deviceOk}
              className="w-full py-4 bg-blue-600 active:bg-blue-700 hover:bg-blue-500 disabled:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-white text-base font-semibold transition-colors touch-manipulation"
            >
              {actionLoading === 'launch' ? <><Spinner />Launching…</> : jellyfinRunning ? '▶ Open Jellyfin' : '▶ Launch Jellyfin'}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => callApi('/api/kill', 'kill')}
                disabled={busy || !deviceOk || !jellyfinRunning}
                className="py-3 bg-red-600 active:bg-red-700 hover:bg-red-500 disabled:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-white text-sm font-medium transition-colors touch-manipulation"
              >
                {actionLoading === 'kill' ? <><Spinner />Stopping…</> : '⏹ Stop App'}
              </button>
              <button
                onClick={() => callApi('/api/clear-cache', 'clear')}
                disabled={busy || !deviceOk}
                className="py-3 bg-yellow-600 active:bg-yellow-700 hover:bg-yellow-500 disabled:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-white text-sm font-medium transition-colors touch-manipulation"
              >
                {actionLoading === 'clear' ? <><Spinner />Clearing…</> : '🗑 Clear Cache'}
              </button>
            </div>
          </div>

          {/* Logs */}
          <div className="bg-gray-900 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-gray-300 text-sm font-medium">ADB Logs</p>
              <button
                onClick={toggleLogs}
                disabled={!deviceOk}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors touch-manipulation disabled:opacity-40 ${logsRunning ? 'bg-red-700 active:bg-red-800 text-white' : 'bg-gray-700 active:bg-gray-800 text-gray-300'}`}
              >
                {logsRunning ? '⏹ Stop' : '▶ Start'}
              </button>
            </div>
            {logs.length > 0 && (
              <div className="bg-gray-950 rounded-xl p-3 h-52 overflow-y-auto font-mono text-xs text-green-400 leading-relaxed">
                {logs.map((line, i) => <div key={i}>{line}</div>)}
                <div ref={logsEndRef} />
              </div>
            )}
            {logsRunning && logs.length === 0 && (
              <p className="text-gray-600 text-xs text-center py-2">Waiting for log output…</p>
            )}
          </div>

          {/* Refresh */}
          <button
            onClick={fetchStatus}
            disabled={busy}
            className="w-full py-3 bg-gray-800 active:bg-gray-700 rounded-xl text-gray-400 text-sm font-medium transition-colors touch-manipulation disabled:opacity-40"
          >
            ↻ Refresh Status
          </button>

        </div>
      </div>

      {/* Toast — positioned above iPhone home bar */}
      {toast && (
        <div
          style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          className={`fixed left-4 right-4 mx-auto max-w-sm px-4 py-3 rounded-xl text-sm font-medium shadow-xl text-center transition-all ${toast.ok ? 'bg-green-700 text-white' : 'bg-red-700 text-white'}`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
