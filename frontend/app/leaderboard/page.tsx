"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { CompetitionNav } from "@/components/CompetitionNav";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import { HeaderBar } from "@/components/HeaderBar";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { LogoutButton } from "@/components/LogoutButton";
import { useLogout } from "@/hooks/useLogout";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAppStore } from "@/lib/store/useAppStore";
import styles from "./page.module.css";

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

function LeaderboardPageContent() {
  const params = useSearchParams();
  const fullscreen = params.get("display") === "fullscreen";
  useRequireAuth();
  const { logout, loggingOut } = useLogout();
  const [now, setNow] = useState(() => Date.now());

  const leaderboard = useAppStore((state) => state.leaderboard);
  const competition = useAppStore((state) => state.competition);
  const user = useAppStore((state) => state.user);
  const connectionStatus = useAppStore((state) => state.connectionStatus);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const title = useMemo(() => (fullscreen ? "LIVE LEADERBOARD" : "Debug Relay Leaderboard"), [fullscreen]);

  return (
    <div className={styles.page}>
      <HeaderBar
        left={<BrandLogo href="/leaderboard" compact />}
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
              <p className={styles.statValue}>{user?.teamCode ?? "PUBLIC"}</p>
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

      <main className={styles.main}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>Live standings update automatically.</p>

        <div className={styles.tableWrap}>
          <LeaderboardTable entries={leaderboard} fullscreen={fullscreen} />
        </div>
      </main>
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<div className={styles.page} />}>
      <LeaderboardPageContent />
    </Suspense>
  );
}
