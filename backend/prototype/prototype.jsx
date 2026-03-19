const state = {
  token: '',
  adminToken: '',
  socket: null,
  submitReady: false,
  submitReadyRoundId: null,
  submitReadyQuestionId: null,
  pendingRunSubmissionId: null,
  pendingSubmitSubmissionId: null,
  lastRunResultSubmissionId: null,
};

const els = {
  baseUrl: document.getElementById('baseUrl'),
  teamName: document.getElementById('teamName'),
  password: document.getElementById('password'),
  loginBtn: document.getElementById('loginBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  adminEmail: document.getElementById('adminEmail'),
  adminPassword: document.getElementById('adminPassword'),
  adminLoginBtn: document.getElementById('adminLoginBtn'),
  adminRoundNumber: document.getElementById('adminRoundNumber'),
  adminStartBtn: document.getElementById('adminStartBtn'),
  adminPauseBtn: document.getElementById('adminPauseBtn'),
  adminResumeBtn: document.getElementById('adminResumeBtn'),
  adminEndBtn: document.getElementById('adminEndBtn'),
  compId: document.getElementById('compId'),
  stateBtn: document.getElementById('stateBtn'),
  redisBtn: document.getElementById('redisBtn'),
  roundId: document.getElementById('roundId'),
  questionId: document.getElementById('questionId'),
  language: document.getElementById('language'),
  runBtn: document.getElementById('runBtn'),
  submitBtn: document.getElementById('submitBtn'),
  connectBtn: document.getElementById('connectBtn'),
  disconnectBtn: document.getElementById('disconnectBtn'),
  clearBtn: document.getElementById('clearBtn'),
  token: document.getElementById('token'),
  code: document.getElementById('code'),
  status: document.getElementById('status'),
  runSubmitState: document.getElementById('runSubmitState'),
  logs: document.getElementById('logs'),
};

els.code.value = `#include <iostream>
#include <vector>

void reverseVector(std::vector<int>& arr) {
    int n = arr.size();
    for (int i = 0; i < n; i++) {
        int temp = arr[i];
        arr[i] = arr[n - 1 - i];
        arr[n - 1 - i] = temp;
    }
}

int main() {
    std::vector<int> myNumbers = {1, 2, 3, 4, 5};
    reverseVector(myNumbers);

    for (int num : myNumbers) {
        std::cout << num << " ";
    }
    return 0;
}`;

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

function setRunSubmitState(text) {
  els.runSubmitState.textContent = `Run/Submit State: ${text}`;
}

function setSubmitEnabled(enabled, reason = '') {
  state.submitReady = enabled;
  els.submitBtn.disabled = !enabled;
  if (enabled) {
    els.submitBtn.title = 'Submit is enabled (passing run detected).';
  } else {
    els.submitBtn.title = reason || 'Submit requires a passing run for current round/question.';
  }
}

function resetSubmitGate(reason = 'Run again to unlock submit.') {
  state.submitReadyRoundId = null;
  state.submitReadyQuestionId = null;
  state.pendingRunSubmissionId = null;
  state.lastRunResultSubmissionId = null;
  setSubmitEnabled(false, reason);
  setRunSubmitState('submit locked (run required)');
}

function renderLeaderboard(payload) {
  const rankings = Array.isArray(payload?.rankings) ? payload.rankings : [];
  if (rankings.length === 0) {
    return {
      info: 'No leaderboard rows yet',
      round_id: payload?.round_id || null,
      generated_at: payload?.generated_at || null,
    };
  }

  return {
    round_id: payload?.round_id || null,
    generated_at: payload?.generated_at || null,
    top: rankings.slice(0, 10).map((row) => ({
      rank: row.rank,
      team_name: row.team_name,
      total_score: row.total_score,
      per_question: (row.per_question || []).map((q) => ({
        question_id: q.question_id,
        completed: q.completed,
        completed_at: q.completed_at,
        score: q.score,
        solve_rank: q.solve_rank,
      })),
    })),
  };
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
    resetSubmitGate('Run again after login to unlock submit.');
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

async function checkRedisHealth() {
  const base = getBaseUrl();
  const token = getToken();

  if (!token) {
    log('redis check blocked', { reason: 'token missing' });
    return;
  }

  try {
    const res = await fetch(`${base}/api/infra/redis`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    log('redis health response', { status: res.status, body: json });
  } catch (error) {
    log('redis health error', { message: String(error) });
  }
}

async function adminLoginApi() {
  const base = getBaseUrl();
  const email = els.adminEmail.value.trim();
  const password = els.adminPassword.value;

  if (!email || !password) {
    log('admin login blocked', { reason: 'email and password required' });
    return;
  }

  try {
    setStatus('admin logging in');
    const res = await fetch(`${base}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const json = await res.json();
    if (!res.ok) {
      setStatus('admin login failed');
      log('admin login failed', json);
      return;
    }

    const token = json?.data?.access_token || '';
    state.adminToken = token;
    setStatus('admin login success');
    log('admin login success', {
      ...json,
      note: 'Admin token stored for admin actions; participant token unchanged',
    });
  } catch (error) {
    setStatus('admin login error');
    log('admin login error', { message: String(error) });
  }
}

async function adminRoundAction(action) {
  const base = getBaseUrl();
  const token = state.adminToken || getToken();
  const roundNumber = els.adminRoundNumber.value.trim();

  if (!token || !roundNumber) {
    log('admin action blocked', { reason: 'token and roundNumber required' });
    return;
  }

  try {
    const res = await fetch(`${base}/api/admin/round/${encodeURIComponent(roundNumber)}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    const json = await res.json();
    log(`admin ${action} response`, { status: res.status, body: json });
  } catch (error) {
    log(`admin ${action} error`, { message: String(error) });
  }
}

async function runCodeApi() {
  const base = getBaseUrl();
  const token = getToken();
  const roundId = els.roundId.value.trim();
  const questionId = els.questionId.value.trim();
  const language = els.language.value.trim();
  const code = els.code.value;

  if (!token || !roundId || !questionId || !language || !code) {
    log('run blocked', {
      reason: 'token, roundId, questionId, language, and code are required',
    });
    return;
  }

  try {
    resetSubmitGate('New run requested. Waiting for matching run result to unlock submit.');
    setRunSubmitState('run pending');

    const res = await fetch(`${base}/api/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        code,
        language,
        questionId,
        roundId,
      }),
    });

    const json = await res.json();
    const submissionId = String(json?.data?.submission_id || '');
    state.pendingRunSubmissionId = submissionId || null;
    log('run request response', { status: res.status, body: json });
  } catch (error) {
    setRunSubmitState('run request error');
    log('run request error', { message: String(error) });
  }
}

async function submitCodeApi() {
  const base = getBaseUrl();
  const token = getToken();
  const roundId = els.roundId.value.trim();
  const questionId = els.questionId.value.trim();
  const language = els.language.value.trim();
  const code = els.code.value;

  if (!token || !roundId || !questionId || !language || !code) {
    log('submit blocked', {
      reason: 'token, roundId, questionId, language, and code are required',
    });
    return;
  }

  if (!state.submitReady
    || state.submitReadyRoundId !== roundId
    || state.submitReadyQuestionId !== questionId) {
    log('submit blocked', {
      reason: 'Submit is locked until a passing run result is received for the current round/question',
      submitReady: state.submitReady,
      submitReadyRoundId: state.submitReadyRoundId,
      submitReadyQuestionId: state.submitReadyQuestionId,
      roundId,
      questionId,
    });
    return;
  }

  try {
    state.pendingSubmitSubmissionId = null;
    setRunSubmitState('submit pending');

    const res = await fetch(`${base}/api/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        code,
        language,
        questionId,
        roundId,
      }),
    });

    const json = await res.json();
    const submissionId = String(json?.data?.submission_id || '');
    state.pendingSubmitSubmissionId = submissionId || null;
    log('submit request response', { status: res.status, body: json });
  } catch (error) {
    setRunSubmitState('submit request error');
    log('submit request error', { message: String(error) });
  }
}

function disconnectSocket() {
  if (!state.socket) {
    log('socket', { info: 'already disconnected' });
    return;
  }

  state.socket.disconnect();
  state.socket = null;
  resetSubmitGate('Socket disconnected. Run again after reconnect to unlock submit.');
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

  socket.on('run:result', (payload) => {
    log('socket event: run:result', payload);

    const currentRoundId = els.roundId.value.trim();
    const currentQuestionId = els.questionId.value.trim();
    const payloadRoundId = String(payload?.round_id ?? '');
    const payloadQuestionId = String(payload?.question_id ?? '');
    const payloadStatus = String(payload?.status ?? '');
    const payloadSubmissionId = String(payload?.submission_id ?? '');

    const sameTarget = payloadRoundId === currentRoundId && payloadQuestionId === currentQuestionId;
    const isLatestRun = payloadSubmissionId !== '' && payloadSubmissionId === state.pendingRunSubmissionId;

    if (!sameTarget || !isLatestRun) {
      return;
    }

    state.lastRunResultSubmissionId = payloadSubmissionId;

    if (payloadStatus === 'ACCEPTED') {
      state.submitReadyRoundId = payloadRoundId;
      state.submitReadyQuestionId = payloadQuestionId;
      setSubmitEnabled(true);
      setRunSubmitState(`run accepted (id=${payloadSubmissionId})`);
      log('submit unlocked', {
        run_submission_id: payloadSubmissionId,
        roundId: payloadRoundId,
        questionId: payloadQuestionId,
      });
      return;
    }

    setRunSubmitState(`run ${payloadStatus.toLowerCase()} (id=${payloadSubmissionId})`);
    resetSubmitGate('Latest run did not pass all test cases.');
  });

  socket.on('submission:result', (payload) => {
    log('socket event: submission:result', payload);

    const payloadSubmissionId = String(payload?.submission_id ?? '');
    if (state.pendingSubmitSubmissionId && payloadSubmissionId === state.pendingSubmitSubmissionId) {
      state.pendingSubmitSubmissionId = null;
      const verdict = String(payload?.status || '').toLowerCase();
      setRunSubmitState(`submit ${verdict} (id=${payloadSubmissionId})`);
    }
  });

  socket.on('leaderboard:update', (payload) => {
    log('socket event: leaderboard:update', renderLeaderboard(payload));
  });

  for (const eventName of eventNames) {
    if (eventName === 'submission:result' || eventName === 'leaderboard:update') {
      continue;
    }
    socket.on(eventName, (payload) => {
      log(`socket event: ${eventName}`, payload);
    });
  }

  state.socket = socket;
}

els.loginBtn.addEventListener('click', login);
els.logoutBtn.addEventListener('click', logoutApi);
els.stateBtn.addEventListener('click', fetchState);
els.redisBtn.addEventListener('click', checkRedisHealth);
els.runBtn.addEventListener('click', runCodeApi);
els.submitBtn.addEventListener('click', submitCodeApi);
els.connectBtn.addEventListener('click', connectSocket);
els.disconnectBtn.addEventListener('click', disconnectSocket);
els.roundId.addEventListener('input', () => resetSubmitGate('Round changed. Run again to unlock submit.'));
els.questionId.addEventListener('input', () => resetSubmitGate('Question changed. Run again to unlock submit.'));
els.language.addEventListener('input', () => resetSubmitGate('Language changed. Run again to unlock submit.'));
els.code.addEventListener('input', () => resetSubmitGate('Code changed. Run again to unlock submit.'));
els.adminLoginBtn.addEventListener('click', adminLoginApi);
els.adminStartBtn.addEventListener('click', () => adminRoundAction('start'));
els.adminPauseBtn.addEventListener('click', () => adminRoundAction('pause'));
els.adminResumeBtn.addEventListener('click', () => adminRoundAction('resume'));
els.adminEndBtn.addEventListener('click', () => adminRoundAction('end'));
els.clearBtn.addEventListener('click', () => {
  els.logs.textContent = '';
});

resetSubmitGate('Run once to unlock submit.');
setRunSubmitState('idle');

log('prototype loaded');
