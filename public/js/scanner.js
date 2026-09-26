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
  let lastText = null;
  let lastTime = 0;
  const DEDUPE_MS = 1500;

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
      .start({ facingMode: 'environment' }, config, onScanSuccess, () => {})
      .catch((err) => {
        connText.textContent = `Kamera-Fehler: ${err}`;
      });
  }

  function onScanSuccess(decodedText, result) {
    const now = Date.now();
    if (decodedText === lastText && now - lastTime < DEDUPE_MS) return;
    lastText = decodedText;
    lastTime = now;

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
