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

function isAdminUser(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  const adminEmails = env.ADMIN_EMAILS
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const metadataRole = String(
    user?.app_metadata?.role || user?.user_metadata?.role || '',
  ).trim().toLowerCase();

  return adminEmails.includes(email) || metadataRole === 'admin';
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

    const user = data.user;
    const userId = user.id;
    const { data: team, error: teamError } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .eq('auth_user_id', userId)
      .maybeSingle();

    if (teamError) {
      throw new HttpError(500, 'Failed to resolve team', teamError.message);
    }

    const role = isAdminUser(user) ? 'admin' : 'participant';

    req.auth = {
      sub: userId,
      user_id: userId,
      team_id: team?.id || null,
      team_name: team?.name || null,
      role,
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
