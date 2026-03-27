import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { getCompetitionRuntimeState } from './competitionEngine.js';

async function getTeamNames(teamIds) {
  if (!Array.isArray(teamIds) || teamIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .in('id', teamIds);

  if (error) {
    throw new Error(`Failed to load team names: ${error.message}`);
  }

  const map = new Map();
  for (const row of data || []) {
    map.set(row.id, row.name);
  }

  return map;
}

async function getQuestionById(questionId) {
  if (!questionId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('questions')
    .select('id, round_id, position, title, description, code, language, time_limit_seconds, test_cases')
    .eq('id', questionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load active question: ${error.message}`);
  }

  return data || null;
}

async function getLiveLeaderboard(compId, limit = 30) {
  const raw = await redis.zrevrange(`leaderboard:${compId}`, 0, Math.max(0, limit - 1), 'WITHSCORES');
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }

  const entries = [];
  const teamIds = [];
  for (let i = 0; i < raw.length; i += 2) {
    const teamId = raw[i];
    const totalScore = Number(raw[i + 1] || 0);
    entries.push({ teamId, totalScore });
    teamIds.push(teamId);
  }

  const teamNames = await getTeamNames(teamIds);
  return entries.map((entry, index) => ({
    rank: index + 1,
    team_id: entry.teamId,
    team_name: teamNames.get(entry.teamId) || 'Unknown Team',
    total_score: entry.totalScore,
  }));
}

export async function getCompetitionState(competitionId) {
  const runtime = await getCompetitionRuntimeState();
  const now = Date.now();

  if (runtime?.roundId && ['ACTIVE', 'PAUSED'].includes(String(runtime.status || ''))) {
    const activeQuestionId = runtime.questionIds?.[runtime.currentQuestionIndex] || null;
    const currentQuestion = await getQuestionById(activeQuestionId);
    const timeRemainingSeconds = runtime.status === 'PAUSED'
      ? Math.max(0, Math.floor((Number(runtime.pausedRemainingMs || 0)) / 1000))
      : Math.max(0, Math.ceil((Number(runtime.nextTransitionAt || 0) - now) / 1000));

    return {
      competition_id: competitionId,
      round: {
        status: runtime.status || 'IDLE',
        phase: runtime.phase || 'none',
        round_id: runtime.roundId,
        round_number: Number(runtime.roundNumber || 0) || null,
        current_question_index: Number(runtime.currentQuestionIndex || 0),
        current_question_id: activeQuestionId,
        time_remaining_seconds: Math.max(0, timeRemainingSeconds),
      },
      current_question: currentQuestion,
      leaderboard: await getLiveLeaderboard(env.COMPETITION_ID),
    };
  }

  const roundState = {
    status: 'IDLE',
    phase: 'none',
    current_question_index: 0,
    current_question_id: null,
    time_remaining_seconds: 0,
    next_start_at: null,
    round_id: null,
    round_number: null,
  };

  const scheduledRaw = await redis.hgetall(`comp:${env.COMPETITION_ID}:scheduled_start`);
  if (scheduledRaw && Object.keys(scheduledRaw).length > 0) {
    const scheduledAt = Number(scheduledRaw.start_at || 0);
    const remaining = Math.max(0, Math.ceil((scheduledAt - now) / 1000));

    if (scheduledAt > now) {
      roundState.status = 'IDLE';
      roundState.round_id = scheduledRaw.round_id || null;
      roundState.round_number = Number(scheduledRaw.round_number || 0) || null;
      roundState.time_remaining_seconds = remaining;
      roundState.next_start_at = scheduledAt;

      return {
        competition_id: competitionId,
        round: roundState,
        current_question: null,
        leaderboard: await getLiveLeaderboard(env.COMPETITION_ID),
      };
    }

    await redis.del(`comp:${env.COMPETITION_ID}:scheduled_start`);
  }

  const { data, error } = await supabaseAdmin
    .from('rounds')
    .select('id, round_number, status, duration_seconds, started_at')
    .in('status', ['ACTIVE', 'PAUSED'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!error && data) {
    let timeRemaining = data.duration_seconds;
    if (data.started_at && data.status === 'ACTIVE') {
      const elapsed = Math.floor((Date.now() - new Date(data.started_at).getTime()) / 1000);
      timeRemaining = Math.max(0, data.duration_seconds - elapsed);
    }

    roundState.status = data.status;
    roundState.round_id = data.id;
    roundState.round_number = data.round_number;
    roundState.time_remaining_seconds = timeRemaining;

    if (data.status === 'ACTIVE' || data.status === 'PAUSED') {
      const runtimeQuestion = await getQuestionById(roundState.current_question_id);
      return {
        competition_id: competitionId,
        round: roundState,
        current_question: runtimeQuestion,
        leaderboard: await getLiveLeaderboard(env.COMPETITION_ID),
      };
    }
  }

  return {
    competition_id: competitionId,
    round: roundState,
    current_question: null,
    leaderboard: await getLiveLeaderboard(env.COMPETITION_ID),
  };
}
