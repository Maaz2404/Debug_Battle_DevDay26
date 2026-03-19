import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { emitToRoom } from '../socket/registry.js';
import { HttpError } from '../utils/http.js';

const activeRoundTimers = new Map();

function parseRoundNumber(roundNumber) {
  const parsed = Number(roundNumber);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, 'roundNumber must be a positive integer');
  }
  return parsed;
}

function getCompetitionRoom() {
  return `comp:${env.COMPETITION_ID}`;
}

function getCompetitionStateKey() {
  return `comp:${env.COMPETITION_ID}:state`;
}

function getRoundStatusKey(roundId) {
  return `round:${roundId}:status`;
}

function getRoundStartKey(roundId) {
  return `round:${roundId}:start_at`;
}

function getCurrentQuestionKey(roundId) {
  return `round:${roundId}:current_question`;
}

function getQuestionGapSeconds() {
  const parsed = Number(env.QUESTION_GAP_SECONDS || 30);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 30;
  }
  return parsed;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function getRoundByNumber(roundNumber) {
  const parsed = parseRoundNumber(roundNumber);
  const { data, error } = await supabaseAdmin
    .from('rounds')
    .select('id, round_number, status, started_at, ended_at, duration_seconds')
    .eq('round_number', parsed)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, 'Failed to read round', error.message);
  }

  if (!data) {
    throw new HttpError(404, `Round ${parsed} not found`);
  }

  return data;
}

async function getRoundQuestions(roundId) {
  const { data, error } = await supabaseAdmin
    .from('questions')
    .select('id, round_id, position, title, description, time_limit_seconds, base_score, test_cases')
    .eq('round_id', roundId)
    .order('position', { ascending: true });

  if (error) {
    throw new HttpError(500, 'Failed to read round questions', error.message);
  }

  if (!data || data.length === 0) {
    throw new HttpError(409, 'Cannot start round without questions');
  }

  return data;
}

async function updateRoundStatus(roundId, fields) {
  const { data, error } = await supabaseAdmin
    .from('rounds')
    .update(fields)
    .eq('id', roundId)
    .select('id, round_number, status, started_at, ended_at, duration_seconds')
    .single();

  if (error) {
    throw new HttpError(500, 'Failed to update round', error.message);
  }

  return data;
}

async function getTeamNames(teamIds) {
  if (!Array.isArray(teamIds) || teamIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .in('id', teamIds);

  if (error) {
    throw new HttpError(500, 'Failed to read team names', error.message);
  }

  const map = new Map();
  for (const row of data || []) {
    map.set(row.id, row.name);
  }
  return map;
}

async function buildRoundEndSnapshot(roundId) {
  const leaderboardKey = `leaderboard:${env.COMPETITION_ID}`;
  const raw = await redis.zrevrange(leaderboardKey, 0, -1, 'WITHSCORES');

  const entries = [];
  const teamIds = [];
  for (let i = 0; i < raw.length; i += 2) {
    const teamId = raw[i];
    const score = Number(raw[i + 1] || 0);
    entries.push({ teamId, score });
    teamIds.push(teamId);
  }

  const teamNames = await getTeamNames(teamIds);

  const rankings = entries.map((entry, index) => ({
    rank: index + 1,
    team_id: entry.teamId,
    team_name: teamNames.get(entry.teamId) || 'Unknown Team',
    score: entry.score,
  }));

  return {
    captured_at: new Date().toISOString(),
    rankings,
  };
}

async function storeRoundSnapshot(roundId) {
  const snapshot = await buildRoundEndSnapshot(roundId);

  const { error } = await supabaseAdmin
    .from('leaderboard_snapshots')
    .insert({
      competition_id: env.COMPETITION_ID,
      round_id: roundId,
      snapshot,
    });

  if (error) {
    throw new HttpError(500, 'Failed to store leaderboard snapshot', error.message);
  }
}

async function cleanupRunpassForRound(roundId) {
  const pattern = `runpass:*:*:${roundId}`;
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== '0');
}

function clearRoundTimer(roundId) {
  const timer = activeRoundTimers.get(roundId);
  if (timer) {
    clearTimeout(timer);
    activeRoundTimers.delete(roundId);
  }
}

async function writeRoundRuntimeState(state) {
  const key = getCompetitionStateKey();
  await redis.hset(key, {
    round_id: state.roundId,
    round_number: String(state.roundNumber),
    status: state.status,
    phase: state.phase,
    current_question_index: String(state.currentQuestionIndex),
    question_started_at: String(state.questionStartedAt || 0),
    next_transition_at: String(state.nextTransitionAt || 0),
    paused_remaining_ms: String(state.pausedRemainingMs || 0),
    gap_seconds: String(state.gapSeconds),
    question_ids: JSON.stringify(state.questionIds || []),
    question_durations: JSON.stringify(state.questionDurations || []),
  });
}

