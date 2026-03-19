import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/http.js';

function parseRoundNumber(roundNumber) {
  const parsed = Number(roundNumber);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, 'roundNumber must be a positive integer');
  }
  return parsed;
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

async function updateRound(roundId, fields) {
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

export async function startRoundByNumber(roundNumber) {
  const round = await getRoundByNumber(roundNumber);
  if (round.status !== 'IDLE') {
    throw new HttpError(409, `Cannot start round in status ${round.status}`);
  }

  return updateRound(round.id, {
    status: 'ACTIVE',
    started_at: new Date().toISOString(),
    ended_at: null,
  });
}

export async function pauseRoundByNumber(roundNumber) {
  const round = await getRoundByNumber(roundNumber);
  if (round.status !== 'ACTIVE') {
    throw new HttpError(409, `Cannot pause round in status ${round.status}`);
  }

  return updateRound(round.id, {
    status: 'PAUSED',
  });
}

export async function resumeRoundByNumber(roundNumber) {
  const round = await getRoundByNumber(roundNumber);
  if (round.status !== 'PAUSED') {
    throw new HttpError(409, `Cannot resume round in status ${round.status}`);
  }

  return updateRound(round.id, {
    status: 'ACTIVE',
  });
}

export async function endRoundByNumber(roundNumber) {
  const round = await getRoundByNumber(roundNumber);
  if (!['ACTIVE', 'PAUSED'].includes(round.status)) {
    throw new HttpError(409, `Cannot end round in status ${round.status}`);
  }

  return updateRound(round.id, {
    status: 'ENDED',
    ended_at: new Date().toISOString(),
  });
}
