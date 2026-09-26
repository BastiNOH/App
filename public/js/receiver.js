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
    typeIntoTarget(payload.text);
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

  function typeIntoTarget(text) {
    targetInput.value = text;
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
