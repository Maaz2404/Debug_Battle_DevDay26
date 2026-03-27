import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type {
  CompetitionState,
  ConnectionStatus,
  Language,
  LeaderboardEntry,
  Question,
  RunResult,
  SubmissionResult,
  UserSession,
} from "@/lib/types";

interface AppState {
  user: UserSession | null;
  competition: CompetitionState | null;
  currentQuestion: Question | null;
  leaderboard: LeaderboardEntry[];
  runResult: RunResult | null;
  submissionResult: SubmissionResult | null;
  connectionStatus: ConnectionStatus;
  language: Language;
  codeDraft: string;
  isRunning: boolean;
  isSubmitting: boolean;
  pendingRunSubmissionId: string | null;
  pendingSubmitSubmissionId: string | null;
  countdownValue: number | null;
  showThirtySecondWarning: boolean;
  setUser: (user: UserSession | null) => void;
  setCompetition: (competition: CompetitionState | null) => void;
  setCurrentQuestion: (question: Question | null) => void;
  setLeaderboard: (entries: LeaderboardEntry[]) => void;
  setRunResult: (result: RunResult | null) => void;
  setSubmissionResult: (result: SubmissionResult | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setLanguage: (language: Language) => void;
  setCodeDraft: (code: string) => void;
  setIsRunning: (running: boolean) => void;
  setIsSubmitting: (submitting: boolean) => void;
  setPendingRunSubmissionId: (submissionId: string | null) => void;
  setPendingSubmitSubmissionId: (submissionId: string | null) => void;
  setCountdownValue: (value: number | null) => void;
  setThirtySecondWarning: (show: boolean) => void;
  resetQuestionState: (question: Question | null) => void;
  clearSession: () => void;
}

const defaultCompetition: CompetitionState = {
  round: 1,
  status: "IDLE",
  questionIndex: 1,
  totalQuestions: 10,
  roundEndsAt: null,
  questionEndsAt: null,
  nextQuestionAt: null,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      competition: defaultCompetition,
      currentQuestion: null,
      leaderboard: [],
      runResult: null,
      submissionResult: null,
      connectionStatus: "connected",
      language: "javascript",
      codeDraft: "",
      isRunning: false,
      isSubmitting: false,
      pendingRunSubmissionId: null,
      pendingSubmitSubmissionId: null,
      countdownValue: null,
      showThirtySecondWarning: false,
      setUser: (user) => set({ user }),
      setCompetition: (competition) => set({ competition }),
      setCurrentQuestion: (currentQuestion) => set({ currentQuestion }),
      setLeaderboard: (leaderboard) => set((state) => ({
        leaderboard: leaderboard.map((entry) => {
          if (entry.perQuestion.length > 0) {
            return entry;
          }

          const previous = state.leaderboard.find((item) => item.teamId === entry.teamId);
          if (!previous || previous.perQuestion.length === 0) {
            return entry;
          }

          return {
            ...entry,
            perQuestion: previous.perQuestion,
            scores: {
              r1: typeof previous.perQuestion[0]?.score === "number" ? previous.perQuestion[0].score : entry.scores.r1,
              r2: typeof previous.perQuestion[1]?.score === "number" ? previous.perQuestion[1].score : entry.scores.r2,
              r3: typeof previous.perQuestion[2]?.score === "number" ? previous.perQuestion[2].score : entry.scores.r3,
            },
          };
        }),
      })),
      setRunResult: (runResult) => set({ runResult }),
      setSubmissionResult: (submissionResult) => set({ submissionResult }),
      setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
      setLanguage: (language) => {
        const question = get().currentQuestion;
        const fallback = question?.starterCode[language] ?? "";
        set({ language, codeDraft: fallback });
      },
      setCodeDraft: (codeDraft) => set({ codeDraft }),
      setIsRunning: (isRunning) => set({ isRunning }),
      setIsSubmitting: (isSubmitting) => set({ isSubmitting }),
      setPendingRunSubmissionId: (pendingRunSubmissionId) => set({ pendingRunSubmissionId }),
      setPendingSubmitSubmissionId: (pendingSubmitSubmissionId) => set({ pendingSubmitSubmissionId }),
      setCountdownValue: (countdownValue) => set({ countdownValue }),
      setThirtySecondWarning: (showThirtySecondWarning) => set({ showThirtySecondWarning }),
      resetQuestionState: (question) => {
        const language = get().language;
        const defaultCode = question?.starterCode[language] ?? "";
        set({
          currentQuestion: question,
          codeDraft: defaultCode,
          runResult: null,
          submissionResult: null,
          isRunning: false,
          isSubmitting: false,
          pendingRunSubmissionId: null,
          pendingSubmitSubmissionId: null,
          showThirtySecondWarning: false,
        });
      },
      clearSession: () => {
        set({
          user: null,
          competition: defaultCompetition,
          currentQuestion: null,
          leaderboard: [],
          runResult: null,
          submissionResult: null,
          connectionStatus: "connected",
          codeDraft: "",
          isRunning: false,
          isSubmitting: false,
          pendingRunSubmissionId: null,
          pendingSubmitSubmissionId: null,
          countdownValue: null,
          showThirtySecondWarning: false,
        });
      },
    }),
    {
      name: "debug-relay-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        language: state.language,
      }),
    },
  ),
);
