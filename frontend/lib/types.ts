export type Language = "javascript" | "python" | "cpp";

export type RoundStatus = "IDLE" | "ACTIVE" | "PAUSED" | "ENDED";

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

export interface UserSession {
  token: string;
  teamCode: string;
  teamName: string;
  participantName: string;
  isAdmin?: boolean;
}

export interface Question {
  id: string;
  title: string;
  description: string;
  sampleInput: string;
  sampleOutput: string;
  constraints: string[];
  starterCode: Record<Language, string>;
}

export interface CompetitionState {
  round: number;
  status: RoundStatus;
  questionIndex: number;
  totalQuestions: number;
  roundEndsAt: number | null;
  questionEndsAt: number | null;
  nextQuestionAt: number | null;
}

export interface TestCaseResult {
  id: string;
  label: string;
  passed: boolean;
  expected: string;
  actual: string;
  runtimeMs: number;
}

export interface RunResult {
  passed: boolean;
  testCases: TestCaseResult[];
  output?: string;
  error?: string;
}

export interface SubmissionResult {
  verdict: "ACCEPTED" | "WRONG_ANSWER" | "TIME_LIMIT" | "RUNTIME_ERROR";
  scoreDelta: number;
  message: string;
}

export interface LeaderboardEntry {
  teamId: string;
  teamName: string;
  rank: number;
  scores: {
    r1: number;
    r2: number;
    r3: number;
  };
  total: number;
}

export interface CompetitionSnapshot {
  competition: CompetitionState;
  currentQuestion: Question | null;
  leaderboard: LeaderboardEntry[];
}
