"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import { CountdownOverlay } from "@/components/CountdownOverlay";
import { HeaderBar } from "@/components/HeaderBar";
import { LogoutButton } from "@/components/LogoutButton";
import { useLogout } from "@/hooks/useLogout";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { REAL_BACKEND_ENABLED } from "@/lib/config/runtime";
import { useAppStore } from "@/lib/store/useAppStore";
import styles from "./page.module.css";

function formatTimeUntil(timestamp: number | null, now: number) {
  if (!timestamp) {
    return "TBA";
  }

  const seconds = Math.max(0, Math.ceil((timestamp - now) / 1000));
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remainingSeconds = (seconds % 60).toString().padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
}

export default function LobbyPage() {
  const router = useRouter();
  const user = useRequireAuth();
  const [now, setNow] = useState(() => Date.now());
  const { logout, loggingOut } = useLogout();
  const competition = useAppStore((state) => state.competition);
  const connectionStatus = useAppStore((state) => state.connectionStatus);
  const countdownValue = useAppStore((state) => state.countdownValue);
  const setCountdownValue = useAppStore((state) => state.setCountdownValue);
  const setCompetition = useAppStore((state) => state.setCompetition);

  useEffect(() => {
    if (competition?.status === "ACTIVE") {
      router.replace("/compete");
    }
  }, [competition?.status, router]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (REAL_BACKEND_ENABLED) {
      return;
    }

    if (!competition || competition.status !== "IDLE" || !competition.nextQuestionAt) {
      return;
    }

    if (now < competition.nextQuestionAt) {
      return;
    }

    setCompetition({
      ...competition,
      status: "ACTIVE",
      questionEndsAt: Date.now() + Number(process.env.NEXT_PUBLIC_DEMO_QUESTION_MINUTES ?? "3") * 60 * 1000,
      nextQuestionAt: null,
    });
    router.replace("/compete");
  }, [competition, now, router, setCompetition]);

  useEffect(() => {
    if (countdownValue === null) {
      return;
    }

    if (countdownValue <= 1) {
      const timeout = window.setTimeout(() => {
        setCountdownValue(null);
        router.replace("/compete");
      }, 750);

      return () => window.clearTimeout(timeout);
    }

    const timer = window.setTimeout(() => {
      setCountdownValue(countdownValue - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdownValue, router, setCountdownValue]);

  return (
    <div className={styles.page}>
      <HeaderBar
        left={<BrandLogo href="/lobby" compact />}
        right={(
          <div className={styles.headerActions}>
            <ConnectionStatusBadge status={connectionStatus} />
            <LogoutButton className={styles.logoutButton} onClick={logout} loading={loggingOut} />
          </div>
        )}
      />

      <main className={styles.main}>
        <section className={styles.panel}>
          <p className={styles.welcome}>Welcome {user?.participantName}</p>
          <h1 className={styles.title}>Waiting for admin to start <br />Round {competition?.round ?? 1}</h1>
          <p className={styles.subtitle}>Get ready. Questions will stream live and your rank updates in real time.</p>

          <div className={styles.dots}>
            <div className={styles.dot1} />
            <div className={styles.dot2} />
            <div className={styles.dot3} />
          </div>

          <p className={styles.nextRound}>
            Time to next round: <span className={styles.nextRoundValue}>{formatTimeUntil(competition?.nextQuestionAt ?? null, now)}</span>
          </p>
        </section>
      </main>

      <CountdownOverlay value={countdownValue} />
    </div>
  );
}
