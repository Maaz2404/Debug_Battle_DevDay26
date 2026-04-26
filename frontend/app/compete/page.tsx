"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { CodeEditor } from "@/components/CodeEditor";
import { CompetitionNav } from "@/components/CompetitionNav";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import { HeaderBar } from "@/components/HeaderBar";
import { LogoutButton } from "@/components/LogoutButton";
import { QuestionPanel } from "@/components/QuestionPanel";
import { TestResults } from "@/components/TestResults";
import { Timer } from "@/components/Timer";
import { useLogout } from "@/hooks/useLogout";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/http";
import { useAppStore } from "@/lib/store/useAppStore";
import type { Language } from "@/lib/types";
import styles from "./page.module.css";

const languageOptions: Language[] = ["javascript", "python", "cpp"];

function formatClock(endsAt: number | null, now: number) {
  if (!endsAt) {
    return "00:00";
  }

  const total = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const minutes = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(total % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function getRunErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "Run is not allowed right now. Wait for the active question window.";
    }
    if (error.status === 409) {
      return "Round or question state changed. Refreshing state and retry run.";
    }
    if (error.status === 429) {
      return "Too many requests. Please wait a moment and run again.";
    }
    return error.message || "Run failed due to a server error.";
  }

  if (error instanceof Error && /timed out waiting/i.test(error.message)) {
    return "Run result timed out. Check connection and retry.";
  }

  return "Run failed. Please retry.";
}

function getSubmitErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "Submit blocked: pass Run first for this question.";
    }
    if (error.status === 409) {
      return "Question window changed. Submit is no longer valid for this question.";
    }
    if (error.status === 429) {
      return "Duplicate or too-frequent submit detected. Please wait and try again.";
    }
    return error.message || "Submission failed due to a server error.";
  }

  if (error instanceof Error && /timed out waiting/i.test(error.message)) {
    return "Submission result timed out. Check connection and retry.";
  }

  return "Submission failed. Please retry.";
}

