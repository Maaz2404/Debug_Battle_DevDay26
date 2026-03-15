import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/http.js';

function getTokenFromRequest(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice(7);
  }
  return null;
}

export async function requireAuth(req, res, next) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      throw new HttpError(401, 'Missing bearer token');
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      throw new HttpError(401, 'Invalid or expired token');
    }

    const userId = data.user.id;
    const { data: team, error: teamError } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .eq('auth_user_id', userId)
      .maybeSingle();

    if (teamError) {
      throw new HttpError(500, 'Failed to resolve team', teamError.message);
    }

    req.auth = {
      sub: userId,
      user_id: userId,
      team_id: team?.id || null,
      team_name: team?.name || null,
      role: 'participant',
      competition_id: env.COMPETITION_ID,
    };
    req.token = token;
    return next();
  } catch (error) {
    if (error instanceof HttpError) {
      return next(error);
    }
    return next(new HttpError(401, 'Invalid or expired token'));
  }
}
