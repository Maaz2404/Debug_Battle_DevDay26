import { supabaseAdmin } from '../config/supabase.js';

export async function getCompetitionState(competitionId) {
  const roundState = {
    status: 'IDLE',
    current_question_index: 0,
    time_remaining_seconds: 0,
    round_id: null,
    round_number: null,
  };

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
  }

  return {
    competition_id: competitionId,
    round: roundState,
    leaderboard: [],
  };
}
