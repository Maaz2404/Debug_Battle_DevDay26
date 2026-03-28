import type {
  CompetitionState,
  LeaderboardEntry,
  Question,
  RunResult,
  SubmissionResult,
} from "@/lib/types";

const defaultStarterCode = {
  javascript: "",
  python: "",
  cpp: "",
};

type BackendRound = {
  status?: string;
  round_number?: number | null;
  round_id?: string | null;
  current_question_index?: number;
  current_question_id?: string | null;
  time_remaining_seconds?: number;
  next_start_at?: number | null;
};

type BackendStateResponse = {
  competition_id?: string;
  round?: BackendRound;
  current_question?: BackendQuestion | null;
  leaderboard?: Array<{
    rank?: number;
    team_id?: string;
    team_name?: string;
    total_score?: number;
    per_question?: Array<{
      question_id?: string;
      completed?: boolean;
      score?: number;
      solve_rank?: number;
      position?: number;
    }>;
    per_round?: Array<{
      round_id?: string;
      round_number?: number;
      round_total?: number;
      questions?: Array<{
        question_id?: string;
        position?: number;
        completed?: boolean;
        score?: number | null;
        solve_rank?: number;
      }>;
    }>;
  }>;
};

type BackendQuestion = {
  id?: string;
  title?: string;
  description?: string;
  code?: string;
  language?: string;
  time_limit_seconds?: number;
  starter_code?: Partial<Record<"javascript" | "python" | "cpp", string>>;
  starter_code_javascript?: string;
  starter_code_python?: string;
  starter_code_cpp?: string;
  starter_code_js?: string;
  starter_code_py?: string;
  test_cases?: Array<{
    input?: string | string[];
    expected_output?: string | string[];
  }>;
};

function normalizeLanguage(value: string | undefined) {
  const lang = String(value || "").toLowerCase().trim();
  if (lang === "cpp" || lang === "c++") return "cpp";
  if (lang === "python" || lang === "python3" || lang === "py") return "python";
  if (lang === "javascript" || lang === "js" || lang === "node") return "javascript";
  return null;
}

function toDisplayValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.join(" ");
  }
  return String(value || "");
}

function extractCodeBlock(description: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp("```(?:" + label + ")\\s*([\\s\\S]*?)```", "i");
    const match = description.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return "";
}

function resolveStarterCode(question: BackendQuestion, description: string) {
  const explicit = question.starter_code || {};
  const language = normalizeLanguage(question.language);
  const rowCode = String(question.code || "");

  const js = String(
    (language === "javascript" ? rowCode : "")
    ||
    explicit.javascript
    || question.starter_code_javascript
    || question.starter_code_js
    || extractCodeBlock(description, ["javascript", "js"])
    || "",
  );
  const py = String(
    (language === "python" ? rowCode : "")
    ||
    explicit.python
    || question.starter_code_python
    || question.starter_code_py
    || extractCodeBlock(description, ["python", "py"])
    || "",
  );
  const cpp = String(
    (language === "cpp" ? rowCode : "")
    ||
    explicit.cpp
    || question.starter_code_cpp
    || extractCodeBlock(description, ["cpp", "c\\+\\+"])
    || "",
  );

  return {
    javascript: js,
    python: py,
    cpp,
  };
}

function buildPlaceholderQuestion(questionId: string): Question {
  return {
    id: questionId,
    title: "Live Question",
    description: "Question details are being synced from the server.",
    sampleInput: "",
    sampleOutput: "",
    constraints: ["Use Run to validate before Submit."],
    starterCode: defaultStarterCode,
  };
}

export function mapBackendStateToCompetitionState(raw: BackendStateResponse): CompetitionState {
  const now = Date.now();
  const round = raw.round || {};
  const remainingSeconds = Number(round.time_remaining_seconds || 0);
  const endsAt = remainingSeconds > 0 ? now + (remainingSeconds * 1000) : null;
  const nextStartAt = Number(round.next_start_at || 0);

  return {
    round: Number(round.round_number || 1),
    status: (String(round.status || "IDLE").toUpperCase() as CompetitionState["status"]),
    questionIndex: Number(round.current_question_index || 0) + 1,
    totalQuestions: 10,
    roundEndsAt: endsAt,
    questionEndsAt: endsAt,
    nextQuestionAt: nextStartAt > now ? nextStartAt : null,
  };
}