async function readRoundRuntimeState() {
  const raw = await redis.hgetall(getCompetitionStateKey());
  if (!raw || Object.keys(raw).length === 0) {
    return null;
  }

  return {
    roundId: raw.round_id || null,
    roundNumber: toNumber(raw.round_number, 0),
    status: raw.status || 'IDLE',
    phase: raw.phase || 'none',
    currentQuestionIndex: toNumber(raw.current_question_index, -1),
    questionStartedAt: toNumber(raw.question_started_at, 0),
    nextTransitionAt: toNumber(raw.next_transition_at, 0),
    pausedRemainingMs: toNumber(raw.paused_remaining_ms, 0),
    gapSeconds: toNumber(raw.gap_seconds, getQuestionGapSeconds()),
    questionIds: JSON.parse(raw.question_ids || '[]'),
    questionDurations: JSON.parse(raw.question_durations || '[]'),
  };
}

export async function getCompetitionRuntimeState() {
  return readRoundRuntimeState();
}

export async function assertCanAttemptQuestion(roundId, questionId) {
  const state = await readRoundRuntimeState();
  if (!state || !state.roundId) {
    throw new HttpError(409, 'Competition runtime state is not initialized');
  }

  if (state.status !== 'ACTIVE') {
    throw new HttpError(409, 'Round is not active');
  }

  if (state.phase !== 'question') {
    throw new HttpError(409, 'Question window is closed (gap interval)');
  }

  if (String(roundId) !== String(state.roundId)) {
    throw new HttpError(400, 'roundId does not match active round');
  }

  const currentQuestionId = String(state.questionIds[state.currentQuestionIndex] || '');
  if (String(questionId) !== currentQuestionId) {
    throw new HttpError(409, 'Submission is not for the current active question');
  }

  return state;
}

async function persistRoundLiveKeys(state) {
  await redis.set(getRoundStatusKey(state.roundId), state.status);
  await redis.set(getCurrentQuestionKey(state.roundId), state.currentQuestionIndex);

  if (state.status === 'ACTIVE') {
    const startAt = state.questionStartedAt || Date.now();
    await redis.set(getRoundStartKey(state.roundId), String(startAt));
  }
}

async function emitQuestionNext(state) {
  const questionId = state.questionIds[state.currentQuestionIndex];
  const { data, error } = await supabaseAdmin
    .from('questions')
    .select('id, round_id, position, title, description, time_limit_seconds, base_score, test_cases')
    .eq('id', questionId)
    .maybeSingle();

  if (error || !data) {
    console.error('[competition-engine] failed to load question for emit', {
      roundId: state.roundId,
      index: state.currentQuestionIndex,
      questionId,
      error: error?.message || 'not-found',
    });
    return;
  }

  emitToRoom(getCompetitionRoom(), 'question:next', {
    round_id: state.roundId,
    round_number: state.roundNumber,
    index: state.currentQuestionIndex,
    question: data,
    time_limit_seconds: data.time_limit_seconds,
    phase: state.phase,
  });
}

async function emitRoundStart(state) {
  const questionId = state.questionIds[0];
  const { data: question } = await supabaseAdmin
    .from('questions')
    .select('id, round_id, position, title, description, time_limit_seconds, base_score, test_cases')
    .eq('id', questionId)
    .maybeSingle();

  emitToRoom(getCompetitionRoom(), 'round:start', {
    round_id: state.roundId,
    round_number: state.roundNumber,
    duration_seconds: state.questionDurations.reduce((acc, secs) => acc + secs, 0)
      + ((state.questionDurations.length - 1) * state.gapSeconds),
    question: question || null,
    index: 0,
  });
}

async function emitRoundEnd(state) {
  emitToRoom(getCompetitionRoom(), 'round:end', {
    round_id: state.roundId,
    round_number: state.roundNumber,
    status: 'ENDED',
  });
}

async function scheduleNextTransition(state) {
  clearRoundTimer(state.roundId);

  if (state.status !== 'ACTIVE') {
    return;
  }

  const now = Date.now();
  const delay = Math.max(0, state.nextTransitionAt - now);
  const timer = setTimeout(async () => {
    try {
      await advanceRoundTimeline(state.roundId);
    } catch (error) {
      console.error('[competition-engine] transition failed', {
        roundId: state.roundId,
        message: error.message,
      });
    }
  }, delay);

  activeRoundTimers.set(state.roundId, timer);
}

