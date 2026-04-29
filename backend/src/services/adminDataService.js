import { supabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../utils/http.js';

function cleanString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function buildSyntheticTeamEmail(teamName) {
  const slug = cleanString(teamName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'team';
  return `${slug}-${Date.now()}@debugrelay.local`;
}

function assertPasswordPolicy(password) {
  if (!password) {
    throw new HttpError(400, 'password is required');
  }

  if (password.length < 6) {
    throw new HttpError(400, 'password must be at least 6 characters');
  }
}

function stripStarterCodeBlocks(description) {
  const pattern = /```(?:javascript|js|python|py|cpp|c\+\+)\s*[\s\S]*?```/gi;
  return String(description || '')
    .replace(pattern, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildDescriptionWithStarterCode(description, codes) {
  const base = stripStarterCodeBlocks(description || '');
  const blocks = [];

  if (codes.javascript?.trim()) {
    blocks.push(["```javascript", codes.javascript.trimEnd(), "```"].join("\n"));
  }
  if (codes.python?.trim()) {
    blocks.push(["```python", codes.python.trimEnd(), "```"].join("\n"));
  }
  if (codes.cpp?.trim()) {
    blocks.push(["```cpp", codes.cpp.trimEnd(), "```"].join("\n"));
  }

  if (blocks.length === 0) {
    return base;
  }

  return [base, 'Starter code:', ...blocks].filter(Boolean).join("\n\n");
}

function pickCanonicalRow(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const jsRow = rows.find((row) => String(row.language || '').toLowerCase() === 'javascript');
  return jsRow || rows[0];
}

function mergeQuestionRows(rows) {
  const canonical = pickCanonicalRow(rows);
  if (!canonical) {
    return null;
  }

  const codes = {
    javascript: '',
    python: '',
    cpp: '',
  };

  for (const row of rows) {
    const lang = String(row.language || '').toLowerCase();
    if (lang === 'javascript') {
      codes.javascript = row.code || '';
    } else if (lang === 'python') {
      codes.python = row.code || '';
    } else if (lang === 'cpp') {
      codes.cpp = row.code || '';
    }
  }

  const canonicalLang = String(canonical.language || 'javascript').toLowerCase();
  const code = canonicalLang === 'python'
    ? codes.python
    : canonicalLang === 'cpp'
      ? codes.cpp
      : codes.javascript;

  return {
    ...canonical,
    description: buildDescriptionWithStarterCode(canonical.description || '', codes),
    code,
    language: canonicalLang || 'javascript',
  };
}

function normalizeQuestionTestCases(testCases) {
  if (!Array.isArray(testCases)) {
    throw new HttpError(400, 'test_cases must be an array');
  }

  return testCases.map((row, index) => {
    const input = cleanString(row?.input);
    const expectedOutput = cleanString(row?.expected_output);
    if (!input && !expectedOutput) {
      throw new HttpError(400, `test_cases[${index}] must include input or expected_output`);
    }
    return {
      input,
      expected_output: expectedOutput,
    };
  });
}

async function getRoundByNumber(roundNumber) {
  const parsed = Number(roundNumber);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, 'round_number must be a positive integer');
  }

  const { data, error } = await supabaseAdmin
    .from('rounds')
    .select('id, round_number')
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

export async function listTeams() {
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id, name, auth_user_id, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    throw new HttpError(500, 'Failed to read teams', error.message);
  }

  return data || [];
}

export async function createTeam(payload = {}) {
  const name = cleanString(payload.name);
  const password = cleanString(payload.password);

  if (!name) {
    throw new HttpError(400, 'name is required');
  }

  assertPasswordPolicy(password);

  const syntheticEmail = buildSyntheticTeamEmail(name);
  const { data: authCreated, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
    user_metadata: {
      team_name: name,
    },
  });

  if (authError || !authCreated?.user?.id) {
    throw new HttpError(500, 'Failed to create auth user for team', authError?.message || null);
  }

  const authUserId = authCreated.user.id;

  const { data, error } = await supabaseAdmin
    .from('teams')
    .insert({
      name,
      auth_user_id: authUserId,
      password,
    })
    .select('id, name, auth_user_id, created_at')
    .single();

  if (error) {
    await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => undefined);
    if (error.code === '23505' || error.message?.toLowerCase().includes('teams_name_key')) {
      throw new HttpError(409, 'Team name must be unique');
    }
    throw new HttpError(500, 'Failed to create team', error.message);
  }

  return data;
}