export function mapBackendStateToQuestion(raw: BackendStateResponse): Question | null {
  if (raw.current_question) {
    return mapBackendQuestion(raw.current_question);
  }

  const questionId = raw.round?.current_question_id;
  if (!questionId) {
    return null;
  }
  return buildPlaceholderQuestion(String(questionId));
}

export function mapBackendLeaderboard(entries: BackendStateResponse["leaderboard"]): LeaderboardEntry[] {
  return (entries || []).map((entry, index) => {
    const perQuestion = (entry.per_question || []).map((item) => ({
      questionId: item.question_id ? String(item.question_id) : null,
      completed: Boolean(item.completed),
      score: Number(item.score || 0),
      solveRank: item.solve_rank ? Number(item.solve_rank) : null,
    }));

    const rounds = (entry.per_round || []).map((round) => ({
      roundNumber: Number(round.round_number || 0),
      questions: (round.questions || [])
        .map((question, questionIndex) => ({
          questionId: question.question_id ? String(question.question_id) : null,
          position: Number(question.position || (questionIndex + 1)),
          completed: Boolean(question.completed),
          score: question.score === null || question.score === undefined ? null : Number(question.score),
          solveRank: question.solve_rank ? Number(question.solve_rank) : null,
        }))
        .sort((a, b) => a.position - b.position),
      roundTotal: Number(round.round_total || 0),
    }));

    return {
      teamId: String(entry.team_id || `team-${index + 1}`),
      teamName: String(entry.team_name || "Unknown Team"),
      rank: Number(entry.rank || index + 1),
      rounds,
      perQuestion,
      scores: {
        r1: typeof perQuestion[0]?.score === "number" ? Number(perQuestion[0].score) : null,
        r2: typeof perQuestion[1]?.score === "number" ? Number(perQuestion[1].score) : null,
        r3: typeof perQuestion[2]?.score === "number" ? Number(perQuestion[2].score) : null,
      },
      total: Number(entry.total_score || 0),
    };
  });
}

export function mapBackendQuestion(question: BackendQuestion | null | undefined): Question | null {
  if (!question?.id) {
    return null;
  }

  const description = String(question.description || "No description provided.");
  const firstCase = Array.isArray(question.test_cases) && question.test_cases.length > 0
    ? question.test_cases[0]
    : null;

  return {
    id: String(question.id),
    title: String(question.title || "Live Question"),
    description,
    sampleInput: toDisplayValue(firstCase?.input),
    sampleOutput: toDisplayValue(firstCase?.expected_output),
    constraints: question.time_limit_seconds
      ? [`Time limit: ${question.time_limit_seconds}s`]
      : ["Refer to statement for exact constraints."],
    starterCode: resolveStarterCode(question, description),
  };
}

export function mapBackendRunResult(payload: {
  status?: string;
  result?: {
    test_results?: Array<{
      expected?: string;
      actual?: string;
      passed?: boolean;
    }>;
  };
}): RunResult {
  const testCases = (payload.result?.test_results || []).map((test, index) => ({
    id: String(index + 1),
    label: `Case #${index + 1}`,
    passed: Boolean(test.passed),
    expected: String(test.expected || ""),
    actual: String(test.actual || ""),
    runtimeMs: 0,
  }));

  const passed = String(payload.status || "") === "ACCEPTED";
  return {
    passed,
    testCases,
    output: passed ? "All test cases passed" : "Some test cases failed",
  };
}

export function mapBackendSubmissionResult(payload: {
  status?: string;
  score?: {
    total_score?: number;
  };
}): SubmissionResult {
  const status = String(payload.status || "RUNTIME_ERROR");

  if (status === "ACCEPTED") {
    return {
      verdict: "ACCEPTED",
      scoreDelta: Number(payload.score?.total_score || 0),
      message: "Submission accepted.",
    };
  }

  if (status === "WRONG_ANSWER") {
    return {
      verdict: "WRONG_ANSWER",
      scoreDelta: 0,
      message: "Submission did not pass all test cases.",
    };
  }

  if (status === "TIMEOUT") {
    return {
      verdict: "TIME_LIMIT",
      scoreDelta: 0,
      message: "Submission timed out.",
    };
  }

  return {
    verdict: "RUNTIME_ERROR",
    scoreDelta: 0,
    message: "Submission failed due to a runtime or system error.",
  };
}
