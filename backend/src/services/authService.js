import { supabase, supabaseAdmin } from '../config/supabase.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';

function validateLoginInput(payload) {
  const { team_name, password } = payload;

  if (!team_name || typeof team_name !== 'string') {
    throw new HttpError(400, 'team_name is required');
  }

  if (!password || typeof password !== 'string') {
    throw new HttpError(400, 'password is required');
  }

  return {
    teamName: team_name.trim(),
    password,
  };
}

async function findTeamByName(teamName) {
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id, name, auth_user_id, password')
    .eq('name', teamName)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, 'Failed to read team', error.message);
  }

  if (!data) {
    throw new HttpError(401, 'Invalid credentials');
  }

  if (!data.auth_user_id) {
    throw new HttpError(409, 'Team is not linked to an auth user');
  }

  if (!data.password) {
    throw new HttpError(409, 'Team password is not configured');
  }

  return data;
}

async function getTeamAuthEmail(authUserId) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(authUserId);
  if (error || !data?.user?.email) {
    throw new HttpError(500, 'Failed to resolve team auth account', error?.message || null);
  }

  return data.user.email;
}

export async function loginParticipant(payload) {
  const { teamName, password } = validateLoginInput(payload);
  const team = await findTeamByName(teamName);
  const email = await getTeamAuthEmail(team.auth_user_id);

  if (String(password) !== String(team.password)) {
    throw new HttpError(401, 'Invalid credentials');
  }

  let signInResponse = await supabase.auth.signInWithPassword({ email, password });
  if (signInResponse.error || !signInResponse.data?.session?.access_token) {
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(team.auth_user_id, {
      password,
    });

    if (updateError) {
      throw new HttpError(500, 'Failed to sync auth password', updateError.message);
    }

    signInResponse = await supabase.auth.signInWithPassword({ email, password });
    if (signInResponse.error || !signInResponse.data?.session?.access_token) {
      throw new HttpError(401, 'Invalid credentials');
    }
  }

  const { session } = signInResponse.data;

  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: 'Bearer',
    expires_in: session.expires_in,
    session_scope: 'team',
    team: {
      id: team.id,
      name: team.name,
    },
  };
}

export async function logoutParticipant(_token) {
  // TODO: Add persistent token revocation store if strict server-side invalidation is required.
  return { success: true };
}

export async function loginAdmin(payload) {
  const { email, password } = payload || {};

  if (!email || typeof email !== 'string') {
    throw new HttpError(400, 'email is required');
  }

  if (!password || typeof password !== 'string') {
    throw new HttpError(400, 'password is required');
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    throw new HttpError(401, 'Invalid admin credentials');
  }

  const user = data.user || null;
  const normalizedEmail = String(user?.email || '').trim().toLowerCase();
  const allowedAdmins = env.ADMIN_EMAILS
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const metadataRole = String(
    user?.app_metadata?.role || user?.user_metadata?.role || '',
  ).trim().toLowerCase();

  const isAdmin = allowedAdmins.includes(normalizedEmail) || metadataRole === 'admin';
  if (!isAdmin) {
    throw new HttpError(403, 'Admin role required');
  }

  const { session } = data;

  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: 'Bearer',
    expires_in: session.expires_in,
    session_scope: 'admin',
    user: data.user || null,
  };
}
