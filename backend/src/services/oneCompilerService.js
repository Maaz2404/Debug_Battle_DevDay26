import axios from 'axios';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';

const RAPID_HOST = 'onecompiler-apis.p.rapidapi.com';

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

export async function runCodeOnOneCompiler({ language, code, stdin = '' }) {
  if (!env.ONECOMPILER_API_URL || !env.ONECOMPILER_API_KEY) {
    throw new HttpError(500, 'OneCompiler is not configured');
  }

  try {
    console.log('[onecompiler] request', {
      url: env.ONECOMPILER_API_URL,
      language,
      code_length: typeof code === 'string' ? code.length : null,
      stdin_length: typeof stdin === 'string' ? stdin.length : null,
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
        headers: {
          'x-rapidapi-key': env.ONECOMPILER_API_KEY,
          'x-rapidapi-host': RAPID_HOST,
          'Content-Type': 'application/json',
        },
      },
    );

    // Log summary of response (truncate large bodies)
    const safeData = typeof response.data === 'string'
      ? response.data.slice(0, 2000)
      : JSON.stringify(response.data).slice(0, 2000);
    console.log('[onecompiler] response', { status: response.status, data: safeData });

    return response.data;
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