export default function CompetePage() {
  const router = useRouter();
  const user = useRequireAuth();
  const { logout, loggingOut } = useLogout();
  const [now, setNow] = useState(() => Date.now());
  const [showAcceptedPopup, setShowAcceptedPopup] = useState(false);

  const {
    competition,
    currentQuestion,
    connectionStatus,
    language,
    codeDraft,
    runResult,
    submissionResult,
    isRunning,
    isSubmitting,
    pendingRunSubmissionId,
    pendingSubmitSubmissionId,
    showThirtySecondWarning,
    setRunResult,
    setSubmissionResult,
    setLanguage,
    setCodeDraft,
    setIsRunning,
    setIsSubmitting,
    setPendingRunSubmissionId,
    setPendingSubmitSubmissionId,
    setThirtySecondWarning,
  } = useAppStore((state) => state);

  useEffect(() => {
    if (competition?.status !== "ACTIVE") {
      router.replace("/lobby");
    }
  }, [competition?.status, router]);

  useEffect(() => {
    if (!showThirtySecondWarning) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setThirtySecondWarning(false);
    }, 3500);

    return () => window.clearTimeout(timeout);
  }, [setThirtySecondWarning, showThirtySecondWarning]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!submissionResult || submissionResult.verdict !== "ACCEPTED") {
      return;
    }

    setShowAcceptedPopup(true);
    const timeout = window.setTimeout(() => {
      setShowAcceptedPopup(false);
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [currentQuestion?.id, submissionResult]);

  useEffect(() => {
    if (connectionStatus !== "disconnected") {
      return;
    }

    if (!pendingRunSubmissionId && !pendingSubmitSubmissionId) {
      return;
    }

    let disposed = false;

    const timeout = window.setTimeout(() => {
      void (async () => {
        if (disposed) {
          return;
        }

        if (pendingRunSubmissionId) {
          let recovered = false;
          if (user?.token) {
            try {
              const result = await apiClient.recoverRunResult(user.token, pendingRunSubmissionId);
              if (!disposed && result) {
                setRunResult(result);
                recovered = true;
              }
            } catch {
              recovered = false;
            }
          }

          if (!disposed) {
            setPendingRunSubmissionId(null);
            setIsRunning(false);
            if (!recovered) {
              setRunResult({
                passed: false,
                output: "",
                error: "Connection lost while waiting for run result. Please run again.",
                testCases: [],
              });
            }
          }
        }

        if (pendingSubmitSubmissionId) {
          let recovered = false;
          if (user?.token) {
            try {
              const result = await apiClient.recoverSubmissionResult(user.token, pendingSubmitSubmissionId);
              if (!disposed && result) {
                setSubmissionResult(result);
                recovered = true;
              }
            } catch {
              recovered = false;
            }
          }

          if (!disposed) {
            setPendingSubmitSubmissionId(null);
            setIsSubmitting(false);
            if (!recovered) {
              setSubmissionResult({
                verdict: "RUNTIME_ERROR",
                scoreDelta: 0,
                message: "Connection lost while waiting for submission result. Please submit again.",
              });
            }
          }
        }
      })();
    }, 4000);

    return () => {
      disposed = true;
      window.clearTimeout(timeout);
    };
  }, [
    connectionStatus,
    pendingRunSubmissionId,
    pendingSubmitSubmissionId,
    user?.token,
    setIsRunning,
    setIsSubmitting,
    setPendingRunSubmissionId,
    setPendingSubmitSubmissionId,
    setRunResult,
    setSubmissionResult,
  ]);

  const isGapPhase = competition?.phase === "gap";
  const isAcceptedForQuestion = submissionResult?.verdict === "ACCEPTED";

  const handleRun = useCallback(async () => {
    if (!user?.token || !currentQuestion || isGapPhase || isAcceptedForQuestion) {
      return;
    }

    setIsRunning(true);
    setRunResult(null);
    setPendingRunSubmissionId(null);

    try {
      const { submissionId } = await apiClient.requestRun(user.token, {
        questionId: currentQuestion.id,
        language,
        code: codeDraft,
      });

      setPendingRunSubmissionId(submissionId);
      const result = await apiClient.waitForRunResult(submissionId);
      setRunResult(result);
    } catch (error) {
      setRunResult({
        passed: false,
        output: "",
        error: getRunErrorMessage(error),
        testCases: [],
      });
    } finally {
      setPendingRunSubmissionId(null);
      setIsRunning(false);
    }
  }, [
    codeDraft,
    currentQuestion,
    isAcceptedForQuestion,
    isGapPhase,
    language,
    setIsRunning,
    setPendingRunSubmissionId,
    setRunResult,
    user?.token,
  ]);

  const canSubmit = useMemo(
    () => !!runResult?.passed && !isRunning && !isSubmitting && !isAcceptedForQuestion && !isGapPhase,
    [isAcceptedForQuestion, isGapPhase, isRunning, isSubmitting, runResult?.passed],
  );

  const handleSubmit = useCallback(async () => {
    if (!user?.token || !currentQuestion || !canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setPendingSubmitSubmissionId(null);

    try {
      const { submissionId } = await apiClient.requestSubmit(user.token, {
        questionId: currentQuestion.id,
        language,
        code: codeDraft,
      });

      setPendingSubmitSubmissionId(submissionId);
      const result = await apiClient.waitForSubmissionResult(submissionId);
      setSubmissionResult(result);
    } catch (error) {
      setSubmissionResult({
        verdict: "RUNTIME_ERROR",
        scoreDelta: 0,
        message: getSubmitErrorMessage(error),
      });
    } finally {
      setPendingSubmitSubmissionId(null);
      setIsSubmitting(false);
    }
  }, [
    canSubmit,
    codeDraft,
    currentQuestion,
    language,
    setIsSubmitting,
    setPendingSubmitSubmissionId,
    setSubmissionResult,
    user?.token,
  ]);

  return (
    <div className={styles.page}>
      <HeaderBar
        left={<BrandLogo href="/compete" compact withImage />}
        center={
          <div className={styles.headerCenter}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Round {competition?.round ?? 1}</p>
              <p className={styles.statValue}>{formatClock(competition?.roundEndsAt ?? null, now)}</p>
            </div>

            <div className={styles.statCard}>
              <p className={styles.statLabel}>Question</p>
              <p className={styles.statValue}>
                {competition?.questionIndex ?? 1}/{competition?.totalQuestions ?? 10}
              </p>
            </div>

            <div className={styles.statCard}>
              <p className={styles.statLabel}>Team</p>
              <p className={styles.statValue}>{user?.teamCode ?? "DEMO"}</p>
            </div>
          </div>
        }
        right={
          <div className={styles.headerRight}>
            <ConnectionStatusBadge status={connectionStatus} />
            <LogoutButton className={styles.logoutButton} onClick={logout} loading={loggingOut} />
            <CompetitionNav />
          </div>
        }
      />

      {showThirtySecondWarning ? (
        <div className={styles.warningWrap}>
          <div className={styles.warning}>
            30 second warning: wrap up and prepare for the next question.
          </div>
        </div>
      ) : null}

      {showAcceptedPopup ? (
        <div className={styles.acceptedPopupWrap}>
          <div className={styles.acceptedPopup}>
            <p className={styles.acceptedPopupLabel}>Submission Accepted</p>
            <p className={styles.acceptedPopupText}>Your submission was accepted.</p>
          </div>
        </div>
      ) : null}

      {isGapPhase && competition?.nextQuestionAt ? (
        <div className={styles.waitingPopupWrap}>
          <div className={styles.waitingPopup}>
            <p className={styles.waitingPopupLabel}>Waiting Time</p>
            <p className={styles.waitingPopupValue}>{formatClock(competition.nextQuestionAt, now)}</p>
            <p className={styles.waitingPopupText}>Question time ended. Next question starts soon.</p>
          </div>
        </div>
      ) : null}

      <main className={styles.mainGrid}>
        <div className={styles.leftCol}>
          <section className={styles.questionTimeCard}>
            <p className={styles.questionTimeLabel}>Question Time</p>
            <Timer label="Question" endsAt={competition?.questionEndsAt ?? null} onWarning={() => setThirtySecondWarning(true)} />
          </section>

          <QuestionPanel question={currentQuestion} />
        </div>

        <section className={styles.editorCard}>
          <div className={styles.editorTop}>
            <p className={styles.editorLabel}>Editor</p>
            <div className={styles.controls}>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value as Language)}
                className={styles.select}
              >
                {languageOptions.map((option) => (
                  <option key={option} value={option}>
                    {option.toUpperCase()}
                  </option>
                ))}
              </select>

              <button
                onClick={handleRun}
                disabled={isRunning || isSubmitting || !currentQuestion || isAcceptedForQuestion || isGapPhase}
                className={styles.run}
              >
                {isRunning ? "Running..." : "Run"}
              </button>

              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={styles.submit}
              >
                {isSubmitting ? "Submitting..." : (isAcceptedForQuestion ? "Accepted" : "Submit")}
              </button>
            </div>
          </div>

          <CodeEditor language={language} code={codeDraft} disabled={isRunning || isSubmitting} onChange={setCodeDraft} />
          <TestResults runResult={runResult} submissionResult={submissionResult} />
        </section>
      </main>
    </div>
  );
}
