"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import { HeaderBar } from "@/components/HeaderBar";
import { apiClient } from "@/lib/api/client";
import { useAppStore } from "@/lib/store/useAppStore";
import type { RoundStatus } from "@/lib/types";
import styles from "./page.module.css";

const navItems = ["Overview", "Round 1", "Round 2", "Round 3", "Teams", "Questions"];

export default function AdminPage() {
  const [activeNav, setActiveNav] = useState(navItems[0]);
  const [busy, setBusy] = useState(false);

  const competition = useAppStore((state) => state.competition);
  const connectionStatus = useAppStore((state) => state.connectionStatus);
  const setCompetition = useAppStore((state) => state.setCompetition);
  const user = useAppStore((state) => state.user);

  const stateLabel = useMemo<RoundStatus>(() => competition?.status ?? "IDLE", [competition?.status]);

  const startRound = async () => {
    setBusy(true);
    try {
      await apiClient.startRound(user?.token ?? "mock-admin-token", competition?.round ?? 1);
      setCompetition({
        ...(competition ?? {
          round: 1,
          status: "IDLE",
          questionIndex: 1,
          totalQuestions: 10,
          roundEndsAt: null,
          questionEndsAt: null,
          nextQuestionAt: null,
        }),
        status: "ACTIVE",
      });
    } finally {
      setBusy(false);
    }
  };

  const pauseRound = () => {
    setCompetition(
      competition
        ? {
            ...competition,
            status: "PAUSED",
          }
        : null,
    );
  };

  return (
    <div className={styles.page}>
      <HeaderBar left={<BrandLogo href="/admin" compact />} right={<ConnectionStatusBadge status={connectionStatus} />} />

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <BrandLogo href="/admin" compact={false} />
          <nav className={styles.nav}>
            {navItems.map((item) => (
              <button
                key={item}
                onClick={() => setActiveNav(item)}
                className={clsx(
                  styles.navButton,
                  activeNav === item && styles.navActive,
                )}
              >
                {item}
              </button>
            ))}
          </nav>
        </aside>

        <main className={styles.main}>
          <h1 className={styles.pageTitle}>Admin Dashboard</h1>

          <section className={styles.card}>
            <p className={styles.cardLabel}>Current Round State</p>
            <div className={styles.stateRow}>
              <span className={styles.stateBadge}>{stateLabel}</span>
              <span className={styles.roundBadge}>Round {competition?.round ?? 1}</span>
            </div>

            <div className={styles.actions}>
              <button
                onClick={startRound}
                disabled={busy}
                className={styles.start}
              >
                {busy ? "Starting..." : "Start Round"}
              </button>
              <button
                onClick={pauseRound}
                className={styles.pause}
              >
                Pause
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
