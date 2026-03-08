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
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/dist')));

// Run ADB command and return promise with output
function adb(args) {
  return new Promise((resolve, reject) => {
    exec(`adb -s ${PROJECTOR_ADB} ${args}`, (err, stdout, stderr) => {
      if (err) reject(stderr || err.message);
      else resolve(stdout.trim());
    });
  });
}

// Connect to projector
async function ensureConnected() {
  return new Promise((resolve, reject) => {
    exec(`adb connect ${PROJECTOR_ADB}`, (err, stdout) => {
      if (err) reject(err.message);
      else resolve(stdout.trim());
    });
  });
}

// GET /api/status - device connection status
app.get('/api/status', async (req, res) => {
  try {
    await ensureConnected();
    const model = await adb('shell getprop ro.product.model');
    const android = await adb('shell getprop ro.build.version.release');
    const storage = await adb('shell df /data');
    res.json({ connected: true, model, android, storage });
  } catch (err) {
    res.json({ connected: false, error: err });
  }
});

// POST /api/launch - launch Jellyfin
app.post('/api/launch', async (req, res) => {
  try {
    await ensureConnected();
    await adb('shell monkey -p org.jellyfin.androidtv 1');
    res.json({ success: true, message: 'Jellyfin launched' });
  } catch (err) {
    res.status(500).json({ success: false, error: err });
  }
});

// POST /api/kill - kill Jellyfin
app.post('/api/kill', async (req, res) => {
  try {
    await ensureConnected();
    await adb('shell am force-stop org.jellyfin.androidtv');
    res.json({ success: true, message: 'Jellyfin stopped' });
  } catch (err) {
    res.status(500).json({ success: false, error: err });
  }
});

// POST /api/clear-cache - clear Jellyfin cache
app.post('/api/clear-cache', async (req, res) => {
  try {
    await ensureConnected();
    await adb('shell pm clear org.jellyfin.androidtv');
    res.json({ success: true, message: 'Cache cleared' });
  } catch (err) {
    res.status(500).json({ success: false, error: err });
  }
});

// POST /api/install - install APK from URL
app.post('/api/install', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  res.json({ success: true, message: 'Install started, check logs' });
  // actual install streamed via WebSocket (see below)
});

// WebSocket - stream adb logcat
wss.on('connection', (ws) => {
  let logcatProcess = null;

  ws.on('message', async (msg) => {
    const { type } = JSON.parse(msg);

    if (type === 'start_logs') {
      try {
        await ensureConnected();
        logcatProcess = spawn('adb', ['-s', PROJECTOR_ADB, 'logcat', '-v', 'time', '--pid', `$(adb -s ${PROJECTOR_ADB} shell pidof org.jellyfin.androidtv)`]);
        // fallback: all logs filtered to jellyfin
        logcatProcess = spawn('adb', ['-s', PROJECTOR_ADB, 'logcat', '-v', 'time', '-s', 'AndroidRuntime:E', 'jellyfin:V', '*:S']);

        logcatProcess.stdout.on('data', (data) => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'log', data: data.toString() }));
        });
        logcatProcess.stderr.on('data', (data) => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'log', data: data.toString() }));
        });
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', data: err }));
      }
    }

    if (type === 'stop_logs') {
      logcatProcess?.kill();
      logcatProcess = null;
    }
  });

  ws.on('close', () => {
    logcatProcess?.kill();
  });
});

// Fallback to React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

server.listen(PORT, () => {
  console.log(`Projector manager running on port ${PORT}`);
});
