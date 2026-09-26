(() => {
  const joinCard = document.getElementById('joinCard');
  const scanCard = document.getElementById('scanCard');
  const codeInput = document.getElementById('codeInput');
  const joinBtn = document.getElementById('joinBtn');
  const dotConn = document.getElementById('dotConn');
  const connText = document.getElementById('connText');
  const lastScan = document.getElementById('lastScan');
  const sentCount = document.getElementById('sentCount');
  const flashOverlay = document.getElementById('flashOverlay');

  const params = new URLSearchParams(location.search);
  const prefillRoom = (params.get('room') || '').toUpperCase();
  if (prefillRoom) codeInput.value = prefillRoom;

  let socket = null;
  let html5Qr = null;
  let sent = 0;

  // Anti-Spam-Puffer: nach jedem erfolgreichen Scan wird 2 Sekunden lang gar
  // nichts mehr erkannt (egal ob gleicher oder anderer Code), damit nicht
  // aus Versehen mehrfach gesendet wird, waehrend das Handy noch ruhig
  // gehalten wird.
  let pausedUntil = 0;
  const SCAN_PAUSE_MS = 2000;

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

  function onScanFailure() {
    // Kein erkannter Code in diesem Frame - nichts zu tun, die Pause laeuft
    // unabhaengig davon einfach per Zeitstempel weiter.
  }

  function onScanSuccess(decodedText, result) {
    const now = Date.now();
    if (now < pausedUntil) return;
    pausedUntil = now + SCAN_PAUSE_MS;

    const format = result?.result?.format?.formatName || 'UNKNOWN';
    socket.emit('barcode', { text: decodedText, format });

    sent += 1;
    sentCount.textContent = String(sent);
    lastScan.textContent = `${decodedText} (${format})`;

    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
    playBeep();

    flashOverlay.classList.remove('flash');
    // reflow erzwingen, damit die Animation bei schnell aufeinanderfolgenden
    // Scans jedes Mal neu abspielt
    void flashOverlay.offsetWidth;
    flashOverlay.classList.add('flash');

    document.getElementById('reader').classList.add('scan-pause');
    setTimeout(() => {
      document.getElementById('reader').classList.remove('scan-pause');
    }, SCAN_PAUSE_MS);
  }

  // Vibration wird von manchen mobilen Browsern (v. a. neuere Chrome-Versionen)
  // nur noch direkt aus einer Nutzer-Geste erlaubt, nicht aus einem
  // asynchronen Kamera-Callback - daher als zuverlaessigeres Feedback
  // zusaetzlich ein kurzer Piepton per Web Audio API. Der AudioContext wird
  // erst beim "Verbinden"-Tap erzeugt (das ist eine echte Nutzer-Geste),
  // damit der Ton auf dem Handy nicht stummgeschaltet/blockiert wird.
  let audioCtx = null;

  function playBeep() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  }

  function unlockAudio() {
    if (audioCtx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  }
  // Falls die Seite per QR-Code direkt geoeffnet wird (ohne Tap auf
  // "Verbinden"), wird der Ton beim ersten Antippen des Bildschirms
  // entsperrt - vorher blockieren Browser Audio ohne Nutzer-Geste.
  document.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
  document.addEventListener('click', unlockAudio, { once: true });

  joinBtn.addEventListener('click', () => {
    const code = codeInput.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) {
      codeInput.focus();
      return;
    }
    unlockAudio();
    connectAndJoin(code);
  });

  if (prefillRoom) {
    connectAndJoin(prefillRoom);
  }
})();
