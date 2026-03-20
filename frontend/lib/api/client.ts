import type {
  CompetitionState,
  LeaderboardEntry,
  Language,
  Question,
  RunResult,
  SubmissionResult,
  UserSession,
} from "@/lib/types";

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const DEMO_LOBBY_SECONDS = Number(process.env.NEXT_PUBLIC_DEMO_LOBBY_SECONDS ?? "5");
const DEMO_ROUND_MINUTES = Number(process.env.NEXT_PUBLIC_DEMO_ROUND_MINUTES ?? "20");
const DEMO_QUESTION_MINUTES = Number(process.env.NEXT_PUBLIC_DEMO_QUESTION_MINUTES ?? "3");

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
  questionIndex: 1,
  totalQuestions: 10,
  roundEndsAt: null,
  questionEndsAt: null,
  nextQuestionAt: null,
};

const mockLeaderboard: LeaderboardEntry[] = [
  { teamId: "a", teamName: "Alpha Stack", rank: 1, scores: { r1: 120, r2: 110, r3: 0 }, total: 230 },
  { teamId: "b", teamName: "Byte Raiders", rank: 2, scores: { r1: 115, r2: 105, r3: 0 }, total: 220 },
  { teamId: "c", teamName: "Null Ninjas", rank: 3, scores: { r1: 100, r2: 98, r3: 0 }, total: 198 },
  { teamId: "d", teamName: "Segfault Squad", rank: 4, scores: { r1: 90, r2: 88, r3: 0 }, total: 178 },
];

export interface LoginResponse {
  session: UserSession;
  competition: CompetitionState;
  currentQuestion: Question | null;
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
      roundEndsAt: now + roundMs,
      questionEndsAt: lobbyMs > 0 ? null : now + Math.max(1, DEMO_QUESTION_MINUTES) * 60 * 1000,
      nextQuestionAt: lobbyMs > 0 ? now + lobbyMs : null,
    },
    currentQuestion: defaultQuestion,
  };
}

export const apiClient = {
  login: async (teamCode: string, participantName: string) => {
    await sleep(200);
    return createDemoLoginResponse(teamCode, participantName);
  },

  runCode: async (token: string, payload: { questionId: string; language: Language; code: string }): Promise<RunResult> => {
    void token;
    void payload;
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
  },

  submitCode: async (
    token: string,
    payload: { questionId: string; language: Language; code: string },
  ): Promise<SubmissionResult> => {
    void token;
    void payload;
    await sleep(450);
    return {
      verdict: "ACCEPTED",
      scoreDelta: 25,
      message: "Great run. Submission accepted.",
    };
  },

  getLeaderboard: async () => {
    await sleep(250);
    return mockLeaderboard;
  },

  startRound: async (token: string, round: number) => {
    void token;
    void round;
    await sleep(300);
    return { ok: true };
  },
};
