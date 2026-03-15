import { supabase, supabaseAdmin } from '../config/supabase.js';
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
    .select('id, name, auth_user_id')
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

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    throw new HttpError(401, 'Invalid credentials');
  }

  const { session } = data;

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
