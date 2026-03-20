"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { CodeEditor } from "@/components/CodeEditor";
import { CompetitionNav } from "@/components/CompetitionNav";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import { HeaderBar } from "@/components/HeaderBar";
import { QuestionPanel } from "@/components/QuestionPanel";
import { TestResults } from "@/components/TestResults";
import { Timer } from "@/components/Timer";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { apiClient } from "@/lib/api/client";
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

export default function CompetePage() {
  const router = useRouter();
  const user = useRequireAuth();
  const [now, setNow] = useState(() => Date.now());

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
    showThirtySecondWarning,
    setRunResult,
    setSubmissionResult,
    setLanguage,
    setCodeDraft,
    setIsRunning,
    setIsSubmitting,
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

  const handleRun = useCallback(async () => {
    if (!user?.token || !currentQuestion) {
      return;
    }

    setIsRunning(true);
    setRunResult(null);

    try {
      const result = await apiClient.runCode(user.token, {
        questionId: currentQuestion.id,
        language,
        code: codeDraft,
      });
      setRunResult(result);
    } catch {
      setRunResult({
        passed: false,
        output: "",
        error: "Run failed. Please retry.",
        testCases: [],
      });
    } finally {
      setIsRunning(false);
    }
  }, [codeDraft, currentQuestion, language, setIsRunning, setRunResult, user?.token]);

  const canSubmit = useMemo(() => !!runResult?.passed && !isRunning && !isSubmitting, [isRunning, isSubmitting, runResult?.passed]);

  const handleSubmit = useCallback(async () => {
    if (!user?.token || !currentQuestion || !canSubmit) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await apiClient.submitCode(user.token, {
        questionId: currentQuestion.id,
        language,
        code: codeDraft,
      });
      setSubmissionResult(result);
    } catch {
      setSubmissionResult({
        verdict: "RUNTIME_ERROR",
        scoreDelta: 0,
        message: "Submission failed. Please retry.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, codeDraft, currentQuestion, language, setIsSubmitting, setSubmissionResult, user?.token]);

  return (
    <div className={styles.page}>
      <HeaderBar
        left={<BrandLogo href="/compete" compact />}
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
                disabled={isRunning || isSubmitting || !currentQuestion}
                className={styles.run}
              >
                {isRunning ? "Running..." : "Run"}
              </button>

              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={styles.submit}
              >
                {isSubmitting ? "Submitting..." : "Submit"}
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
