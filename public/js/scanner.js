(() => {
  const joinCard = document.getElementById('joinCard');
  const scanCard = document.getElementById('scanCard');
  const codeInput = document.getElementById('codeInput');
  const joinBtn = document.getElementById('joinBtn');
  const dotConn = document.getElementById('dotConn');
  const connText = document.getElementById('connText');
  const lastScan = document.getElementById('lastScan');
  const sentCount = document.getElementById('sentCount');

  const params = new URLSearchParams(location.search);
  const prefillRoom = (params.get('room') || '').toUpperCase();
  if (prefillRoom) codeInput.value = prefillRoom;

  let socket = null;
  let html5Qr = null;
  let sent = 0;

  // Anti-Spam-Puffer: verhindert, dass derselbe Code mehrfach pro Sekunde
  // gesendet wird, waehrend das Handy ruhig ueber dem Barcode gehalten wird.
  let lastText = null;
  let lastSentAt = 0;
  let missCount = 0;
  const MIN_COOLDOWN_MS = 800; // Mindestabstand, bevor derselbe Code erneut zaehlt
  const CLEAR_AFTER_MISSES = 4; // so viele Frames ohne Erkennung = Code "aus dem Bild"

  function connectAndJoin(code) {
    joinCard.style.display = 'none';
    scanCard.style.display = 'block';

    socket = io({ autoConnect: true });

    socket.on('connect', () => {
      dotConn.classList.add('on');
      connText.textContent = 'Verbunden – warte auf PC…';
      socket.emit('join-room', { code, role: 'scanner' });
    });

    socket.on('joined', () => {
      connText.textContent = 'Gekoppelt – Kamera wird gestartet…';
      startCamera();
    });

    socket.on('join-error', (err) => {
      connText.textContent = `Fehler: ${err.message}`;
    });

    socket.on('peer-status', (status) => {
      if (status.receivers > 0) {
        connText.textContent = 'Verbunden mit PC – bereit zum Scannen';
      } else {
        connText.textContent = 'Warte auf PC (Empfänger-Seite öffnen)…';
      }
    });

    socket.on('disconnect', () => {
      dotConn.classList.remove('on');
      connText.textContent = 'Verbindung getrennt – versuche erneut…';
    });
  }

  function startCamera() {
    html5Qr = new Html5Qrcode('reader', { verbose: false });
    const config = {
      fps: 12,
      qrbox: { width: 260, height: 160 },
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.CODE_93,
        Html5QrcodeSupportedFormats.CODABAR,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
      ],
    };

    html5Qr
      .start({ facingMode: 'environment' }, config, onScanSuccess, onScanFailure)
      .catch((err) => {
        connText.textContent = `Kamera-Fehler: ${err}`;
      });
  }

  // Wird pro Kamera-Frame ohne erkannten Code aufgerufen. Sobald der Barcode
  // eine Weile nicht mehr im Bild war, gilt er als "verlassen" und darf beim
  // naechsten Erkennen sofort wieder gesendet werden (z. B. gleicher Artikel
  // zweimal hintereinander).
  function onScanFailure() {
    missCount += 1;
    if (missCount >= CLEAR_AFTER_MISSES) {
      lastText = null;
    }
  }

  function onScanSuccess(decodedText, result) {
    missCount = 0;
    const now = Date.now();
    const sameCodeStillInView = decodedText === lastText && now - lastSentAt < MIN_COOLDOWN_MS;
    if (sameCodeStillInView) return;

    lastText = decodedText;
    lastSentAt = now;

    const format = result?.result?.format?.formatName || 'UNKNOWN';
    socket.emit('barcode', { text: decodedText, format });

    sent += 1;
    sentCount.textContent = String(sent);
    lastScan.textContent = `${decodedText} (${format})`;

    if (navigator.vibrate) navigator.vibrate(80);
  }

  joinBtn.addEventListener('click', () => {
    const code = codeInput.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) {
      codeInput.focus();
      return;
    }
    connectAndJoin(code);
  });

  if (prefillRoom) {
    connectAndJoin(prefillRoom);
  }
})();
