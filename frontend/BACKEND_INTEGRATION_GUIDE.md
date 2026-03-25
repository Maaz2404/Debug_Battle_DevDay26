# Frontend-Backend Integration Guide

This guide is for the frontend team to connect the Next.js app to the current backend implementation.

It is based on the backend code currently present in this repository, not only on the PRD.

## 1. Current Reality Check

- Frontend currently runs in demo/mock mode via `lib/api/client.ts`.
- Backend API is already available under `/api/*`.
- Run and Submit endpoints are asynchronous (return `202` quickly).
- Final run/submission results arrive through Socket.IO events.
- Backend responses are wrapped in `{ data: ... }` for success and `{ error: { message, details } }` for failure.

## 2. Backend Base URL and Routing

Backend server mounts routes at:

- Base: `http://localhost:3000`
- API prefix: `/api`

So frontend should call:

- `http://localhost:3000/api/auth/login`
- `http://localhost:3000/api/run`
- etc.

Recommended frontend env values:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
NEXT_PUBLIC_COMPETITION_ID=123
```

## 3. Where to Define and Import Endpoints From

Create a dedicated endpoint/constants module in frontend:

- Suggested file: `frontend/lib/api/endpoints.ts`

Recommended structure:

```ts
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL!;

export const endpoints = {
  auth: {
    login: `${API_BASE_URL}/auth/login`,
    adminLogin: `${API_BASE_URL}/auth/admin/login`,
    logout: `${API_BASE_URL}/auth/logout`,
  },
  competition: {
    state: (compId: string) => `${API_BASE_URL}/competition/${compId}/state`,
  },
  participant: {
    run: `${API_BASE_URL}/run`,
    submit: `${API_BASE_URL}/submit`,
  },
  admin: {
    startRound: (roundNumber: number) => `${API_BASE_URL}/admin/round/${roundNumber}/start`,
    pauseRound: (roundNumber: number) => `${API_BASE_URL}/admin/round/${roundNumber}/pause`,
    resumeRound: (roundNumber: number) => `${API_BASE_URL}/admin/round/${roundNumber}/resume`,
    endRound: (roundNumber: number) => `${API_BASE_URL}/admin/round/${roundNumber}/end`,
  },
  infra: {
    redisHealth: `${API_BASE_URL}/infra/redis`,
  },
} as const;
```

Then import this in your API client implementation and avoid hardcoding URLs in page components.

## 4. Auth Model and Session Tokens

Backend uses Supabase-authenticated bearer tokens.

Participant login currently expects:

```json
{
  "team_name": "Alpha Team",
  "password": "team-password"
}
```

Participant login success returns:

```json
{
  "data": {
    "access_token": "...",
    "refresh_token": "...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "session_scope": "team",
    "team": {
      "id": "uuid",
      "name": "Alpha Team"
    }
  }
}
```

Admin login expects:

```json
{
  "email": "admin@ex.com",
  "password": "admin-password"
}
```

Admin login success returns:

```json
{
  "data": {
    "access_token": "...",
    "refresh_token": "...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "session_scope": "admin",
    "user": { "id": "...", "email": "admin@ex.com" }
  }
}
```

Use this header for protected endpoints:

```http
Authorization: Bearer <access_token>
```

## 5. Endpoint-by-Endpoint Contract

All success responses are wrapped in `data`.

All errors are:

```json
{
  "error": {
    "message": "...",
    "details": null
  }
}
```

### 5.1 POST /api/auth/login

Purpose:
- Participant authentication.

Request body:

```json
{
  "team_name": "Alpha Team",
  "password": "secret"
}
```

Success:
- `200 OK`
- Body shown in section 4.

Common failures:
- `400` missing fields.
- `401` invalid credentials.
- `409` team not linked to auth user.

### 5.2 POST /api/auth/admin/login

Purpose:
- Admin authentication.

Request body:

```json
{
  "email": "admin@ex.com",
  "password": "secret"
}
```

Success:
- `200 OK`
- Returns admin-scoped token payload.

Common failures:
- `400` missing fields.
- `401` invalid credentials.
- `403` user authenticated but not admin.

### 5.3 POST /api/auth/logout

Purpose:
- Logical logout + socket disconnection.

Headers:
- `Authorization: Bearer <token>`

Request body:
- none.

Success:

```json
{
  "data": {
    "success": true,
    "disconnected_sockets": 1
  }
}
```

### 5.4 GET /api/competition/:compId/state

Purpose:
- Snapshot for initial load and reconnection.

Headers:
- `Authorization: Bearer <token>`

Path param:
- `compId` must match backend env `COMPETITION_ID`.

Success (`200`):

```json
{
  "data": {
    "competition_id": "123",
    "round": {
      "status": "ACTIVE",
      "phase": "question",
      "round_id": "uuid",
      "round_number": 1,
      "current_question_index": 0,
      "current_question_id": "uuid",
      "time_remaining_seconds": 132
    },
    "leaderboard": [
      {
        "rank": 1,
        "team_id": "uuid",
        "team_name": "Alpha",
        "total_score": 220
      }
    ]
  }
}
```

Common failures:
- `401` missing/invalid token.
- `404` compId mismatch.

### 5.5 POST /api/run

Purpose:
- Queue a run job (does not score).

Headers:
- `Authorization: Bearer <token>`

Request body:

```json
{
  "code": "print('hello')",
  "language": "python",
  "questionId": "question-uuid",
  "roundId": "round-uuid"
}
```

Immediate response:

```json
{
  "data": {
    "submission_id": "submission-uuid",
    "status": "PENDING"
  }
}
```

Status code:
- `202 Accepted`

Final result delivery:
- Socket event `run:result` to the submitting user sockets.

Common failures:
- `400` invalid payload.
- `409` round inactive, gap interval, wrong question.
- `409` authenticated user not linked to a team.

### 5.6 POST /api/submit

Purpose:
- Queue official submission scoring job.

Headers:
- `Authorization: Bearer <token>`

Request body:

```json
{
  "code": "print('hello')",
  "language": "python",
  "questionId": "question-uuid",
  "roundId": "round-uuid"
}
```

Immediate response:

```json
{
  "data": {
    "submission_id": "submission-uuid",
    "status": "PENDING"
  }
}
```

Status code:
- `202 Accepted`

Final result delivery:
- Socket event `submission:result`.

Common failures:
- `403` submit attempted before passing run (`runpass` missing).
- `429` duplicate submission lock active.
- `409` round inactive/gap/wrong active question.

### 5.7 POST /api/admin/round/:roundNumber/start

Purpose:
- Start specific round.

Headers:
- `Authorization: Bearer <admin-token>`

Path param:
- `roundNumber` integer (1,2,3...).

Success:

```json
{
  "data": {
    "action": "start",
    "round": {
      "id": "round-uuid",
      "round_number": 1,
      "status": "ACTIVE",
      "started_at": "ISO",
      "ended_at": null,
      "duration_seconds": 1800
    }
  }
}
```

### 5.8 POST /api/admin/round/:roundNumber/pause

Success:

```json
{
  "data": {
    "action": "pause",
    "round": { "id": "...", "round_number": 1, "status": "PAUSED" }
  }
}
```

### 5.9 POST /api/admin/round/:roundNumber/resume

Success:

```json
{
  "data": {
    "action": "resume",
    "round": { "id": "...", "round_number": 1, "status": "ACTIVE" }
  }
}
```

### 5.10 POST /api/admin/round/:roundNumber/end

Success:

```json
{
  "data": {
    "action": "end",
    "round": { "id": "...", "round_number": 1, "status": "ENDED" }
  }
}
```

Admin endpoint common failures:
- `401` invalid/missing token.
- `403` not admin.
- `409` invalid state transition.

### 5.11 GET /api/infra/redis

Purpose:
- Optional health check for tooling/admin.

Headers:
- `Authorization: Bearer <token>`

Success:

```json
{
  "data": {
    "redis": "PONG",
    "status": "ok"
  }
}
```

## 6. Socket.IO Integration (Detailed)

## 6.1 Install client dependency

```bash
npm i socket.io-client
```

## 6.2 Socket URL and auth token

Use:
- URL: `NEXT_PUBLIC_SOCKET_URL` (example `http://localhost:3000`)
- Auth: `auth: { token: accessToken }`

