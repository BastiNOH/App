(() => {
  const dotConn = document.getElementById('dotConn');
  const connText = document.getElementById('connText');
  const dotPhone = document.getElementById('dotPhone');
  const phoneText = document.getElementById('phoneText');
  const qrImg = document.getElementById('qrImg');
  const roomCodeEl = document.getElementById('roomCode');
  const scanUrlText = document.getElementById('scanUrlText');
  const newRoomBtn = document.getElementById('newRoomBtn');
  const targetInput = document.getElementById('targetInput');
  const autoEnter = document.getElementById('autoEnter');
  const countText = document.getElementById('countText');
  const logBody = document.getElementById('logBody');
  const copyLastBtn = document.getElementById('copyLastBtn');
  const clearBtn = document.getElementById('clearBtn');

  let history = [];
  let currentCode = null;
  let info = { scheme: location.protocol.replace(':', ''), addresses: [location.hostname] };

  function buildScanUrl(code) {
    const addr = info.addresses && info.addresses.length ? info.addresses[0] : location.hostname;
    const port = location.port ? `:${location.port}` : '';
    return `${info.scheme}://${addr}${port}/scanner?room=${code}`;
  }

  async function loadInfo() {
    try {
      const res = await fetch('/api/info');
      info = await res.json();
    } catch (e) {
      // Fallback: use current origin
    }
  }

  async function renderRoom(code) {
    currentCode = code;
    roomCodeEl.textContent = code;
    const url = buildScanUrl(code);
    scanUrlText.textContent = url;
    qrImg.src = `/api/qr?text=${encodeURIComponent(url)}`;
  }

  async function createRoom() {
    await loadInfo();
    const res = await fetch('/api/room', { method: 'POST' });
    const data = await res.json();
    await renderRoom(data.code);
    joinRoom(data.code);
  }

  const socket = io({ autoConnect: true });

  socket.on('connect', () => {
    dotConn.classList.add('on');
    connText.textContent = 'Mit Server verbunden';
    if (currentCode) joinRoom(currentCode);
  });

  socket.on('disconnect', () => {
    dotConn.classList.remove('on');
    connText.textContent = 'Verbindung getrennt – versuche erneut…';
  });

  function joinRoom(code) {
    socket.emit('join-room', { code, role: 'receiver' });
  }

  socket.on('peer-status', (status) => {
    if (status.scanners > 0) {
      dotPhone.classList.add('on');
      phoneText.textContent = 'Handy verbunden – bereit zum Scannen';
    } else {
      dotPhone.classList.remove('on');
      phoneText.textContent = 'Kein Handy verbunden';
    }
  });

  socket.on('barcode', (payload) => {
    history.unshift(payload);
    countText.textContent = String(history.length);
    renderHistory();
    enqueueScan(payload.text);
  });

  function renderHistory() {
    logBody.innerHTML = '';
    for (const item of history.slice(0, 200)) {
      const tr = document.createElement('tr');
      const time = new Date(item.ts).toLocaleTimeString();
      tr.innerHTML = `<td class="muted">${time}</td><td>${escapeHtml(item.text)}</td><td class="muted">${escapeHtml(item.format)}</td>`;
      logBody.appendChild(tr);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Puffer/Warteschlange: mehrere schnell hintereinander eintreffende Scans
  // werden nicht gleichzeitig ins Feld geschrieben, sondern nacheinander mit
  // echten Tastatur-Events "getippt" – so entsteht kein Spam/Ueberschreiben,
  // auch wenn mehrere Codes kurz hintereinander gescannt werden.
  const scanQueue = [];
  let queueRunning = false;
  const CHAR_TYPE_DELAY_MS = 12;
  const GAP_BETWEEN_SCANS_MS = 250;

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

  function setNativeValue(el, value) {
    nativeInputValueSetter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function enqueueScan(text) {
    scanQueue.push(text);
    runQueue();
  }

  async function runQueue() {
    if (queueRunning) return;
    queueRunning = true;
    while (scanQueue.length) {
      const text = scanQueue.shift();
      await typeIntoTarget(text);
      await sleep(GAP_BETWEEN_SCANS_MS);
    }
    queueRunning = false;
  }

  async function typeIntoTarget(text) {
    setNativeValue(targetInput, '');
    for (const char of text) {
      targetInput.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      setNativeValue(targetInput, targetInput.value + char);
      targetInput.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
      await sleep(CHAR_TYPE_DELAY_MS);
    }

    targetInput.classList.add('result-flash');
    setTimeout(() => targetInput.classList.remove('result-flash'), 650);

    if (autoEnter.checked) {
      targetInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      targetInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
      const form = targetInput.closest('form');
      if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
    }
  }

  copyLastBtn.addEventListener('click', async () => {
    if (!history.length) return;
    try {
      await navigator.clipboard.writeText(history[0].text);
    } catch (e) {
      // clipboard may be unavailable without HTTPS/focus; ignore silently
    }
  });

  clearBtn.addEventListener('click', () => {
    history = [];
    countText.textContent = '0';
    renderHistory();
  });

  newRoomBtn.addEventListener('click', createRoom);

  createRoom();
})();
