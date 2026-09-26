'use strict';

// Optionaler PC-Agent: laeuft lokal auf dem PC und tippt gescannte Barcodes
// systemweit in die gerade aktive Anwendung, so wie ein echter USB-Barcode-Scanner.
//
// Aufruf:
//   node agent.js --url https://localhost:3443 --room AB12CD [--insecure] [--no-enter]

const { io } = require('socket.io-client');

function parseArgs(argv) {
  const args = { url: 'https://localhost:3443', room: null, insecure: false, enter: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--room') args.room = (argv[++i] || '').toUpperCase();
    else if (a === '--insecure') args.insecure = true;
    else if (a === '--no-enter') args.enter = false;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.room) {
    console.error('Bitte den Raumcode angeben, z. B.: node agent.js --url https://localhost:3443 --room AB12CD');
    process.exit(1);
  }

  let keyboard, Key;
  try {
    ({ keyboard, Key } = require('@nut-tree-fork/nut-js'));
  } catch (err) {
    console.error('Konnte @nut-tree-fork/nut-js nicht laden. Bitte im pc-agent Verzeichnis "npm install" ausfuehren.');
    console.error(err.message);
    process.exit(1);
  }

  const socket = io(args.url, {
    rejectUnauthorized: !args.insecure,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log(`Verbunden mit ${args.url}. Trete Raum ${args.room} bei…`);
    socket.emit('join-room', { code: args.room, role: 'receiver' });
  });

  socket.on('joined', () => {
    console.log('Raum betreten. Agent tippt eingehende Scans nun systemweit in die aktive Anwendung.');
  });

  socket.on('join-error', (err) => {
    console.error('Fehler beim Beitreten:', err.message);
  });

  socket.on('peer-status', (status) => {
    console.log(`Status: ${status.scanners} Handy(s), ${status.receivers} Empfaenger verbunden.`);
  });

  // Puffer: Scans werden nacheinander abgearbeitet, damit sich bei schnell
  // aufeinanderfolgenden Codes die Tastatureingaben nicht ueberschneiden.
  const queue = [];
  let processing = false;

  async function processQueue() {
    if (processing) return;
    processing = true;
    while (queue.length) {
      const payload = queue.shift();
      console.log(`Tippe Scan: ${payload.text} (${payload.format})`);
      try {
        await keyboard.type(payload.text);
        if (args.enter) {
          await keyboard.pressKey(Key.Enter);
          await keyboard.releaseKey(Key.Enter);
        }
      } catch (err) {
        console.error('Tastatureingabe fehlgeschlagen:', err.message);
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    processing = false;
  }

  socket.on('barcode', (payload) => {
    console.log(`Scan empfangen: ${payload.text} (${payload.format})`);
    queue.push(payload);
    processQueue();
  });

  socket.on('disconnect', () => {
    console.log('Verbindung getrennt, versuche erneut zu verbinden…');
  });

  socket.on('connect_error', (err) => {
    console.error('Verbindungsfehler:', err.message);
    if (!args.insecure && args.url.startsWith('https://')) {
      console.error('Tipp: Bei selbstsigniertem Zertifikat ggf. --insecure verwenden.');
    }
  });
}

main();
