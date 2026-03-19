import {
  endRoundByNumber,
  pauseRoundByNumber,
  resumeRoundByNumber,
  startRoundByNumber,
} from '../services/adminRoundService.js';
import { ok } from '../utils/http.js';

export async function startRound(req, res, next) {
  try {
    const round = await startRoundByNumber(req.params.roundNumber);
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
