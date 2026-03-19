import { loginParticipant, logoutParticipant } from '../services/authService.js';
import { disconnectUserSockets } from '../socket/registry.js';
import { ok } from '../utils/http.js';
import { loginAdmin } from '../services/authService.js';

export async function login(req, res, next) {
  try {
    const result = await loginParticipant(req.body || {});
    return ok(res, result, 200);
  } catch (error) {
    return next(error);
  }
}

export async function logout(req, res, next) {
  try {
    const result = await logoutParticipant(req.token);
    const principalId = req.auth.user_id || req.auth.team_id;
    const disconnected = disconnectUserSockets(principalId, 'logout');
    return ok(res, { ...result, disconnected_sockets: disconnected }, 200);
  } catch (error) {
    return next(error);
  }
}

export async function loginAdminController(req, res, next) {
  try {
    const result = await loginAdmin(req.body || {});
    return ok(res, result, 200);
  } catch (error) {
    return next(error);
  }
}
