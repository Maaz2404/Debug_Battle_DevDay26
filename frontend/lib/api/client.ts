import type {
  CompetitionState,
  LeaderboardEntry,
  Language,
  Question,
  RunResult,
  SubmissionResult,
  UserSession,
} from "@/lib/types";
import { endpoints } from "@/lib/api/endpoints";
import { apiRequest } from "@/lib/api/http";
import { REAL_BACKEND_ENABLED } from "@/lib/config/runtime";
import {
  mapBackendLeaderboard,
  mapBackendQuestion,
  mapBackendRunResult,
  mapBackendStateToCompetitionState,
  mapBackendStateToQuestion,
  mapBackendSubmissionResult,
} from "@/lib/api/mappers";
import {
  connectCompetitionSocket,
  disconnectCompetitionSocket,
  waitForSocketEvent,
} from "@/lib/socket/client";

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const DEMO_LOBBY_SECONDS = Number(process.env.NEXT_PUBLIC_DEMO_LOBBY_SECONDS ?? "5");
const DEMO_ROUND_MINUTES = Number(process.env.NEXT_PUBLIC_DEMO_ROUND_MINUTES ?? "20");
const DEMO_QUESTION_MINUTES = Number(process.env.NEXT_PUBLIC_DEMO_QUESTION_MINUTES ?? "3");
const COMPETITION_ID = String(process.env.NEXT_PUBLIC_COMPETITION_ID ?? "123");

let runtimeRoundId: string | null = null;

const defaultQuestion: Question = {
  id: "q-1",
  title: "Two Sum Relay",
  description:
    "Given an integer array nums and an integer target, return the indices of the two numbers such that they add up to target.",
  sampleInput: "nums = [2,7,11,15], target = 9",
  sampleOutput: "[0,1]",
  constraints: ["2 <= nums.length <= 10^4", "-10^9 <= nums[i] <= 10^9", "Only one valid answer exists"],
  starterCode: {
    javascript: "function twoSum(nums, target) {\n  // TODO\n  return [];\n}",
    python: "def two_sum(nums, target):\n    # TODO\n    return []",
    cpp: "#include <vector>\nusing namespace std;\n\nvector<int> twoSum(vector<int>& nums, int target) {\n    // TODO\n    return {};\n}",
  },
};

const defaultCompetition: CompetitionState = {
  round: 1,
  status: "IDLE",
  phase: "none",
  questionIndex: 1,
  totalQuestions: 10,
  roundEndsAt: null,
  questionEndsAt: null,
  nextQuestionAt: null,
};

const mockLeaderboard: LeaderboardEntry[] = [
  { teamId: "a", teamName: "Alpha Stack", rank: 1, rounds: [], perQuestion: [], scores: { r1: 120, r2: 110, r3: 0 }, total: 230 },
  { teamId: "b", teamName: "Byte Raiders", rank: 2, rounds: [], perQuestion: [], scores: { r1: 115, r2: 105, r3: 0 }, total: 220 },
  { teamId: "c", teamName: "Null Ninjas", rank: 3, rounds: [], perQuestion: [], scores: { r1: 100, r2: 98, r3: 0 }, total: 198 },
  { teamId: "d", teamName: "Segfault Squad", rank: 4, rounds: [], perQuestion: [], scores: { r1: 90, r2: 88, r3: 0 }, total: 178 },
];

export interface LoginResponse {
  session: UserSession;
  competition: CompetitionState;
  currentQuestion: Question | null;
}

export interface AdminRoundInfo {
  id: string;
  round_number: number;
  status: "IDLE" | "ACTIVE" | "PAUSED" | "ENDED";
  started_at: string | null;
  ended_at: string | null;
}

export interface AdminTeamInfo {
  id: string;
  name: string;
  auth_user_id: string;
  created_at: string;
}

export interface AdminQuestionInfo {
  id: string;
  round_id: string;
  round_number: number | null;
  position: number;
  title: string;
  description: string;
  code: string;
  language: string;
  time_limit_seconds: number;
  base_score: number;
  test_cases: Array<{
    input: string;
    expected_output: string;
  }>;
}

