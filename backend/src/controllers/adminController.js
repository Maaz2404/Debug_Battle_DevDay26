import {
  createQuestion,
  createTeam,
  deleteQuestion,
  deleteTeam,
  endRoundByNumber,
  listQuestions,
  listRounds,
  listTeams,
  pauseRoundByNumber,
  resetAllTeamPasswords,
  resetRoundByNumber,
  resumeRoundByNumber,
  startRoundByNumber,
  updateQuestion,
  updateTeam,
} from '../services/adminRoundService.js';
import { ok } from '../utils/http.js';

export async function startRound(req, res, next) {
  try {
    const round = await startRoundByNumber(req.params.roundNumber, {
      startInSeconds: req.body?.startInSeconds,
    });
    return ok(res, { action: 'start', round }, 200);
  } catch (error) {
    return next(error);
  }
}

export async function pauseRound(req, res, next) {
  try {
    const round = await pauseRoundByNumber(req.params.roundNumber);
    return ok(res, { action: 'pause', round }, 200);
  } catch (error) {
    return next(error);
  }
}

export async function resumeRound(req, res, next) {
  try {
    const round = await resumeRoundByNumber(req.params.roundNumber);
    return ok(res, { action: 'resume', round }, 200);
  } catch (error) {
    return next(error);
  }
}

export async function endRound(req, res, next) {
  try {
    const round = await endRoundByNumber(req.params.roundNumber);
    return ok(res, { action: 'end', round }, 200);
  } catch (error) {
    return next(error);
  }
}

export async function getRounds(req, res, next) {
  try {
    const rounds = await listRounds();
    return ok(res, { rounds }, 200);
  } catch (error) {
    return next(error);
  }
}

export async function resetRound(req, res, next) {
  try {
    const round = await resetRoundByNumber(req.params.roundNumber);
    return ok(res, { action: 'reset', round }, 200);
  } catch (error) {
    return next(error);
  }
}

export async function getTeams(req, res, next) {
  try {
    const teams = await listTeams();
    return ok(res, { teams }, 200);
  } catch (error) {
    return next(error);
  }
}

export async function addTeam(req, res, next) {
  try {
    const team = await createTeam(req.body || {});
    return ok(res, { team }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function editTeam(req, res, next) {
  try {
    const team = await updateTeam(req.params.teamId, req.body || {});
    return ok(res, { team }, 200);
  } catch (error) {
    return next(error);
  }
}

export async function removeTeam(req, res, next) {
  try {
    const result = await deleteTeam(req.params.teamId);
    return ok(res, result, 200);
  } catch (error) {
    return next(error);
  }
}

export async function resetTeamsPassword(req, res, next) {
  try {
    const result = await resetAllTeamPasswords(req.body || {});
    return ok(res, { action: 'reset_teams_password', ...result }, 200);
  } catch (error) {
    return next(error);
  }
}

export async function getQuestions(req, res, next) {
  try {
    const questions = await listQuestions(req.query.roundNumber);
    return ok(res, { questions }, 200);
  } catch (error) {
    return next(error);
  }
}

export async function addQuestion(req, res, next) {
  try {
    const question = await createQuestion(req.body || {});
    return ok(res, { question }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function editQuestion(req, res, next) {
  try {
    const question = await updateQuestion(req.params.questionId, req.body || {});
    return ok(res, { question }, 200);
  } catch (error) {
    return next(error);
  }
}

export async function removeQuestion(req, res, next) {
  try {
    const result = await deleteQuestion(req.params.questionId);
    return ok(res, result, 200);
  } catch (error) {
    return next(error);
  }
}
