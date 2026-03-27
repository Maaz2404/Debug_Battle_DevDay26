import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/http.js';

function toScorePayload(row) {
  const totalScore = Number(
    row.total_score
    ?? (Number(row.base_score || 0) + Number(row.bonus_score || 0)),
  );

  return {
    total_score: Number.isFinite(totalScore) ? totalScore : 0,
    base_score: Number(row.base_score || 0),
    bonus_score: Number(row.bonus_score || 0),
    solve_rank: Number(row.solve_rank || 0) || null,
  };
}

export async function getSubmissionStateById(submissionId, auth) {
  if (!submissionId || typeof submissionId !== 'string') {
    throw new HttpError(400, 'submissionId is required');
  }

  const { data, error } = await supabaseAdmin
    .from('submissions')
    .select('id, team_id, question_id, round_id, job_type, status, result, total_score, base_score, bonus_score, solve_rank')
    .eq('id', submissionId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, 'Failed to load submission status', error.message);
  }

  if (!data) {
    throw new HttpError(404, 'Submission not found');
  }

  const isAdmin = auth?.role === 'admin';
  if (!isAdmin && data.team_id !== auth?.team_id) {
    throw new HttpError(403, 'You do not have access to this submission');
  }

  return {
    submission_id: data.id,
    question_id: data.question_id,
    round_id: data.round_id,
    job_type: data.job_type,
    status: data.status,
    result: data.result || null,
    score: toScorePayload(data),
  };
}