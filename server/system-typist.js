'use strict';

// Tippt Barcodes systemweit in die gerade aktive Anwendung des PCs, auf dem
// der Server laeuft. Die eigentliche Tastatursimulation (@nut-tree-fork/nut-js,
// eine optionale Abhaengigkeit) laeuft in einem eigenen Kindprozess
// (typist-worker.js): dessen natives Modul kann unter ungewoehnlichen
// Bedingungen hart abstuerzen statt einen abfangbaren JS-Fehler zu werfen –
// damit das niemals den Hauptserver (Web/Socket.IO) mitreisst, ist es
// vollstaendig isoliert. Stuerzt der Kindprozess ab, wird das Feature einfach
// als nicht verfuegbar markiert; der Rest der App laeuft unveraendert weiter.

const { fork } = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');

const events = new EventEmitter();

let child = null;
let available = false;
let unavailReason = null;
let ready = false;
const pending = new Map();
let nextId = 1;

function setState(nextAvailable, reason) {
  available = nextAvailable;
  unavailReason = reason || null;
  ready = true;
  events.emit('change');
}

function start() {
  child = fork(path.join(__dirname, 'typist-worker.js'), [], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });

  child.stderr?.on('data', (chunk) => {
    console.error('[systemweites Tippen]', chunk.toString().trim());
  });

  child.on('message', (msg) => {
    if (msg?.type === 'ready') {
      setState(true, null);
    } else if (msg?.type === 'unavailable') {
      setState(false, msg.reason);
    } else if (msg?.type === 'result') {
      const resolve = pending.get(msg.id);
      if (resolve) {
        pending.delete(msg.id);
        resolve();
      }
    }
  });

  child.on('exit', (code, signal) => {
    if (ready && available) {
      console.error(
        `Systemweites Tippen: Hintergrundprozess unerwartet beendet (code=${code}, signal=${signal}). Feature wird deaktiviert.`
      );
    }
    setState(false, 'Hintergrundprozess beendet');
    for (const resolve of pending.values()) resolve();
    pending.clear();
    child = null;
  });
}

start();

function isAvailable() {
  return available;
}

function unavailableReason() {
  return unavailReason;
}

function waitUntilReady(timeoutMs = 3000) {
  if (ready) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      events.off('change', onChange);
      resolve();
    }, timeoutMs);
    function onChange() {
      clearTimeout(timer);
      events.off('change', onChange);
      resolve();
    }
    events.once('change', onChange);
  });
}

function onStatusChange(cb) {
  events.on('change', cb);
}

function typeText(text, pressEnter) {
  if (!available || !child) return Promise.resolve();
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    child.send({ type: 'type', id, text, pressEnter });
  });
}

function shutdown() {
  if (child) child.kill();
}

process.on('exit', shutdown);

module.exports = { isAvailable, unavailableReason, waitUntilReady, onStatusChange, typeText };
