const state = {
  token: '',
  socket: null,
};

const els = {
  baseUrl: document.getElementById('baseUrl'),
  teamName: document.getElementById('teamName'),
  password: document.getElementById('password'),
  loginBtn: document.getElementById('loginBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  compId: document.getElementById('compId'),
  stateBtn: document.getElementById('stateBtn'),
  connectBtn: document.getElementById('connectBtn'),
  disconnectBtn: document.getElementById('disconnectBtn'),
  clearBtn: document.getElementById('clearBtn'),
  token: document.getElementById('token'),
  status: document.getElementById('status'),
  logs: document.getElementById('logs'),
};

function log(label, payload = null) {
  const line = payload === null
    ? `[${new Date().toLocaleTimeString()}] ${label}`
    : `[${new Date().toLocaleTimeString()}] ${label}\n${JSON.stringify(payload, null, 2)}`;

  els.logs.textContent = `${line}\n\n${els.logs.textContent}`;
}

function setStatus(text) {
  els.status.textContent = `Status: ${text}`;
}

function getBaseUrl() {
  return els.baseUrl.value.trim().replace(/\/$/, '');
}

function getToken() {
  return els.token.value.trim();
}

async function login() {
  const base = getBaseUrl();
  const teamName = els.teamName.value.trim();
  const password = els.password.value;

  if (!teamName || !password) {
    log('login blocked', { reason: 'team_name and password are required' });
    return;
  }

  try {
    setStatus('logging in');
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_name: teamName, password }),
    });

    const json = await res.json();
    if (!res.ok) {
      setStatus('login failed');
      log('login failed', json);
      return;
    }

    const token = json?.data?.access_token || '';
    state.token = token;
    els.token.value = token;
    setStatus('login success');
    log('login success', json);
  } catch (error) {
    setStatus('login error');
    log('login error', { message: String(error) });
  }
}

async function logoutApi() {
  const base = getBaseUrl();
  const token = getToken();

  if (!token) {
    log('logout blocked', { reason: 'token missing' });
    return;
  }

  try {
    const res = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const json = await res.json();
    log('logout response', { status: res.status, body: json });
  } catch (error) {
    log('logout error', { message: String(error) });
  }
}

async function fetchState() {
  const base = getBaseUrl();
  const token = getToken();
  const compId = els.compId.value.trim();

  if (!token || !compId) {
    log('state blocked', { reason: 'token and competition id are required' });
    return;
  }

  try {
    const res = await fetch(`${base}/api/competition/${compId}/state`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    log('competition state response', { status: res.status, body: json });
  } catch (error) {
    log('competition state error', { message: String(error) });
  }
}

function disconnectSocket() {
  if (!state.socket) {
    log('socket', { info: 'already disconnected' });
    return;
  }

  state.socket.disconnect();
  state.socket = null;
  setStatus('socket disconnected');
}

function connectSocket() {
  const base = getBaseUrl();
  const token = getToken();

  if (!token) {
    log('socket connect blocked', { reason: 'token missing' });
    return;
  }

  if (state.socket?.connected) {
    log('socket', { info: 'already connected' });
    return;
  }

  const socket = io(base, {
    transports: ['websocket'],
    auth: { token },
  });

  const eventNames = [
    'competition:state',
    'round:start',
    'question:next',
    'round:end',
    'submission:result',
    'run:result',
    'leaderboard:update',
    'session:ended',
  ];

  socket.on('connect', () => {
    setStatus(`socket connected (${socket.id})`);
    log('socket connect', { socketId: socket.id });
  });

  socket.on('disconnect', (reason) => {
    setStatus(`socket disconnected (${reason})`);
    log('socket disconnect', { reason });
  });

  socket.on('connect_error', (error) => {
    setStatus('socket connect error');
    log('socket connect_error', { message: error.message });
  });

  for (const eventName of eventNames) {
    socket.on(eventName, (payload) => {
      log(`socket event: ${eventName}`, payload);
    });
  }

  state.socket = socket;
}

els.loginBtn.addEventListener('click', login);
els.logoutBtn.addEventListener('click', logoutApi);
els.stateBtn.addEventListener('click', fetchState);
els.connectBtn.addEventListener('click', connectSocket);
els.disconnectBtn.addEventListener('click', disconnectSocket);
els.clearBtn.addEventListener('click', () => {
  els.logs.textContent = '';
});

log('prototype loaded');
