import clsx from "clsx";
import type { RunResult, SubmissionResult } from "@/lib/types";
import styles from "./TestResults.module.css";

interface TestResultsProps {
  runResult: RunResult | null;
  submissionResult: SubmissionResult | null;
}

export function TestResults({ runResult, submissionResult }: TestResultsProps) {
  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Test Results</h3>
        {runResult ? (
          <span
            className={clsx(
              styles.badge,
              runResult.passed ? styles.passed : styles.failed,
            )}
          >
            {runResult.passed ? "RUN PASSED" : "RUN FAILED"}
          </span>
        ) : null}
      </div>

      {!runResult ? <p className={styles.empty}>Run your code to see testcase diagnostics.</p> : null}

      {runResult?.error ? <p className={styles.caseText}>{runResult.error}</p> : null}
      {runResult?.output ? <p className={styles.caseText}>{runResult.output}</p> : null}

      {runResult?.testCases.map((test) => (
        <div key={test.id} className={styles.case}>
          <div className={styles.caseLabel}>{test.label}</div>
          <div className={test.passed ? styles.casePass : styles.caseFail}>{test.passed ? "PASS" : "FAIL"}</div>
          <div className={styles.caseText}>Expected: {test.expected}</div>
          <div className={styles.caseText}>Actual: {test.actual}</div>
        </div>
      ))}

      {submissionResult ? (
        <div className={styles.verdict}>
          <p className={styles.verdictTitle}>Submission Verdict: {submissionResult.verdict}</p>
          <p>{submissionResult.message}</p>
          <p>Score +{submissionResult.scoreDelta}</p>
        </div>
      ) : null}
    </section>
  );
}
