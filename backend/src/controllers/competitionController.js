import { env } from '../config/env.js';
import { getCompetitionState } from '../services/competitionStateService.js';
import { HttpError, ok } from '../utils/http.js';

export async function getState(req, res, next) {
  try {
    const compId = req.params.compId;
    if (compId !== env.COMPETITION_ID) {
      throw new HttpError(404, 'Competition not found');
    }

    const state = await getCompetitionState(compId);
    return ok(res, state, 200);
  } catch (error) {
    return next(error);
  }
}
