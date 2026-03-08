import express from 'express';
import { exec, spawn } from 'child_process';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PROJECTOR_IP = process.env.PROJECTOR_IP || '192.168.1.228';
const PROJECTOR_ADB = `${PROJECTOR_IP}:5555`;
const PORT = process.env.PORT || 3005;
const JELLYFIN_PKG = 'org.jellyfin.androidtv';

app.use(express.json());
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) log(`${req.method} ${req.path}`);
  next();
});
app.use(express.static(path.join(__dirname, '../client/dist')));

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function adb(args) {
  const cmd = `adb -s ${PROJECTOR_ADB} ${args}`;
  log(`ADB: ${cmd}`);
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        log(`ADB ERROR: ${stderr || err.message}`);
        reject(String(stderr || err.message));
      } else {
        const out = stdout.trim();
        if (out) log(`ADB OUT: ${out}`);
        resolve(out);
      }
    });
  });
}

async function ensureConnected() {
  const cmd = `adb connect ${PROJECTOR_ADB}`;
  log(`CONNECT: ${cmd}`);
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout) => {
      if (err) {
        log(`CONNECT ERROR: ${err.message}`);
        reject(String(err.message));
      } else {
        log(`CONNECT OK: ${stdout.trim()}`);
        resolve(stdout.trim());
      }
    });
  });
}

async function isAppRunning() {
  try {
    const pid = await adb(`shell pidof ${JELLYFIN_PKG}`);
    return pid.length > 0;
  } catch {
    return false;
  }
}

// GET /api/status
app.get('/api/status', async (req, res) => {
  try {
    await ensureConnected();
    const [model, android, jellyfinRunning] = await Promise.all([
      adb('shell getprop ro.product.model'),
      adb('shell getprop ro.build.version.release'),
      isAppRunning(),
    ]);
    res.json({ connected: true, model, android, jellyfinRunning });
  } catch (err) {
    res.json({ connected: false, jellyfinRunning: false, error: String(err) });
  }
});

// POST /api/launch — if already running, brings to foreground; if not, launches
app.post('/api/launch', async (req, res) => {
  try {
    await ensureConnected();
    const running = await isAppRunning();
    if (running) {
      // Bring existing instance to foreground instead of launching a new one
      await adb(`shell am start -n ${JELLYFIN_PKG}/${JELLYFIN_PKG}.ui.startup.StartupActivity`);
      return res.json({ success: true, message: 'Jellyfin already running — brought to foreground' });
    }
    await adb(`shell monkey -p ${JELLYFIN_PKG} 1`);
    res.json({ success: true, message: 'Jellyfin launched' });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /api/kill
app.post('/api/kill', async (req, res) => {
  try {
    await ensureConnected();
    const running = await isAppRunning();
    if (!running) {
      return res.json({ success: true, message: 'Jellyfin is not running' });
    }
    await adb(`shell am force-stop ${JELLYFIN_PKG}`);
    res.json({ success: true, message: 'Jellyfin stopped' });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// POST /api/clear-cache
app.post('/api/clear-cache', async (req, res) => {
  try {
    await ensureConnected();
    const running = await isAppRunning();
    if (running) {
      await adb(`shell am force-stop ${JELLYFIN_PKG}`);
    }
    await adb(`shell pm clear ${JELLYFIN_PKG}`);
    res.json({ success: true, message: 'Cache cleared' + (running ? ' (app was stopped first)' : '') });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// WebSocket — stream adb logcat
wss.on('connection', (ws) => {
  let logcatProcess = null;

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'start_logs') {
      if (logcatProcess) return; // already running
      try {
        await ensureConnected();
        logcatProcess = spawn('adb', [
          '-s', PROJECTOR_ADB, 'logcat', '-v', 'time',
          '-s', 'AndroidRuntime:E', 'jellyfin:V', '*:S',
        ]);
        logcatProcess.stdout.on('data', (data) => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'log', data: data.toString() }));
        });
        logcatProcess.stderr.on('data', (data) => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'log', data: data.toString() }));
        });
        logcatProcess.on('exit', () => {
          logcatProcess = null;
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'log', data: '[logcat ended]\n' }));
        });
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', data: String(err) }));
      }
    }

    if (msg.type === 'stop_logs') {
      logcatProcess?.kill();
      logcatProcess = null;
    }
  });

  ws.on('close', () => logcatProcess?.kill());
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

server.listen(PORT, () => console.log(`Projector manager running on port ${PORT}`));
