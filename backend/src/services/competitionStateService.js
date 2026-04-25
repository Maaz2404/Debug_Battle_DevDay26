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

async function getRoundQuestionCatalog() {
  const { data: rounds, error: roundsError } = await supabaseAdmin
    .from('rounds')
    .select('id, round_number')
    .order('round_number', { ascending: true });

  if (roundsError) {
    throw new Error(`Failed to load rounds for leaderboard: ${roundsError.message}`);
  }

  const { data: questions, error: questionsError } = await supabaseAdmin
    .from('questions')
    .select('id, round_id, position')
    .order('position', { ascending: true });

  if (questionsError) {
    throw new Error(`Failed to load questions for leaderboard: ${questionsError.message}`);
  }

  const questionsByRoundId = new Map();
  for (const row of questions || []) {
    const key = String(row.round_id || '');
    if (!key) {
      continue;
    }

    if (!questionsByRoundId.has(key)) {
      questionsByRoundId.set(key, []);
    }
    questionsByRoundId.get(key).push({
      id: row.id,
      position: Number(row.position || 0),
    });
  }

  return (rounds || []).map((round) => ({
    id: round.id,
    round_number: Number(round.round_number || 0),
    questions: (questionsByRoundId.get(String(round.id)) || [])
      .sort((a, b) => a.position - b.position),
  }));
}

