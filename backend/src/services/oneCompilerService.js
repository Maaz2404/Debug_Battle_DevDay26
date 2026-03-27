import axios from 'axios';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';

const RAPID_HOST = 'onecompiler-apis.p.rapidapi.com';

function isRapidApiUrl(url) {
  return String(url || '').toLowerCase().includes('rapidapi.com');
}

function buildHeaders() {
  if (isRapidApiUrl(env.ONECOMPILER_API_URL)) {
    return {
      'x-rapidapi-key': env.ONECOMPILER_API_KEY,
      'x-rapidapi-host': RAPID_HOST,
      'Content-Type': 'application/json',
    };
  }

  return {
    'X-API-Key': env.ONECOMPILER_API_KEY,
    'Content-Type': 'application/json',
  };
}

function languageToFileName(language) {
  const map = {
    python: 'index.py',
    python3: 'index.py',
    javascript: 'index.js',
    nodejs: 'index.js',
    java: 'Main.java',
    cpp: 'main.cpp',
    c: 'main.c',
  };

  return map[language] || 'main.txt';
}

function normalizeExecutionResult(result, stdinValue = '') {
  const source = result || {};
  return {
    status: source.status || 'failed',
    stdout: source.stdout ?? '',
    stderr: source.stderr ?? null,
    exception: source.exception ?? null,
    error: source.error ?? null,
    executionTime: Number(source.executionTime || 0),
    compilationTime: Number(source.compilationTime || 0),
    memoryUsed: Number(source.memoryUsed || 0),
    stdin: source.stdin ?? stdinValue,
  };
}

export async function runCodeOnOneCompiler({ language, code, stdin = '' }) {
  if (!env.ONECOMPILER_API_URL || !env.ONECOMPILER_API_KEY) {
    throw new HttpError(500, 'OneCompiler is not configured');
  }

  const batchInput = Array.isArray(stdin);

  try {
    console.log('[onecompiler] request', {
      url: env.ONECOMPILER_API_URL,
      language,
      code_length: typeof code === 'string' ? code.length : null,
      stdin_type: batchInput ? 'array' : typeof stdin,
      stdin_count: batchInput ? stdin.length : 1,
      stdin_length: batchInput
        ? stdin.reduce((sum, item) => sum + String(item ?? '').length, 0)
        : (typeof stdin === 'string' ? stdin.length : null),
    });

    const response = await axios.post(
      env.ONECOMPILER_API_URL,
      {
        language,
        stdin,
        files: [
          {
            name: languageToFileName(language),
            content: code,
          },
        ],
      },
      {
        timeout: 15000,
        headers: buildHeaders(),
      },
    );

    // Log summary of response (truncate large bodies)
    const safeData = typeof response.data === 'string'
      ? response.data.slice(0, 2000)
      : JSON.stringify(response.data).slice(0, 2000);
    console.log('[onecompiler] response', { status: response.status, data: safeData });

    if (batchInput) {
      const rows = Array.isArray(response.data)
        ? response.data
        : [response.data];
      return rows.map((row, index) => normalizeExecutionResult(row, stdin[index] ?? ''));
    }

    return normalizeExecutionResult(response.data, stdin);
  } catch (error) {
    console.error('[onecompiler] request error', {
      message: error.message,
      code: error.code || null,
      stack: error.stack ? error.stack.split('\n').slice(0,3).join('\n') : null,
    });
    if (error.code === 'ECONNABORTED') {
      throw new HttpError(504, 'OneCompiler request timed out');
    }

    throw new HttpError(502, 'OneCompiler request failed', error.message);
  }
}