export async function updateTeam(teamId, payload = {}) {
  const id = cleanString(teamId);
  if (!id) {
    throw new HttpError(400, 'teamId is required');
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('teams')
    .select('id, auth_user_id')
    .eq('id', id)
    .maybeSingle();

  if (existingError) {
    throw new HttpError(500, 'Failed to read team', existingError.message);
  }

  if (!existing) {
    throw new HttpError(404, 'Team not found');
  }

  if (!existing.auth_user_id) {
    throw new HttpError(409, 'Team is missing linked auth user');
  }

  const fields = {};
  let didPasswordUpdate = false;
  if (payload.name !== undefined) {
    const name = cleanString(payload.name);
    if (!name) {
      throw new HttpError(400, 'name cannot be empty');
    }
    fields.name = name;
  }

  if (payload.password !== undefined) {
    const password = cleanString(payload.password);
    assertPasswordPolicy(password);

    const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(existing.auth_user_id, {
      password,
    });
    if (passwordError) {
      throw new HttpError(500, 'Failed to update team password', passwordError.message);
    }

    fields.password = password;
    didPasswordUpdate = true;
  }

  if (Object.keys(fields).length === 0 && !didPasswordUpdate) {
    throw new HttpError(400, 'At least one field is required');
  }

  if (Object.keys(fields).length === 0 && didPasswordUpdate) {
    const { data: updatedTeam, error: updatedTeamError } = await supabaseAdmin
      .from('teams')
      .select('id, name, auth_user_id, created_at')
      .eq('id', existing.id)
      .maybeSingle();

    if (updatedTeamError) {
      throw new HttpError(500, 'Failed to read team after password update', updatedTeamError.message);
    }

    if (!updatedTeam) {
      throw new HttpError(404, 'Team not found');
    }

    return updatedTeam;
  }

  const { data, error } = await supabaseAdmin
    .from('teams')
    .update(fields)
    .eq('id', id)
    .select('id, name, auth_user_id, created_at')
    .maybeSingle();

  if (error) {
    if (error.code === '23505' || error.message?.toLowerCase().includes('teams_name_key')) {
      throw new HttpError(409, 'Team name must be unique');
    }
    throw new HttpError(500, 'Failed to update team', error.message);
  }

  if (!data) {
    throw new HttpError(404, 'Team not found');
  }

  return data;
}

export async function deleteTeam(teamId) {
  const id = cleanString(teamId);
  if (!id) {
    throw new HttpError(400, 'teamId is required');
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('teams')
    .select('id, auth_user_id')
    .eq('id', id)
    .maybeSingle();

  if (existingError) {
    throw new HttpError(500, 'Failed to read team', existingError.message);
  }

  if (!existing) {
    throw new HttpError(404, 'Team not found');
  }

  if (!existing.auth_user_id) {
    throw new HttpError(409, 'Team is missing linked auth user');
  }

  const { data, error } = await supabaseAdmin
    .from('teams')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.code === '23503') {
      throw new HttpError(409, 'Cannot delete team because related records exist');
    }
    throw new HttpError(500, 'Failed to delete team', error.message);
  }

  if (!data) {
    throw new HttpError(404, 'Team not found');
  }

  await supabaseAdmin.auth.admin.deleteUser(existing.auth_user_id).catch(() => undefined);

  return { id };
}