async function getAcceptedSubmissionScores(teamIds) {
  if (!Array.isArray(teamIds) || teamIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('submissions')
    .select('team_id, round_id, question_id, total_score, base_score, bonus_score, solve_rank')
    .eq('job_type', 'submit')
    .eq('status', 'ACCEPTED')
    .in('team_id', teamIds);

  if (error) {
    throw new Error(`Failed to load submission scores for leaderboard: ${error.message}`);
  }

  return data || [];
}

function buildTeamRoundScoreMap(rows) {
  const map = new Map();

  for (const row of rows || []) {
    const teamId = String(row.team_id || '');
    const roundId = String(row.round_id || '');
    const questionId = String(row.question_id || '');
    if (!teamId || !roundId || !questionId) {
      continue;
    }

    if (!map.has(teamId)) {
      map.set(teamId, new Map());
    }

    const roundMap = map.get(teamId);
    if (!roundMap.has(roundId)) {
      roundMap.set(roundId, new Map());
    }

    const questionMap = roundMap.get(roundId);
    const nextScore = Number(
      row.total_score
      ?? (Number(row.base_score || 0) + Number(row.bonus_score || 0)),
    );

    const previous = questionMap.get(questionId);
    if (!previous || nextScore > previous.score) {
      questionMap.set(questionId, {
        score: nextScore,
        solveRank: Number(row.solve_rank || 0) || null,
      });
    }
  }

  return map;
}

function getQuestionDurationSeconds(runtime, index) {
  const seconds = Number(runtime?.questionDurations?.[index] || 180);
  return Math.max(0, seconds);
}

function getRuntimeRoundRemainingSeconds(runtime, transitionRemainingSeconds) {
  const totalQuestions = Number(runtime?.questionIds?.length || 0);
  if (totalQuestions <= 0) {
    return 0;
  }

  const currentIndex = Math.max(0, Number(runtime?.currentQuestionIndex || 0));
  const gapSeconds = Math.max(0, Number(runtime?.gapSeconds || 0));
  const transition = Math.max(0, Number(transitionRemainingSeconds || 0));

  if (runtime?.phase === 'question') {
    let futureQuestionsSeconds = 0;
    for (let index = currentIndex + 1; index < totalQuestions; index += 1) {
      futureQuestionsSeconds += getQuestionDurationSeconds(runtime, index);
    }

    const futureGapCount = Math.max(0, totalQuestions - currentIndex - 1);
    return transition + futureQuestionsSeconds + (futureGapCount * gapSeconds);
  }

  if (runtime?.phase === 'gap') {
    let futureQuestionsSeconds = 0;
    for (let index = currentIndex + 1; index < totalQuestions; index += 1) {
      futureQuestionsSeconds += getQuestionDurationSeconds(runtime, index);
    }

    const futureGapCount = Math.max(0, totalQuestions - currentIndex - 2);
    return transition + futureQuestionsSeconds + (futureGapCount * gapSeconds);
  }

  return 0;
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
  const roundCatalog = await getRoundQuestionCatalog();
  const acceptedScores = await getAcceptedSubmissionScores(teamIds);
  const teamRoundScoreMap = buildTeamRoundScoreMap(acceptedScores);

  return entries.map((entry, index) => {
    const roundMap = teamRoundScoreMap.get(entry.teamId) || new Map();
    const perRound = roundCatalog.map((round) => {
      const questionScoreMap = roundMap.get(String(round.id)) || new Map();
      const questions = round.questions.map((question) => {
        const scored = questionScoreMap.get(String(question.id));
        return {
          question_id: question.id,
          position: question.position,
          completed: Boolean(scored),
          score: scored ? Number(scored.score || 0) : null,
          solve_rank: scored?.solveRank ?? null,
        };
      });

      return {
        round_id: round.id,
        round_number: round.round_number,
        questions,
        round_total: questions.reduce((sum, item) => sum + Number(item.score || 0), 0),
      };
    });

    return {
      rank: index + 1,
      team_id: entry.teamId,
      team_name: teamNames.get(entry.teamId) || 'Unknown Team',
      total_score: entry.totalScore,
      per_round: perRound,
    };
  });
}

export async function getCompetitionState(competitionId) {
  const runtime = await getCompetitionRuntimeState();
  const now = Date.now();

  if (runtime?.roundId && ['ACTIVE', 'PAUSED'].includes(String(runtime.status || ''))) {
    const activeQuestionId = runtime.questionIds?.[runtime.currentQuestionIndex] || null;
    const currentQuestion = await getQuestionById(activeQuestionId);
    const transitionRemainingSeconds = runtime.status === 'PAUSED'
      ? Math.max(0, Math.floor((Number(runtime.pausedRemainingMs || 0)) / 1000))
      : Math.max(0, Math.ceil((Number(runtime.nextTransitionAt || 0) - now) / 1000));
    const phase = runtime.phase || 'none';
    const totalQuestions = Array.isArray(runtime.questionIds) ? runtime.questionIds.length : 0;
    const questionTimeRemainingSeconds = phase === 'question' ? transitionRemainingSeconds : 0;
    const roundTimeRemainingSeconds = getRuntimeRoundRemainingSeconds(runtime, transitionRemainingSeconds);
    const nextStartAt = (runtime.status === 'ACTIVE' && phase === 'gap' && Number(runtime.nextTransitionAt || 0) > now)
      ? Number(runtime.nextTransitionAt || 0)
      : null;

    return {
      competition_id: competitionId,
      round: {
        status: runtime.status || 'IDLE',
        phase,
        round_id: runtime.roundId,
        round_number: Number(runtime.roundNumber || 0) || null,
        current_question_index: Number(runtime.currentQuestionIndex || 0),
        current_question_id: activeQuestionId,
        time_remaining_seconds: Math.max(0, questionTimeRemainingSeconds),
        round_time_remaining_seconds: Math.max(0, roundTimeRemainingSeconds),
        next_start_at: nextStartAt,
        total_questions: totalQuestions,
        question_gap_seconds: Math.max(0, Number(runtime.gapSeconds || 0)),
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
    round_time_remaining_seconds: 0,
    next_start_at: null,
    total_questions: 0,
    question_gap_seconds: Math.max(0, Number(env.QUESTION_GAP_SECONDS || 10)),
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
      roundState.round_time_remaining_seconds = remaining;
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
    roundState.round_time_remaining_seconds = timeRemaining;

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

  const { data: allRounds, error: allRoundsError } = await supabaseAdmin
    .from('rounds')
    .select('id, round_number, status')
    .order('round_number', { ascending: true });

  if (allRoundsError) {
    throw new Error(`Failed to load rounds: ${allRoundsError.message}`);
  }

  const rounds = allRounds || [];
  const nextIdleRound = rounds.find((round) => round.status === 'IDLE');
  if (nextIdleRound) {
    roundState.status = 'IDLE';
    roundState.round_id = nextIdleRound.id;
    roundState.round_number = nextIdleRound.round_number;
    roundState.current_question_index = 0;
    roundState.current_question_id = null;
    roundState.time_remaining_seconds = 0;
    roundState.next_start_at = null;

    return {
      competition_id: competitionId,
      round: roundState,
      current_question: null,
      leaderboard: await getLiveLeaderboard(env.COMPETITION_ID),
    };
  }

  const allRoundsEnded = rounds.length > 0 && rounds.every((round) => round.status === 'ENDED');
  if (allRoundsEnded) {
    const finalRound = rounds[rounds.length - 1];
    roundState.status = 'ENDED';
    roundState.round_id = finalRound.id;
    roundState.round_number = finalRound.round_number;
  }

  return {
    competition_id: competitionId,
    round: roundState,
    current_question: null,
    leaderboard: await getLiveLeaderboard(env.COMPETITION_ID),
  };
}