Backend also accepts `Authorization: Bearer <token>` in handshake headers, but using `auth.token` is cleaner.

## 6.3 Server-side socket auth behavior

On connect, backend:
- validates Supabase token,
- resolves team using `teams.auth_user_id`,
- joins room `comp:${COMPETITION_ID}`,
- emits `competition:state` immediately.

Therefore frontend should:
- connect only after login token exists,
- handle initial `competition:state` payload to hydrate store,
- on reconnect, also call `GET /competition/:id/state` as a fallback sync.

## 6.4 Required socket event handlers

Handle these events:

1. `competition:state`
- Initial snapshot or re-sync.

2. `round:start`
- Contains round info and first question payload.

3. `question:next`
- New active question payload.

4. `round:paused`
- Pause status + remaining time.

5. `round:resumed`
- Resume status + remaining time.

6. `round:end`
- Round end signal.

7. `run:result`
- Final run verdict and testcase details for current user.

8. `submission:result`
- Final submit verdict and score info for current user.

9. `leaderboard:update`
- Ranking updates (already throttled server-side).

10. `session:ended`
- Emitted on logout/disconnect-all by backend.

## 6.5 Example client socket module

```ts
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function connectCompetitionSocket(token: string) {
  if (socket) return socket;

  socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
    transports: ["websocket", "polling"],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  socket.on("connect", () => {
    // set connectionStatus = connected
  });

  socket.on("disconnect", () => {
    // set connectionStatus = disconnected
  });

  socket.on("competition:state", (payload) => {
    // normalize + store update
  });

  socket.on("run:result", (payload) => {
    // resolve pending run in UI
  });

  socket.on("submission:result", (payload) => {
    // resolve pending submit in UI
  });

  socket.on("leaderboard:update", (payload) => {
    // update leaderboard list
  });

  socket.on("session:ended", () => {
    // clear local session + redirect to login
  });

  return socket;
}

export function disconnectCompetitionSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
```

