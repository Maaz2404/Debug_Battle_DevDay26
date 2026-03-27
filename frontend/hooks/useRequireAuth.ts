"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { apiClient } from "@/lib/api/client";
import { REAL_BACKEND_ENABLED } from "@/lib/config/runtime";
import { onSocketLifecycle } from "@/lib/socket/client";
import { useAppStore } from "@/lib/store/useAppStore";

export function useRequireAuth() {
  const router = useRouter();
  const user = useAppStore((state) => state.user);
  const setCompetition = useAppStore((state) => state.setCompetition);
  const resetQuestionState = useAppStore((state) => state.resetQuestionState);
  const setLeaderboard = useAppStore((state) => state.setLeaderboard);
  const setRunResult = useAppStore((state) => state.setRunResult);
  const setSubmissionResult = useAppStore((state) => state.setSubmissionResult);
  const setIsRunning = useAppStore((state) => state.setIsRunning);
  const setIsSubmitting = useAppStore((state) => state.setIsSubmitting);
  const setPendingRunSubmissionId = useAppStore((state) => state.setPendingRunSubmissionId);
  const setPendingSubmitSubmissionId = useAppStore((state) => state.setPendingSubmitSubmissionId);
  const clearSession = useAppStore((state) => state.clearSession);
  const setConnectionStatus = useAppStore((state) => state.setConnectionStatus);

  useEffect(() => {
    if (REAL_BACKEND_ENABLED && user?.token?.startsWith("mock-")) {
      clearSession();
      setConnectionStatus("disconnected");
      router.replace("/");
      return;
    }

    if (!user?.token) {
      setConnectionStatus("disconnected");
      router.replace("/");
      return;
    }

    if (!REAL_BACKEND_ENABLED || !user?.token) {
      return;
    }

    let disposed = false;
    setConnectionStatus("reconnecting");

    const hydrateSnapshot = async () => {
      try {
        const state = await apiClient.getState(user.token);
        if (disposed) {
          return;
        }

        setCompetition(state.competition);
        resetQuestionState(state.currentQuestion);
        setLeaderboard(state.leaderboard);
      } catch {
        if (!disposed) {
          setConnectionStatus("disconnected");
        }
      }
    };

    void hydrateSnapshot();

    const disposeRealtime = apiClient.onRealtimeEvents(user.token, {
      onCompetitionState: (competition) => setCompetition(competition),
      onQuestion: (question) => resetQuestionState(question),
      onLeaderboard: (leaderboard) => setLeaderboard(leaderboard),
      onRunResult: (runResult) => {
        setRunResult(runResult);
        setIsRunning(false);
        setPendingRunSubmissionId(null);
      },
      onSubmissionResult: (submissionResult) => {
        setSubmissionResult(submissionResult);
        setIsSubmitting(false);
        setPendingSubmitSubmissionId(null);
      },
      onSessionEnded: () => {
        clearSession();
        router.replace("/");
      },
    });

    const disposeLifecycle = onSocketLifecycle({
      onConnected: () => {
        setConnectionStatus("connected");
        void hydrateSnapshot();
      },
      onReconnecting: () => setConnectionStatus("reconnecting"),
      onDisconnected: () => setConnectionStatus("disconnected"),
    });

    return () => {
      disposed = true;
      disposeRealtime();
      disposeLifecycle();
    };
  }, [
    clearSession,
    resetQuestionState,
    router,
    setCompetition,
    setConnectionStatus,
    setLeaderboard,
    setIsRunning,
    setIsSubmitting,
    setPendingRunSubmissionId,
    setPendingSubmitSubmissionId,
    setRunResult,
    setSubmissionResult,
    user?.token,
  ]);

  return user;
}
