import { useState, useEffect, useRef } from 'react';

const API = '';

function StatusBadge({ connected }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${connected ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
      <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
      {connected ? 'Connected' : 'Disconnected'}
    </span>
  );
}

function ActionButton({ onClick, disabled, color, children }) {
  const colors = {
    blue: 'bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900',
    red: 'bg-red-600 hover:bg-red-500 disabled:bg-red-900',
    yellow: 'bg-yellow-600 hover:bg-yellow-500 disabled:bg-yellow-900',
    gray: 'bg-gray-600 hover:bg-gray-500 disabled:bg-gray-800',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2.5 rounded-lg text-white font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${colors[color]}`}
    >
      {children}
    </button>
  );
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsRunning, setLogsRunning] = useState(false);
  const wsRef = useRef(null);
  const logsEndRef = useRef(null);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  async function fetchStatus() {
    try {
      const res = await fetch(`${API}/api/status`);
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ connected: false });
    }
  }

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function callApi(endpoint, method = 'POST') {
    setLoading(true);
    try {
      const res = await fetch(`${API}${endpoint}`, { method });
      const data = await res.json();
      showToast(data.message || data.error, data.success !== false);
      fetchStatus();
    } catch (err) {
      showToast('Request failed', false);
    } finally {
      setLoading(false);
    }
  }

  function toggleLogs() {
    if (logsRunning) {
      wsRef.current?.send(JSON.stringify({ type: 'stop_logs' }));
      wsRef.current?.close();
      wsRef.current = null;
      setLogsRunning(false);
    } else {
      setLogs([]);
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}`);
      wsRef.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'start_logs' }));
      ws.onmessage = (e) => {
        const { type, data } = JSON.parse(e.data);
        if (type === 'log') setLogs((prev) => [...prev.slice(-500), data]);
      };
      ws.onclose = () => setLogsRunning(false);
      setLogsRunning(true);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Projector Manager</h1>
            <p className="text-gray-400 text-sm mt-0.5">WiMiUS P62 · 192.168.1.228</p>
          </div>
          {status && <StatusBadge connected={status.connected} />}
        </div>

        {/* Device info */}
        {status?.connected && (
          <div className="bg-gray-900 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500">Model</p>
              <p className="font-medium">{status.model}</p>
            </div>
            <div>
              <p className="text-gray-500">Android</p>
              <p className="font-medium">{status.android}</p>
            </div>
          </div>
        )}

        {/* Main action */}
        <div className="bg-gray-900 rounded-xl p-6 text-center space-y-2">
          <p className="text-gray-400 text-sm">Jellyfin</p>
          <button
            onClick={() => callApi('/api/launch')}
            disabled={loading || !status?.connected}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-xl text-white text-lg font-semibold transition-colors"
          >
            ▶ Launch Jellyfin
          </button>
        </div>

        {/* Other actions */}
        <div className="bg-gray-900 rounded-xl p-4 space-y-3">
          <p className="text-gray-400 text-sm font-medium">Actions</p>
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={() => callApi('/api/kill')} disabled={loading || !status?.connected} color="red">
              Stop App
            </ActionButton>
            <ActionButton onClick={() => callApi('/api/clear-cache')} disabled={loading || !status?.connected} color="yellow">
              Clear Cache
            </ActionButton>
            <ActionButton onClick={fetchStatus} disabled={loading} color="gray">
              Refresh Status
            </ActionButton>
          </div>
        </div>

        {/* Logs */}
        <div className="bg-gray-900 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-gray-400 text-sm font-medium">ADB Logs</p>
            <ActionButton onClick={toggleLogs} disabled={!status?.connected} color={logsRunning ? 'red' : 'gray'}>
              {logsRunning ? 'Stop' : 'Start Logs'}
            </ActionButton>
          </div>
          {logs.length > 0 && (
            <div className="bg-gray-950 rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs text-green-400 space-y-0.5">
              {logs.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>

      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium shadow-lg ${toast.ok ? 'bg-green-700 text-white' : 'bg-red-700 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