type BackendCompetitionState = {
  round?: {
    round_id?: string | null;
    round_number?: number | null;
    phase?: string;
    current_question_index?: number;
    time_remaining_seconds?: number;
    round_time_remaining_seconds?: number;
    next_start_at?: number | null;
    total_questions?: number;
  };
  current_question?: {
    id?: string;
    title?: string;
    description?: string;
    code?: string;
    language?: string;
    time_limit_seconds?: number;
    test_cases?: Array<{
      input?: string | string[];
      expected_output?: string | string[];
    }>;
  } | null;
  leaderboard?: Array<{
    rank?: number;
    team_id?: string;
    team_name?: string;
    total_score?: number;
    per_question?: Array<{
      score?: number;
    }>;
  }>;
};

type BackendRoundLifecyclePayload = {
  round_id?: string;
  round_number?: number;
  index?: number;
  phase?: string;
  total_questions?: number;
  duration_seconds?: number;
  time_remaining_seconds?: number;
  round_time_remaining_seconds?: number;
  next_start_at?: number | null;
  start_in_seconds?: number;
  scheduled_start_at?: number;
  status?: string;
  question?: {
    time_limit_seconds?: number;
    id?: string;
    title?: string;
    description?: string;
    code?: string;
    language?: string;
    test_cases?: Array<{
      input?: string | string[];
      expected_output?: string | string[];
    }>;
  };
};

type BackendRunPayload = {
  submission_id?: string;
  status?: string;
  result?: {
    test_results?: Array<{
      expected?: string;
      actual?: string;
      passed?: boolean;
    }>;
  };
};

type BackendSubmissionPayload = {
  submission_id?: string;
  status?: string;
  score?: {
    total_score?: number;
  };
};

type BackendSubmissionStatePayload = {
  submission_id?: string;
  job_type?: string;
  status?: string;
  result?: {
    test_results?: Array<{
      expected?: string;
      actual?: string;
      passed?: boolean;
    }>;
    error?: string;
  };
  score?: {
    total_score?: number;
  };
};

function isSubmissionFinalized(status: string) {
  return !["PENDING", "COMPILING"].includes(String(status || "").toUpperCase());
}

async function getCompetitionState(token: string): Promise<BackendCompetitionState> {
  return apiRequest<BackendCompetitionState>(endpoints.competition.state(COMPETITION_ID), {
    method: "GET",
    token,
  });
}

async function ensureRoundId(token: string) {
  if (runtimeRoundId) {
    return runtimeRoundId;
  }

  const state = await getCompetitionState(token);
  runtimeRoundId = state.round?.round_id || null;
  return runtimeRoundId;
}

export function createDemoLoginResponse(teamCode = "DEMO", participantName = "Frontend Tester"): LoginResponse {
  const now = Date.now();
  const lobbyMs = Math.max(0, DEMO_LOBBY_SECONDS) * 1000;
  const roundMs = Math.max(1, DEMO_ROUND_MINUTES) * 60 * 1000;

  return {
    session: {
      token: "mock-jwt-token",
      teamCode,
      teamName: `Team ${teamCode.toUpperCase()}`,
      participantName,
    },
    competition: {
      ...defaultCompetition,
      status: lobbyMs > 0 ? "IDLE" : "ACTIVE",
      phase: lobbyMs > 0 ? "none" : "question",
      roundEndsAt: now + roundMs,
      questionEndsAt: lobbyMs > 0 ? null : now + Math.max(1, DEMO_QUESTION_MINUTES) * 60 * 1000,
      nextQuestionAt: lobbyMs > 0 ? now + lobbyMs : null,
    },
    currentQuestion: defaultQuestion,
  };
}

