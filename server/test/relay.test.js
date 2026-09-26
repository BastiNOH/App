'use strict';

// Minimaler Integrationstest ohne Test-Framework: startet den echten Server auf
// einem Zufallsport (HTTP, kein Zertifikat noetig) und prueft Pairing + Relay.

process.env.HTTP_ONLY = '1';
process.env.PORT = '0';

const assert = require('assert');
const { io: ioClient } = require('socket.io-client');

async function main() {
  const { server } = require('../index.js');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;

  // 1. Raum anlegen ueber HTTP API
  const res = await fetch(`${url}/api/room`, { method: 'POST' });
  const { code } = await res.json();
  assert.ok(/^[A-Z0-9]{6}$/.test(code), 'Raumcode sollte 6 Zeichen haben');

  // 2. QR-Endpoint liefert PNG
  const qrRes = await fetch(`${url}/api/qr?text=${encodeURIComponent('https://example.com')}`);
  assert.strictEqual(qrRes.status, 200);
  assert.strictEqual(qrRes.headers.get('content-type'), 'image/png');

  // 3. Empfaenger und Scanner verbinden, Barcode relaien
  const receiver = ioClient(url, { transports: ['websocket'] });
  const scanner = ioClient(url, { transports: ['websocket'] });

  await new Promise((resolve) => receiver.on('connect', resolve));
  await new Promise((resolve) => scanner.on('connect', resolve));

  const receiverJoined = new Promise((resolve) => receiver.once('joined', resolve));
  receiver.emit('join-room', { code, role: 'receiver' });
  await receiverJoined;

  const receiverSawScanner = new Promise((resolve) => {
    receiver.on('peer-status', (s) => {
      if (s.scanners > 0) resolve(s);
    });
  });

  const scannerJoined = new Promise((resolve) => scanner.once('joined', resolve));
  scanner.emit('join-room', { code, role: 'scanner' });
  await scannerJoined;
  await receiverSawScanner;

  const barcodeReceived = new Promise((resolve) => receiver.once('barcode', resolve));
  scanner.emit('barcode', { text: '4006381333931', format: 'EAN_13' });
  const payload = await barcodeReceived;
  assert.strictEqual(payload.text, '4006381333931');
  assert.strictEqual(payload.format, 'EAN_13');
  assert.ok(typeof payload.ts === 'number');

  // 4. Falscher Raumcode wird abgelehnt
  const other = ioClient(url, { transports: ['websocket'] });
  await new Promise((resolve) => other.on('connect', resolve));
  const joinError = new Promise((resolve) => other.once('join-error', resolve));
  other.emit('join-room', { code: 'x', role: 'receiver' });
  const err = await joinError;
  assert.ok(err.message);

  receiver.close();
  scanner.close();
  other.close();
  server.close();
  console.log('OK: alle Relay-Tests bestanden');
  process.exit(0);
}

main().catch((err) => {
  console.error('FEHLER:', err);
  process.exit(1);
});