## 7. Data Mapping Layer You Must Add

Your existing frontend types are not 1:1 with backend payloads.

Add a mapper module, suggested file:
- `frontend/lib/api/mappers.ts`

Required mappings:

1. Backend competition state -> frontend `CompetitionState`
- Convert `time_remaining_seconds` into absolute timestamps for `roundEndsAt` and/or `questionEndsAt`.
- Convert index style:
  - backend `current_question_index` is 0-based.
  - frontend currently displays `questionIndex` as 1-based in UI.

2. Backend leaderboard entries -> frontend `LeaderboardEntry`
- backend has `team_id`, `team_name`, `total_score`.
- frontend expects round score breakdown `scores.r1/r2/r3`; backend does not always send it in same shape.
- Choose one:
  - show zeros until round-wise data is available, or
  - extend frontend type to support optional round scores.

3. Backend question payload -> frontend `Question`
- backend question does not include `starterCode`, `sampleInput`, `sampleOutput`, `constraints` as separate fields.
- these need either:
  - backend enrichment, or
  - frontend derivation from `description`/metadata source.

## 8. Required Frontend Refactors Before Real Connection

1. Replace demo-only auth guard behavior.
- `useRequireAuth` currently auto-creates demo session.
- In production mode, it should redirect to login when token missing.

2. Replace `lib/api/client.ts` mock methods with real async HTTP methods.

3. Update login form fields.
- Participant login currently asks team code + participant name.
- Backend expects team name + password.

4. Change run/submit UX model.
- Current code expects immediate final result from REST.
- Must switch to two-step:
  - REST returns pending submission id.
  - Socket event provides final result.

5. Add robust error handling for status codes.
- 401, 403, 404, 409, 429, 500.

6. Add centralized request helper that unwraps backend `data` envelope.

## 9. Suggested Implementation Sequence

1. Add endpoint constants module.
2. Add typed HTTP helper (with bearer token + envelope handling).
3. Implement auth API methods and session storage.
4. Implement competition state fetch + mapping.
5. Add socket client module and wire all event handlers to store.
6. Update compete page run/submit flow to async queue pattern.
7. Replace leaderboard polling with socket-driven updates.
8. Update admin page to call all admin endpoints.
9. Remove/demo-gate mock mode and validate full flow E2E.

## 10. Error and Retry Guidance

- On `401`, clear session and route to login.
- On `403` for submit, show: "Run must pass before Submit."
- On `429`, show duplicate-submission warning and disable submit briefly.
- On socket disconnect, set status to reconnecting and call state endpoint after reconnect.
- Keep last known state in store to avoid hard UI reset during transient drops.

## 11. Security and Access Rules

- Frontend must never use service-role keys.
- Frontend must never connect directly to PostgreSQL (`SUPABASE_DB_URL`).
- Frontend should only use:
  - backend API + socket,
  - or Supabase publishable key for explicit client-safe auth features.

Given current backend architecture, the recommended approach is:
- frontend talks only to backend for competition features,
- backend owns Redis, DB, scoring, queue, and OneCompiler interactions.

## 12. Known Backend Behaviors to Be Aware Of

- `run:result` and `submission:result` are emitted to user socket(s), not broadcast globally.
- Leaderboard updates are throttled server-side.
- Dedup lock rejects rapid duplicate submit attempts.
- Submit requires runpass key, so direct submit without successful run fails.
- Score/rank computation currently uses accepted count query (there is a TODO in worker to harden rank assignment with `SELECT FOR UPDATE` transaction).

## 13. Quick Test Plan for Frontend Team

1. Login participant -> token stored.
2. Socket connects -> receive `competition:state`.
3. Admin starts round -> participant receives `round:start`.
4. Participant run -> receives `run:result`.
5. Participant submit after passing run -> receives `submission:result`.
6. All clients receive `leaderboard:update`.
7. Pause/resume/end events update UI status correctly.
8. Logout -> `session:ended` handled and local session cleared.

## 14. Final Checklist

- [ ] Real API client implemented.
- [ ] Socket.IO client integrated.
- [ ] DTO mappers implemented.
- [ ] Login form aligned with backend payload.
- [ ] Run/submit changed to async event-driven flow.
- [ ] Admin controls wired to real endpoints.
- [ ] Error handling for 401/403/409/429 added.
- [ ] Demo mode behind explicit flag only.
- [ ] No sensitive secrets exposed in frontend.
