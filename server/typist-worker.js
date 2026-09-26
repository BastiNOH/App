'use strict';

// Laeuft als eigener Kindprozess (siehe system-typist.js). Absichtlich isoliert:
// natives Tastatur-Modul kann unter ungewoehnlichen Bedingungen (kein aktives
// Display, z. B. gesperrter Bildschirm/Remote-Session ohne Desktop) hart
// abstuerzen statt einen abfangbaren Fehler zu werfen. Stuerzt dieser Prozess
// ab, bleibt der Hauptserver (Web-Server + Socket.IO-Relay) davon unberuehrt.

let nut = null;
try {
  nut = require('@nut-tree-fork/nut-js');
  // nut-js verzoegert standardmaessig jeden Tastendruck um 300ms (fuer
  // Kompatibilitaet gedacht) - bei einem 13-stelligen Barcode macht das
  // ueber 4 Sekunden. Ein echter USB-Scanner tippt praktisch instantan,
  // daher hier auf minimale Verzoegerung stellen.
  nut.keyboard.config.autoDelayMs = 0;
} catch (err) {
  process.send({ type: 'unavailable', reason: err.message });
  process.exit(0);
}

process.send({ type: 'ready' });

const queue = [];
let processing = false;

async function processQueue() {
  if (processing) return;
  processing = true;
  while (queue.length) {
    const { id, text, pressEnter } = queue.shift();
    try {
      await nut.keyboard.type(text);
      if (pressEnter) {
        await nut.keyboard.pressKey(nut.Key.Enter);
        await nut.keyboard.releaseKey(nut.Key.Enter);
      }
    } catch (err) {
      console.error('Tippen fehlgeschlagen:', err.message);
    }
    await new Promise((r) => setTimeout(r, 150));
    process.send({ type: 'result', id });
  }
  processing = false;
}

process.on('message', (msg) => {
  if (msg && msg.type === 'type') {
    queue.push(msg);
    processQueue();
  }
});
