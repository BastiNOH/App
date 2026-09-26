'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const PORT = parseInt(process.env.PORT || '3443', 10);
const USE_HTTP = process.env.HTTP_ONLY === '1';
const CERT_DIR = path.join(__dirname, '..', 'certs');
const ROOM_TTL_MS = 1000 * 60 * 60 * 4; // rooms die after 4h of inactivity

function localAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

function ensureCert() {
  const keyPath = path.join(CERT_DIR, 'key.pem');
  const certPath = path.join(CERT_DIR, 'cert.pem');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  }
  const selfsigned = require('selfsigned');
  const attrs = [{ name: 'commonName', value: 'barcode-bridge.local' }];
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
  ];
  for (const ip of localAddresses()) altNames.push({ type: 7, ip });
  const pems = selfsigned.generate(attrs, {
    days: 3650,
    keySize: 2048,
    extensions: [{ name: 'subjectAltName', altNames }],
  });
  fs.mkdirSync(CERT_DIR, { recursive: true });
  fs.writeFileSync(keyPath, pems.private);
  fs.writeFileSync(certPath, pems.cert);
  return { key: pems.private, cert: pems.cert };
}

function makeRoomCode() {
  // 6 chars, unambiguous alphabet (no 0/O/1/I)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

/** @type {Map<string, {createdAt:number, lastActivity:number, receivers:Set<string>, scanners:Set<string>}>} */
const rooms = new Map();

function touchRoom(code) {
  const room = rooms.get(code);
  if (room) room.lastActivity = Date.now();
  return room;
}

function getOrCreateRoom(code) {
  let room = rooms.get(code);
  if (!room) {
    room = { createdAt: Date.now(), lastActivity: Date.now(), receivers: new Set(), scanners: new Set() };
    rooms.set(code, room);
  }
  return room;
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_TTL_MS && room.receivers.size === 0 && room.scanners.size === 0) {
      rooms.delete(code);
    }
  }
}, 60_000).unref();

app.post('/api/room', (req, res) => {
  let code = makeRoomCode();
  while (rooms.has(code)) code = makeRoomCode();
  getOrCreateRoom(code);
  res.json({ code });
});

app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

app.get('/api/info', (req, res) => {
  res.json({
    scheme: usingHttps ? 'https' : 'http',
    port: PORT,
    addresses: localAddresses(),
  });
});

app.get('/api/qr', async (req, res) => {
  const text = typeof req.query.text === 'string' ? req.query.text : '';
  if (!text || text.length > 512) {
    res.status(400).json({ error: 'invalid text' });
    return;
  }
  try {
    const png = await QRCode.toBuffer(text, { margin: 1, width: 260 });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(png);
  } catch (err) {
    res.status(500).json({ error: 'qr generation failed' });
  }
});

let server;
let usingHttps = false;
if (USE_HTTP) {
  server = http.createServer(app);
} else {
  try {
    const { key, cert } = ensureCert();
    server = https.createServer({ key, cert }, app);
    usingHttps = true;
  } catch (err) {
    console.error('Konnte kein HTTPS-Zertifikat erzeugen, falle auf HTTP zurueck:', err.message);
    server = http.createServer(app);
  }
}

const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  let joined = null; // { code, role }

  socket.on('join-room', ({ code, role }) => {
    if (typeof code !== 'string' || !/^[A-Z0-9]{4,8}$/.test(code)) {
      socket.emit('join-error', { message: 'Ungueltiger Raumcode' });
      return;
    }
    if (role !== 'receiver' && role !== 'scanner') {
      socket.emit('join-error', { message: 'Ungueltige Rolle' });
      return;
    }
    const room = getOrCreateRoom(code);
    joined = { code, role };
    socket.join(`room:${code}`);
    if (role === 'receiver') room.receivers.add(socket.id);
    else room.scanners.add(socket.id);
    touchRoom(code);

    socket.emit('joined', { code, role });
    socket.to(`room:${code}`).emit('peer-status', {
      receivers: room.receivers.size,
      scanners: room.scanners.size,
    });
    socket.emit('peer-status', {
      receivers: room.receivers.size,
      scanners: room.scanners.size,
    });
  });

  socket.on('barcode', (payload) => {
    if (!joined || joined.role !== 'scanner') return;
    const room = touchRoom(joined.code);
    if (!room) return;
    const text = typeof payload?.text === 'string' ? payload.text.slice(0, 4096) : '';
    if (!text) return;
    const format = typeof payload?.format === 'string' ? payload.format.slice(0, 64) : 'UNKNOWN';
    io.to(`room:${joined.code}`).emit('barcode', {
      text,
      format,
      ts: Date.now(),
    });
  });

  socket.on('disconnect', () => {
    if (!joined) return;
    const room = rooms.get(joined.code);
    if (!room) return;
    room.receivers.delete(socket.id);
    room.scanners.delete(socket.id);
    touchRoom(joined.code);
    io.to(`room:${joined.code}`).emit('peer-status', {
      receivers: room.receivers.size,
      scanners: room.scanners.size,
    });
  });
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    const scheme = usingHttps ? 'https' : 'http';
    console.log(`Barcode-Bridge laeuft auf ${scheme}://0.0.0.0:${PORT}`);
    console.log('Erreichbar unter:');
    console.log(`  ${scheme}://localhost:${PORT}/receiver`);
    for (const ip of localAddresses()) {
      console.log(`  ${scheme}://${ip}:${PORT}/receiver`);
    }
    if (usingHttps) {
      console.log('\nHinweis: Es wird ein selbstsigniertes Zertifikat verwendet.');
      console.log('Beim ersten Aufruf auf dem Handy muss die Sicherheitswarnung bestaetigt werden,');
      console.log('damit der Browser Kamerazugriff (erfordert HTTPS) erlaubt.');
    }
  });
}

module.exports = { app, server, io, rooms };