async function advanceRoundTimeline(roundId) {
  const state = await readRoundRuntimeState();
  if (!state || state.roundId !== roundId || state.status !== 'ACTIVE') {
    return;
  }

  const totalQuestions = state.questionIds.length;
  const now = Date.now();

  if (state.phase === 'question') {
    const isLastQuestion = state.currentQuestionIndex >= totalQuestions - 1;
    if (isLastQuestion) {
      await endRoundByNumber(state.roundNumber, 'timeline-complete');
      return;
    }

    state.phase = 'gap';
    state.nextTransitionAt = now + (state.gapSeconds * 1000);
    state.questionStartedAt = 0;
    await writeRoundRuntimeState(state);
    await persistRoundLiveKeys(state);
    await scheduleNextTransition(state);
    return;
  }

  if (state.phase === 'gap') {
    const nextIndex = state.currentQuestionIndex + 1;
    if (nextIndex >= totalQuestions) {
      await endRoundByNumber(state.roundNumber, 'timeline-complete');
      return;
    }

    state.currentQuestionIndex = nextIndex;
    state.phase = 'question';
    state.questionStartedAt = now;
    state.nextTransitionAt = now + ((state.questionDurations[nextIndex] || 180) * 1000);

    await writeRoundRuntimeState(state);
    await persistRoundLiveKeys(state);
    await emitQuestionNext(state);
    await scheduleNextTransition(state);
  }
}

export async function startRoundByNumber(roundNumber) {
  const round = await getRoundByNumber(roundNumber);
  if (round.status !== 'IDLE') {
    throw new HttpError(409, `Cannot start round in status ${round.status}`);
  }

  const questions = await getRoundQuestions(round.id);
  const questionIds = questions.map((q) => q.id);
  const questionDurations = questions.map((q) => Number(q.time_limit_seconds || 180));
  const now = Date.now();
  const gapSeconds = getQuestionGapSeconds();

  const state = {
    roundId: round.id,
    roundNumber: round.round_number,
    status: 'ACTIVE',
    phase: 'question',
    currentQuestionIndex: 0,
    questionStartedAt: now,
    nextTransitionAt: now + (questionDurations[0] * 1000),
    pausedRemainingMs: 0,
    gapSeconds,
    questionIds,
    questionDurations,
  };

  await updateRoundStatus(round.id, {
    status: 'ACTIVE',
    started_at: new Date(now).toISOString(),
    ended_at: null,
  });

  await writeRoundRuntimeState(state);
  await persistRoundLiveKeys(state);
  await emitRoundStart(state);
  await scheduleNextTransition(state);

  return round;
}

export async function pauseRoundByNumber(roundNumber) {
  const round = await getRoundByNumber(roundNumber);
  if (round.status !== 'ACTIVE') {
    throw new HttpError(409, `Cannot pause round in status ${round.status}`);
  }

  const state = await readRoundRuntimeState();
  if (!state || state.roundId !== round.id) {
    throw new HttpError(409, 'Runtime state missing for active round');
  }

  const now = Date.now();
  state.status = 'PAUSED';
  state.pausedRemainingMs = Math.max(0, state.nextTransitionAt - now);

  await updateRoundStatus(round.id, { status: 'PAUSED' });
  await writeRoundRuntimeState(state);
  await persistRoundLiveKeys(state);
  clearRoundTimer(round.id);

  return round;
}

export async function resumeRoundByNumber(roundNumber) {
  const round = await getRoundByNumber(roundNumber);
  if (round.status !== 'PAUSED') {
    throw new HttpError(409, `Cannot resume round in status ${round.status}`);
  }

  const state = await readRoundRuntimeState();
  if (!state || state.roundId !== round.id) {
    throw new HttpError(409, 'Runtime state missing for paused round');
  }

  const now = Date.now();
  state.status = 'ACTIVE';
  state.nextTransitionAt = now + Math.max(1000, state.pausedRemainingMs || 1000);
  state.pausedRemainingMs = 0;

  await updateRoundStatus(round.id, { status: 'ACTIVE' });
  await writeRoundRuntimeState(state);
  await persistRoundLiveKeys(state);
  await scheduleNextTransition(state);

  return round;
}

export async function endRoundByNumber(roundNumber, reason = 'manual-end') {
  const round = await getRoundByNumber(roundNumber);
  if (!['ACTIVE', 'PAUSED'].includes(round.status)) {
    throw new HttpError(409, `Cannot end round in status ${round.status}`);
  }

  clearRoundTimer(round.id);

  await updateRoundStatus(round.id, {
    status: 'ENDED',
    ended_at: new Date().toISOString(),
  });

  const state = await readRoundRuntimeState();
  if (state && state.roundId === round.id) {
    state.status = 'ENDED';
    state.phase = 'ended';
    state.nextTransitionAt = 0;
    state.pausedRemainingMs = 0;
    await writeRoundRuntimeState(state);
    await persistRoundLiveKeys(state);
    await emitRoundEnd(state);
  }

  await cleanupRunpassForRound(round.id);
  await storeRoundSnapshot(round.id);

  console.log('[competition-engine] round ended', {
    roundId: round.id,
    roundNumber: round.round_number,
    reason,
  });

  return round;
}

export async function rehydrateCompetitionEngine() {
  const state = await readRoundRuntimeState();
  if (!state || !state.roundId) {
    return;
  }

  if (state.status === 'ACTIVE') {
    await scheduleNextTransition(state);
    console.log('[competition-engine] rehydrated active round', {
      roundId: state.roundId,
      roundNumber: state.roundNumber,
      phase: state.phase,
      index: state.currentQuestionIndex,
    });
  }
}
