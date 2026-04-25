import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabasePublishableKey) {
  throw new Error('Missing required environment variable: SUPABASE_PUBLISHABLE_KEY');
}

if (!supabaseSecretKey) {
  throw new Error('Missing required environment variable: SUPABASE_SECRET_KEY');
}

export const env = {
  PORT: Number(process.env.PORT || 3000),
  SUPABASE_URL: requireEnv('SUPABASE_URL'),
  SUPABASE_SECRET_KEY: supabaseSecretKey,
  SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
  COMPETITION_ID: requireEnv('COMPETITION_ID'),
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || '*',
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGIN || '*')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  ADMIN_EMAILS: process.env.ADMIN_EMAILS || '',
  QUESTION_GAP_SECONDS: Number(process.env.QUESTION_GAP_SECONDS || 10),
  LEADERBOARD_BROADCAST_INTERVAL_MS: Number(process.env.LEADERBOARD_BROADCAST_INTERVAL_MS || 1000),
  ONECOMPILER_API_URL: process.env.ONECOMPILER_API_URL,
  ONECOMPILER_API_KEY: process.env.ONECOMPILER_API_KEY,
  REDIS_URL: process.env.REDIS_URL,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
};
