"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { HeaderBar } from "@/components/HeaderBar";
import { apiClient, createDemoLoginResponse } from "@/lib/api/client";
import { REAL_BACKEND_ENABLED } from "@/lib/config/runtime";
import { useAppStore } from "@/lib/store/useAppStore";
import styles from "./page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const user = useAppStore((state) => state.user);
  const competition = useAppStore((state) => state.competition);
  const clearSession = useAppStore((state) => state.clearSession);
  const setUser = useAppStore((state) => state.setUser);
  const setCompetition = useAppStore((state) => state.setCompetition);
  const resetQuestionState = useAppStore((state) => state.resetQuestionState);

  const [teamCode, setTeamCode] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [errors, setErrors] = useState<{ teamCode?: string; participantName?: string; general?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user?.token) {
      return;
    }

    // If a demo token was persisted previously, drop it in real mode so login page is shown.
    if (REAL_BACKEND_ENABLED && user.token.startsWith("mock-")) {
      clearSession();
      return;
    }

    if (competition?.status === "ACTIVE") {
      router.replace("/compete");
      return;
    }

    router.replace("/lobby");
  }, [clearSession, competition?.status, router, user?.token]);

  const canSubmit = useMemo(() => teamCode.trim().length > 0 && participantName.trim().length > 0, [participantName, teamCode]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: { teamCode?: string; participantName?: string } = {};
    if (!teamCode.trim()) {
      nextErrors.teamCode = "Team code is required.";
    }
    if (!participantName.trim()) {
      nextErrors.participantName = REAL_BACKEND_ENABLED ? "Password is required." : "Your name is required.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      const response = await apiClient.login(teamCode.trim(), participantName.trim());

      setUser(response.session);
      setCompetition(response.competition);
      resetQuestionState(response.currentQuestion);

      if (response.competition.status === "ACTIVE") {
        router.replace("/compete");
      } else {
        router.replace("/lobby");
      }
    } catch (error) {
      setErrors({
        general: error instanceof Error ? error.message : "Login failed. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const enterDemoMode = () => {
    const demo = createDemoLoginResponse();
    setUser(demo.session);
    setCompetition(demo.competition);
    resetQuestionState(demo.currentQuestion);

    if (demo.competition.status === "ACTIVE") {
      router.replace("/compete");
    } else {
      router.replace("/lobby");
    }
  };

  return (
    <div className={styles.page}>
      <HeaderBar left={<BrandLogo href="/" compact />} />

      <section className={styles.card}>
        <BrandLogo compact={false} />

        {!REAL_BACKEND_ENABLED ? (
          <div className={styles.bypassInfo}>Frontend demo mode active. No backend connection is required.</div>
        ) : null}

        <div className={styles.head}>
          <h1 className={styles.title}>Join Competition</h1>
          <p className={styles.subtitle}>
            {REAL_BACKEND_ENABLED
              ? "Enter your team code and password to enter the live coding arena."
              : "Enter your team code and name to enter the live coding arena."}
          </p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.fieldGroup}>
            <label htmlFor="teamCode" className={styles.label}>
              Team Code
            </label>
            <input
              id="teamCode"
              type="text"
              value={teamCode}
              onChange={(event) => setTeamCode(event.target.value)}
              className={styles.input}
              placeholder="e.g. BRAVO-7"
            />
            {errors.teamCode ? <p className={styles.error}>{errors.teamCode}</p> : null}
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="participantName" className={styles.label}>
              {REAL_BACKEND_ENABLED ? "Password" : "Your Name"}
            </label>
            <input
              id="participantName"
              type={REAL_BACKEND_ENABLED ? "password" : "text"}
              value={participantName}
              onChange={(event) => setParticipantName(event.target.value)}
              className={styles.input}
              placeholder={REAL_BACKEND_ENABLED ? "Your team password" : "Your display name"}
            />
            {errors.participantName ? <p className={styles.error}>{errors.participantName}</p> : null}
          </div>

          {errors.general ? <p className={styles.generalError}>{errors.general}</p> : null}

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className={styles.submit}
          >
            {submitting ? "Joining..." : "Join Competition"}
          </button>

          {!REAL_BACKEND_ENABLED ? (
            <button
              type="button"
              onClick={enterDemoMode}
              className={styles.demo}
            >
              Enter Demo Without Login
            </button>
          ) : null}
        </form>

        <div className={styles.adminWrap}>
          <Link href="/admin" className={styles.adminLink}>
            Admin Login
          </Link>
        </div>
      </section>
    </div>
  );
}