export async function resetAllTeamPasswords(payload = {}) {
  const password = cleanString(payload.password);
  assertPasswordPolicy(password);

  const { data: teams, error } = await supabaseAdmin
    .from('teams')
    .select('id, auth_user_id')
    .not('auth_user_id', 'is', null);

  if (error) {
    throw new HttpError(500, 'Failed to read teams for password reset', error.message);
  }

  let updated = 0;
  const failedTeamIds = [];
  for (const team of teams || []) {
    try {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(String(team.auth_user_id), {
        password,
      });

      if (updateError) {
        failedTeamIds.push(String(team.id));
        continue;
      }

      await supabaseAdmin
        .from('teams')
        .update({ password })
        .eq('id', String(team.id));

      updated += 1;
    } catch (_) {
      failedTeamIds.push(String(team.id));
    }
  }

  return {
    total: Array.isArray(teams) ? teams.length : 0,
    updated,
    failed: failedTeamIds.length,
    failed_team_ids: failedTeamIds,
  };
}

export async function listQuestions(roundNumber) {
  const { data: rounds, error: roundsError } = await supabaseAdmin
    .from('rounds')
    .select('id, round_number');

  if (roundsError) {
    throw new HttpError(500, 'Failed to read rounds', roundsError.message);
  }

  const roundIdToNumber = new Map();
  for (const row of rounds || []) {
    roundIdToNumber.set(String(row.id), Number(row.round_number || 0));
  }

  let query = supabaseAdmin
    .from('questions')
    .select('id, round_id, position, title, description, code, language, time_limit_seconds, base_score, test_cases')
    .order('round_id', { ascending: true })
    .order('position', { ascending: true });

  if (roundNumber !== undefined && roundNumber !== null && String(roundNumber).trim() !== '') {
    const round = await getRoundByNumber(roundNumber);
    query = query.eq('round_id', round.id);
  }

  const { data, error } = await query;

  if (error) {
    throw new HttpError(500, 'Failed to read questions', error.message);
  }

  const byRoundPosition = new Map();
  for (const row of data || []) {
    const key = `${row.round_id || ''}:${Number(row.position || 0)}`;
    if (!byRoundPosition.has(key)) {
      byRoundPosition.set(key, []);
    }
    byRoundPosition.get(key).push(row);
  }

  const merged = [];
  for (const rows of byRoundPosition.values()) {
    const mergedRow = mergeQuestionRows(rows);
    if (mergedRow) {
      merged.push({
        ...mergedRow,
        round_number: roundIdToNumber.get(String(mergedRow.round_id)) || null,
      });
    }
  }

  merged.sort((a, b) => {
    const ra = Number(a.round_number || 0);
    const rb = Number(b.round_number || 0);
    if (ra !== rb) return ra - rb;
    return Number(a.position || 0) - Number(b.position || 0);
  });

  return merged;
}

export async function createQuestion(payload = {}) {
  const round = await getRoundByNumber(payload.round_number);

  const position = Number(payload.position);
  if (!Number.isInteger(position) || position < 0) {
    throw new HttpError(400, 'position must be a non-negative integer');
  }

  const title = cleanString(payload.title);
  const description = cleanString(payload.description);
  const code = cleanString(payload.code);
  const language = cleanString(payload.language || 'javascript');
  const timeLimitSeconds = Number(payload.time_limit_seconds || 150);
  const baseScore = Number(payload.base_score || 100);
  const testCases = normalizeQuestionTestCases(payload.test_cases || []);

  if (!title) {
    throw new HttpError(400, 'title is required');
  }

  if (!description) {
    throw new HttpError(400, 'description is required');
  }

  if (!code) {
    throw new HttpError(400, 'code is required');
  }

  const { data, error } = await supabaseAdmin
    .from('questions')
    .insert({
      round_id: round.id,
      position,
      title,
      description,
      code,
      language,
      time_limit_seconds: Number.isFinite(timeLimitSeconds) ? timeLimitSeconds : 150,
      base_score: Number.isFinite(baseScore) ? baseScore : 100,
      test_cases: testCases,
    })
    .select('id, round_id, position, title, description, code, language, time_limit_seconds, base_score, test_cases')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'Question position already exists in this round');
    }
    throw new HttpError(500, 'Failed to create question', error.message);
  }

  return {
    ...data,
    round_number: round.round_number,
  };
}