export const apiClient = {
  logout: async (token?: string) => {
    try {
      if (REAL_BACKEND_ENABLED && token) {
        await apiRequest(endpoints.auth.logout, {
          method: "POST",
          token,
        });
      }
    } finally {
      disconnectCompetitionSocket();
      runtimeRoundId = null;
    }

    return { ok: true };
  },

  login: async (teamCode: string, participantName: string) => {
    if (!REAL_BACKEND_ENABLED) {
      await sleep(200);
      return createDemoLoginResponse(teamCode, participantName);
    }

    const auth = await apiRequest<{
      access_token: string;
      team?: {
        name?: string;
      };
    }>(endpoints.auth.login, {
      method: "POST",
      body: {
        team_name: teamCode.trim(),
        password: participantName.trim(),
      },
    });

    const token = String(auth.access_token || "");
    if (!token) {
      throw new Error("Login succeeded but no access token was returned.");
    }

    const state = await getCompetitionState(token);
    runtimeRoundId = state.round?.round_id || null;
    connectCompetitionSocket(token);

    return {
      session: {
        token,
        teamCode,
        teamName: String(auth.team?.name || `Team ${teamCode.toUpperCase()}`),
        participantName,
      },
      competition: mapBackendStateToCompetitionState(state),
      currentQuestion: mapBackendStateToQuestion(state),
    };
  },

  loginAdmin: async (email: string, password: string) => {
    const auth = await apiRequest<{
      access_token: string;
      user?: { email?: string };
    }>(endpoints.auth.adminLogin, {
      method: "POST",
      body: { email, password },
    });

    const token = String(auth.access_token || "");
    if (!token) {
      throw new Error("Admin login succeeded but no access token was returned.");
    }

    const state = await getCompetitionState(token);
    runtimeRoundId = state.round?.round_id || null;
    connectCompetitionSocket(token);

    return {
      session: {
        token,
        teamCode: "ADMIN",
        teamName: "Admin",
        participantName: String(auth.user?.email || email),
        isAdmin: true,
      },
      competition: mapBackendStateToCompetitionState(state),
      currentQuestion: mapBackendStateToQuestion(state),
    };
  },

  requestRun: async (token: string, payload: { questionId: string; language: Language; code: string }) => {
    if (!REAL_BACKEND_ENABLED) {
      return { submissionId: "demo-run-submission" };
    }

    const roundId = await ensureRoundId(token);
    if (!roundId) {
      throw new Error("No active round found for run request.");
    }

    connectCompetitionSocket(token);
    const accepted = await apiRequest<{ submission_id: string }>(endpoints.participant.run, {
      method: "POST",
      token,
      body: {
        code: payload.code,
        language: payload.language,
        questionId: payload.questionId,
        roundId,
      },
    });

    return {
      submissionId: String(accepted.submission_id || ""),
    };
  },

  waitForRunResult: async (submissionId: string): Promise<RunResult> => {
    if (!REAL_BACKEND_ENABLED) {
      await sleep(500);
      return {
        passed: true,
        output: "All visible test cases passed",
        testCases: [
          {
            id: "1",
            label: "Sample #1",
            passed: true,
            expected: "[0,1]",
            actual: "[0,1]",
            runtimeMs: 9,
          },
          {
            id: "2",
            label: "Hidden #3",
            passed: true,
            expected: "[2,3]",
            actual: "[2,3]",
            runtimeMs: 13,
          },
        ],
      };
    }

    const resultPayload = await waitForSocketEvent<BackendRunPayload>(
      "run:result",
      (event) => String(event.submission_id || "") === submissionId,
    );

    return mapBackendRunResult(resultPayload);
  },

  runCode: async (token: string, payload: { questionId: string; language: Language; code: string }): Promise<RunResult> => {
    const { submissionId } = await apiClient.requestRun(token, payload);
    return apiClient.waitForRunResult(submissionId);
  },

  requestSubmit: async (
    token: string,
    payload: { questionId: string; language: Language; code: string },
  ) => {
    if (!REAL_BACKEND_ENABLED) {
      return { submissionId: "demo-submit-submission" };
    }

    const roundId = await ensureRoundId(token);
    if (!roundId) {
      throw new Error("No active round found for submit request.");
    }

    connectCompetitionSocket(token);
    const accepted = await apiRequest<{ submission_id: string }>(endpoints.participant.submit, {
      method: "POST",
      token,
      body: {
        code: payload.code,
        language: payload.language,
        questionId: payload.questionId,
        roundId,
      },
    });

    return {
      submissionId: String(accepted.submission_id || ""),
    };
  },

  waitForSubmissionResult: async (submissionId: string): Promise<SubmissionResult> => {
    if (!REAL_BACKEND_ENABLED) {
      await sleep(450);
      return {
        verdict: "ACCEPTED",
        scoreDelta: 25,
        message: "Great run. Submission accepted.",
      };
    }

    const resultPayload = await waitForSocketEvent<BackendSubmissionPayload>(
      "submission:result",
      (event) => String(event.submission_id || "") === submissionId,
    );

    return mapBackendSubmissionResult(resultPayload);
  },

  submitCode: async (
    token: string,
    payload: { questionId: string; language: Language; code: string },
  ): Promise<SubmissionResult> => {
    const { submissionId } = await apiClient.requestSubmit(token, payload);
    return apiClient.waitForSubmissionResult(submissionId);
  },

  getSubmissionStatus: async (token: string, submissionId: string) => {
    if (!REAL_BACKEND_ENABLED) {
      return {
        submission_id: submissionId,
        status: "PENDING",
        job_type: "run",
        result: null,
        score: { total_score: 0 },
      };
    }

    return apiRequest<BackendSubmissionStatePayload>(endpoints.participant.submissionStatus(submissionId), {
      method: "GET",
      token,
    });
  },

  recoverRunResult: async (token: string, submissionId: string): Promise<RunResult | null> => {
    const submission = await apiClient.getSubmissionStatus(token, submissionId);
    if (String(submission.job_type || "").toLowerCase() !== "run") {
      return null;
    }

    const status = String(submission.status || "").toUpperCase();
    if (!isSubmissionFinalized(status)) {
      return null;
    }

    return mapBackendRunResult({
      status,
      result: submission.result ?? undefined,
    });
  },

  recoverSubmissionResult: async (token: string, submissionId: string): Promise<SubmissionResult | null> => {
    const submission = await apiClient.getSubmissionStatus(token, submissionId);
    if (String(submission.job_type || "").toLowerCase() !== "submit") {
      return null;
    }

    const status = String(submission.status || "").toUpperCase();
    if (!isSubmissionFinalized(status)) {
      return null;
    }

    return mapBackendSubmissionResult({
      status,
      score: submission.score,
    });
  },

  getLeaderboard: async (token?: string) => {
    if (!REAL_BACKEND_ENABLED) {
      await sleep(250);
      return mockLeaderboard;
    }

    if (!token) {
      throw new Error("Missing auth token for leaderboard request.");
    }

    const state = await getCompetitionState(token);
    return mapBackendLeaderboard(state.leaderboard);
  },

  getState: async (token: string) => {
    const state = await getCompetitionState(token);
    runtimeRoundId = state.round?.round_id || null;

    return {
      competition: mapBackendStateToCompetitionState(state),
      currentQuestion: mapBackendStateToQuestion(state),
      leaderboard: mapBackendLeaderboard(state.leaderboard),
    };
  },

  onRealtimeEvents: (token: string, handlers: {
    onCompetitionState?: (payload: LoginResponse["competition"]) => void;
    onQuestion?: (payload: Question | null) => void;
    onLeaderboard?: (payload: LeaderboardEntry[]) => void;
    onRunResult?: (payload: RunResult) => void;
    onSubmissionResult?: (payload: SubmissionResult) => void;
    onSessionEnded?: () => void;
  }) => {
    if (!REAL_BACKEND_ENABLED) {
      return () => undefined;
    }

    const socket = connectCompetitionSocket(token);
    const listeners: Array<() => void> = [];

    const competitionStateHandler = (payload: BackendCompetitionState) => {
      runtimeRoundId = payload.round?.round_id || runtimeRoundId;
      handlers.onCompetitionState?.(mapBackendStateToCompetitionState(payload));
      handlers.onQuestion?.(mapBackendStateToQuestion(payload));
      handlers.onLeaderboard?.(mapBackendLeaderboard(payload.leaderboard));
    };

    const toCompetitionFromLifecycle = (
      payload: BackendRoundLifecyclePayload,
      status: LoginResponse["competition"]["status"],
    ): LoginResponse["competition"] => {
      const now = Date.now();
      const phaseRaw = String(payload.phase || "question").toLowerCase();
      const phase: LoginResponse["competition"]["phase"] =
        phaseRaw === "gap" || phaseRaw === "ended" || phaseRaw === "none"
          ? phaseRaw
          : "question";
      const questionSeconds = Number(payload.time_remaining_seconds || payload.question?.time_limit_seconds || 0);
      const roundSeconds = Number(
        payload.round_time_remaining_seconds
        || payload.duration_seconds
        || payload.time_remaining_seconds
        || payload.question?.time_limit_seconds
        || 0,
      );
      const roundEndsAt = roundSeconds > 0 ? now + (roundSeconds * 1000) : null;
      const questionEndsAt = phase === "question" && questionSeconds > 0
        ? now + (questionSeconds * 1000)
        : null;
      const providedNextStartAt = Number(payload.next_start_at || 0);
      const fallbackNextStartAt = phase === "gap" && questionSeconds > 0
        ? now + (questionSeconds * 1000)
        : null;

      return {
        round: Number(payload.round_number || 1),
        status,
        phase,
        questionIndex: Number(payload.index || 0) + 1,
        totalQuestions: Number(payload.total_questions || 10),
        roundEndsAt,
        questionEndsAt,
        nextQuestionAt: providedNextStartAt > now ? providedNextStartAt : fallbackNextStartAt,
      };
    };

    const questionHandler = (payload: BackendRoundLifecyclePayload) => {
      handlers.onCompetitionState?.(toCompetitionFromLifecycle(payload, "ACTIVE"));
      handlers.onQuestion?.(mapBackendQuestion(payload.question));
    };

    const questionGapHandler = (payload: BackendRoundLifecyclePayload) => {
      handlers.onCompetitionState?.(toCompetitionFromLifecycle(payload, "ACTIVE"));
    };

    const roundStartHandler = (payload: BackendRoundLifecyclePayload) => {
      handlers.onCompetitionState?.(toCompetitionFromLifecycle(payload, "ACTIVE"));
      handlers.onQuestion?.(mapBackendQuestion(payload.question));
    };

    const roundPausedHandler = (payload: BackendRoundLifecyclePayload) => {
      handlers.onCompetitionState?.(toCompetitionFromLifecycle(payload, "PAUSED"));
    };

    const roundResumedHandler = (payload: BackendRoundLifecyclePayload) => {
      handlers.onCompetitionState?.(toCompetitionFromLifecycle(payload, "ACTIVE"));
    };

    const roundEndHandler = (payload: BackendRoundLifecyclePayload) => {
      handlers.onCompetitionState?.(toCompetitionFromLifecycle(payload, "ENDED"));

      void getCompetitionState(token)
        .then((state) => {
          runtimeRoundId = state.round?.round_id || runtimeRoundId;
          handlers.onCompetitionState?.(mapBackendStateToCompetitionState(state));
          handlers.onQuestion?.(mapBackendStateToQuestion(state));
          handlers.onLeaderboard?.(mapBackendLeaderboard(state.leaderboard));
        })
        .catch(() => {
          // Keep ENDED lifecycle fallback if snapshot refresh fails.
        });
    };

    const roundScheduledHandler = (payload: BackendRoundLifecyclePayload) => {
      const now = Date.now();
      const scheduledAt = Number(payload.scheduled_start_at || 0);
      const startIn = Number(payload.start_in_seconds || 0);
      const nextQuestionAt = scheduledAt > now ? scheduledAt : (startIn > 0 ? now + (startIn * 1000) : null);

      handlers.onCompetitionState?.({
        round: Number(payload.round_number || 1),
        status: "IDLE",
        phase: "none",
        questionIndex: Number(payload.index || 0) + 1,
        totalQuestions: Number(payload.total_questions || 10),
        roundEndsAt: null,
        questionEndsAt: null,
        nextQuestionAt,
      });
    };

    const runResultHandler = (payload: BackendRunPayload) => {
      handlers.onRunResult?.(mapBackendRunResult(payload));
    };

    const submissionResultHandler = (payload: BackendSubmissionPayload) => {
      handlers.onSubmissionResult?.(mapBackendSubmissionResult(payload));
    };

    const leaderboardHandler = (payload: {
      rankings?: Array<{ rank?: number; team_id?: string; team_name?: string; total_score?: number }>;
    }) => {
      handlers.onLeaderboard?.(mapBackendLeaderboard(payload.rankings));
    };

    const sessionEndedHandler = () => {
      handlers.onSessionEnded?.();
    };

    socket.on("competition:state", competitionStateHandler);
    socket.on("round:start", roundStartHandler);
    socket.on("round:scheduled", roundScheduledHandler);
    socket.on("round:paused", roundPausedHandler);
    socket.on("round:resumed", roundResumedHandler);
    socket.on("round:end", roundEndHandler);
    socket.on("question:next", questionHandler);
    socket.on("question:gap", questionGapHandler);
    socket.on("run:result", runResultHandler);
    socket.on("submission:result", submissionResultHandler);
    socket.on("leaderboard:update", leaderboardHandler);
    socket.on("session:ended", sessionEndedHandler);

    listeners.push(() => socket.off("competition:state", competitionStateHandler));
    listeners.push(() => socket.off("round:start", roundStartHandler));
    listeners.push(() => socket.off("round:scheduled", roundScheduledHandler));
    listeners.push(() => socket.off("round:paused", roundPausedHandler));
    listeners.push(() => socket.off("round:resumed", roundResumedHandler));
    listeners.push(() => socket.off("round:end", roundEndHandler));
    listeners.push(() => socket.off("question:next", questionHandler));
    listeners.push(() => socket.off("question:gap", questionGapHandler));
    listeners.push(() => socket.off("run:result", runResultHandler));
    listeners.push(() => socket.off("submission:result", submissionResultHandler));
    listeners.push(() => socket.off("leaderboard:update", leaderboardHandler));
    listeners.push(() => socket.off("session:ended", sessionEndedHandler));

    return () => {
      listeners.forEach((dispose) => dispose());
    };
  },

  startRound: async (token: string, round: number, startInSeconds?: number) => {
    if (!REAL_BACKEND_ENABLED) {
      await sleep(300);
      return { ok: true };
    }

    await apiRequest(endpoints.admin.startRound(round), {
      method: "POST",
      token,
      body: startInSeconds && startInSeconds > 0 ? { startInSeconds } : undefined,
    });
    return { ok: true };
  },

  pauseRound: async (token: string, round: number) => {
    if (!REAL_BACKEND_ENABLED) {
      return { ok: true };
    }

    await apiRequest(endpoints.admin.pauseRound(round), {
      method: "POST",
      token,
    });
    return { ok: true };
  },

  resumeRound: async (token: string, round: number) => {
    if (!REAL_BACKEND_ENABLED) {
      return { ok: true };
    }

    await apiRequest(endpoints.admin.resumeRound(round), {
      method: "POST",
      token,
    });
    return { ok: true };
  },

  endRound: async (token: string, round: number) => {
    if (!REAL_BACKEND_ENABLED) {
      return { ok: true };
    }

    await apiRequest(endpoints.admin.endRound(round), {
      method: "POST",
      token,
    });
    return { ok: true };
  },

  getAdminRounds: async (token: string): Promise<AdminRoundInfo[]> => {
    if (!REAL_BACKEND_ENABLED) {
      return [
        { id: "r1", round_number: 1, status: "IDLE", started_at: null, ended_at: null },
        { id: "r2", round_number: 2, status: "IDLE", started_at: null, ended_at: null },
        { id: "r3", round_number: 3, status: "IDLE", started_at: null, ended_at: null },
      ];
    }

    const payload = await apiRequest<{ rounds?: AdminRoundInfo[] }>(endpoints.admin.rounds, {
      method: "GET",
      token,
    });

    return payload.rounds || [];
  },

  resetRound: async (token: string, round: number) => {
    if (!REAL_BACKEND_ENABLED) {
      return { ok: true };
    }

    await apiRequest(endpoints.admin.resetRound(round), {
      method: "POST",
      token,
    });

    return { ok: true };
  },

  getAdminTeams: async (token: string): Promise<AdminTeamInfo[]> => {
    if (!REAL_BACKEND_ENABLED) {
      return [];
    }

    const payload = await apiRequest<{ teams?: AdminTeamInfo[] }>(endpoints.admin.teams, {
      method: "GET",
      token,
    });

    return payload.teams || [];
  },

  createAdminTeam: async (
    token: string,
    payload: { name: string; password: string },
  ): Promise<AdminTeamInfo> => {
    const response = await apiRequest<{ team: AdminTeamInfo }>(endpoints.admin.teams, {
      method: "POST",
      token,
      body: payload,
    });
    return response.team;
  },

  updateAdminTeam: async (
    token: string,
    teamId: string,
    payload: { name?: string; password?: string },
  ): Promise<AdminTeamInfo> => {
    const response = await apiRequest<{ team: AdminTeamInfo }>(endpoints.admin.teamById(teamId), {
      method: "PATCH",
      token,
      body: payload,
    });
    return response.team;
  },

  deleteAdminTeam: async (token: string, teamId: string) => {
    await apiRequest(endpoints.admin.teamById(teamId), {
      method: "DELETE",
      token,
    });
    return { ok: true };
  },

  resetAllTeamsPassword: async (token: string, password: string) => {
    const response = await apiRequest<{
      action: string;
      total: number;
      updated: number;
      failed: number;
      failed_team_ids: string[];
    }>(endpoints.admin.resetTeamsPassword, {
      method: "POST",
      token,
      body: { password },
    });

    return response;
  },

  getAdminQuestions: async (token: string, roundNumber?: number): Promise<AdminQuestionInfo[]> => {
    if (!REAL_BACKEND_ENABLED) {
      return [];
    }

    const url = roundNumber
      ? `${endpoints.admin.questions}?roundNumber=${encodeURIComponent(String(roundNumber))}`
      : endpoints.admin.questions;

    const payload = await apiRequest<{ questions?: AdminQuestionInfo[] }>(url, {
      method: "GET",
      token,
    });

    return payload.questions || [];
  },

  createAdminQuestion: async (
    token: string,
    payload: {
      round_number: number;
      position: number;
      title: string;
      description: string;
      code: string;
      language: string;
      time_limit_seconds: number;
      base_score: number;
      test_cases: Array<{ input: string; expected_output: string }>;
    },
  ): Promise<AdminQuestionInfo> => {
    const response = await apiRequest<{ question: AdminQuestionInfo }>(endpoints.admin.questions, {
      method: "POST",
      token,
      body: payload,
    });
    return response.question;
  },

  updateAdminQuestion: async (
    token: string,
    questionId: string,
    payload: {
      round_number?: number;
      position?: number;
      title?: string;
      description?: string;
      code?: string;
      language?: string;
      time_limit_seconds?: number;
      base_score?: number;
      test_cases?: Array<{ input: string; expected_output: string }>;
    },
  ): Promise<AdminQuestionInfo> => {
    const response = await apiRequest<{ question: AdminQuestionInfo }>(endpoints.admin.questionById(questionId), {
      method: "PATCH",
      token,
      body: payload,
    });
    return response.question;
  },

  deleteAdminQuestion: async (token: string, questionId: string) => {
    await apiRequest(endpoints.admin.questionById(questionId), {
      method: "DELETE",
      token,
    });
    return { ok: true };
  },
};