export async function updateQuestion(questionId, payload = {}) {
  const id = cleanString(questionId);
  if (!id) {
    throw new HttpError(400, 'questionId is required');
  }

  const fields = {};
  let roundNumber = null;

  if (payload.round_number !== undefined) {
    const round = await getRoundByNumber(payload.round_number);
    fields.round_id = round.id;
    roundNumber = round.round_number;
  }

  if (payload.position !== undefined) {
    const position = Number(payload.position);
    if (!Number.isInteger(position) || position < 0) {
      throw new HttpError(400, 'position must be a non-negative integer');
    }
    fields.position = position;
  }

  if (payload.title !== undefined) {
    const title = cleanString(payload.title);
    if (!title) {
      throw new HttpError(400, 'title cannot be empty');
    }
    fields.title = title;
  }

  if (payload.description !== undefined) {
    const description = cleanString(payload.description);
    if (!description) {
      throw new HttpError(400, 'description cannot be empty');
    }
    fields.description = description;
  }

  if (payload.code !== undefined) {
    const code = cleanString(payload.code);
    if (!code) {
      throw new HttpError(400, 'code cannot be empty');
    }
    fields.code = code;
  }

  if (payload.language !== undefined) {
    const language = cleanString(payload.language);
    if (!language) {
      throw new HttpError(400, 'language cannot be empty');
    }
    fields.language = language;
  }

  if (payload.time_limit_seconds !== undefined) {
    const timeLimitSeconds = Number(payload.time_limit_seconds);
    if (!Number.isFinite(timeLimitSeconds) || timeLimitSeconds <= 0) {
      throw new HttpError(400, 'time_limit_seconds must be a positive number');
    }
    fields.time_limit_seconds = timeLimitSeconds;
  }

  if (payload.base_score !== undefined) {
    const baseScore = Number(payload.base_score);
    if (!Number.isFinite(baseScore) || baseScore < 0) {
      throw new HttpError(400, 'base_score must be zero or greater');
    }
    fields.base_score = baseScore;
  }

  if (payload.test_cases !== undefined) {
    fields.test_cases = normalizeQuestionTestCases(payload.test_cases);
  }

  if (Object.keys(fields).length === 0) {
    throw new HttpError(400, 'At least one field is required');
  }

  const { data, error } = await supabaseAdmin
    .from('questions')
    .update(fields)
    .eq('id', id)
    .select('id, round_id, position, title, description, code, language, time_limit_seconds, base_score, test_cases')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'Question position already exists in this round');
    }
    throw new HttpError(500, 'Failed to update question', error.message);
  }

  if (!data) {
    throw new HttpError(404, 'Question not found');
  }

  if (roundNumber === null) {
    const { data: round } = await supabaseAdmin
      .from('rounds')
      .select('round_number')
      .eq('id', data.round_id)
      .maybeSingle();
    roundNumber = Number(round?.round_number || 0) || null;
  }

  return {
    ...data,
    round_number: roundNumber,
  };
}

export async function deleteQuestion(questionId) {
  const id = cleanString(questionId);
  if (!id) {
    throw new HttpError(400, 'questionId is required');
  }

  const { data, error } = await supabaseAdmin
    .from('questions')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.code === '23503') {
      throw new HttpError(409, 'Cannot delete question because related records exist');
    }
    throw new HttpError(500, 'Failed to delete question', error.message);
  }

  if (!data) {
    throw new HttpError(404, 'Question not found');
  }

  return { id };
}