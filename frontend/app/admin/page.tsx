"use client";

import clsx from "clsx";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import { HeaderBar } from "@/components/HeaderBar";
import { apiClient, type AdminRoundInfo } from "@/lib/api/client";
import { ApiError } from "@/lib/api/http";
import { useAppStore } from "@/lib/store/useAppStore";
import type { RoundStatus } from "@/lib/types";
import styles from "./page.module.css";

const navItems = ["Overview", "Round 1", "Round 2", "Round 3", "Teams", "Questions"];

function parseRoundFromNav(value: string) {
  const match = value.match(/^Round\s+(\d+)$/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

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

export default function AdminPage() {
  const [activeNav, setActiveNav] = useState(navItems[0]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [startInSeconds, setStartInSeconds] = useState(10);
  const [roundPanels, setRoundPanels] = useState<AdminRoundInfo[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const competition = useAppStore((state) => state.competition);
  const connectionStatus = useAppStore((state) => state.connectionStatus);
  const setCompetition = useAppStore((state) => state.setCompetition);
  const resetQuestionState = useAppStore((state) => state.resetQuestionState);
  const setUser = useAppStore((state) => state.setUser);
  const user = useAppStore((state) => state.user);
  const isAdmin = Boolean(user?.isAdmin);

  const stateLabel = useMemo<RoundStatus>(() => competition?.status ?? "IDLE", [competition?.status]);
  const selectedRound = useMemo(() => parseRoundFromNav(activeNav), [activeNav]);
  const selectedRoundNumber = selectedRound ?? (competition?.round ?? 1);
  const isRoundTab = selectedRound !== null;

  const selectedRoundInfo = useMemo(() => (
    roundPanels.find((entry) => entry.round_number === selectedRoundNumber)
  ), [roundPanels, selectedRoundNumber]);

  const selectedRoundStatus = useMemo<RoundStatus>(() => {
    if (selectedRoundInfo?.status) {
      return selectedRoundInfo.status;
    }

    if (competition?.round === selectedRoundNumber) {
      return stateLabel;
    }

    return "IDLE";
  }, [competition?.round, selectedRoundInfo?.status, selectedRoundNumber, stateLabel]);

  const hasBlockingActiveRound = useMemo(() => (
    roundPanels.some((entry) => (
      entry.round_number !== selectedRoundNumber && (entry.status === "ACTIVE" || entry.status === "PAUSED")
    ))
  ), [roundPanels, selectedRoundNumber]);

  const remainingSeconds = useMemo(() => {
    if (!competition?.roundEndsAt) {
      return 0;
    }
    return Math.max(0, Math.ceil((competition.roundEndsAt - now) / 1000));
  }, [competition?.roundEndsAt, now]);

  const selectedRoundRemainingSeconds = useMemo(() => {
    if (competition?.round !== selectedRoundNumber) {
      return 0;
    }
    return remainingSeconds;
  }, [competition?.round, remainingSeconds, selectedRoundNumber]);

  const isRoundScheduled = useMemo(() => (
    selectedRoundStatus === "IDLE"
    && competition?.round === selectedRoundNumber
    && Boolean(competition?.nextQuestionAt)
    && (competition?.nextQuestionAt ?? 0) > now
  ), [competition?.nextQuestionAt, competition?.round, now, selectedRoundNumber, selectedRoundStatus]);

  const scheduledStartInSeconds = useMemo(() => {
    if (!competition?.nextQuestionAt) {
      return 0;
    }
    return Math.max(0, Math.ceil((competition.nextQuestionAt - now) / 1000));
  }, [competition?.nextQuestionAt, now]);

  const canStart = isAdmin && !busy && selectedRoundStatus === "IDLE" && !isRoundScheduled && !hasBlockingActiveRound;
  const canPause = isAdmin
    && !busy
    && selectedRoundStatus === "ACTIVE"
    && competition?.round === selectedRoundNumber
    && selectedRoundRemainingSeconds > 0;
  const canResume = isAdmin
    && !busy
    && selectedRoundStatus === "PAUSED"
    && competition?.round === selectedRoundNumber
    && selectedRoundRemainingSeconds > 0;
  const canEnd = isAdmin
    && !busy
    && (selectedRoundStatus === "ACTIVE" || selectedRoundStatus === "PAUSED")
    && competition?.round === selectedRoundNumber
    && selectedRoundRemainingSeconds > 0;
  const canReset = isAdmin && !busy && selectedRoundStatus === "ENDED";

  const getStartDisabledReason = () => {
    if (canStart) {
      return null;
    }
    if (!isAdmin) {
      return "Sign in as admin to start the round.";
    }
    if (busy) {
      return "Another admin action is in progress.";
    }
    if (hasBlockingActiveRound) {
      return "Another round is currently ACTIVE or PAUSED. End it before starting this round.";
    }
    if (isRoundScheduled) {
      return `Round ${selectedRoundNumber} is already scheduled to start in ${scheduledStartInSeconds}s.`;
    }
    return `Start is only available when Round ${selectedRoundNumber} is IDLE.`;
  };

  const getPauseDisabledReason = () => {
    if (canPause) {
      return null;
    }
    if (!isAdmin) {
      return "Sign in as admin to pause the round.";
    }
    if (busy) {
      return "Another admin action is in progress.";
    }
    if (competition?.round !== selectedRoundNumber) {
      return `Pause is only available on the currently active round (${competition?.round ?? "-"}).`;
    }
    if (selectedRoundStatus !== "ACTIVE") {
      return "Pause is only available while selected round status is ACTIVE.";
    }
    return "Cannot pause when timer has reached 00:00.";
  };

  const getResumeDisabledReason = () => {
    if (canResume) {
      return null;
    }
    if (!isAdmin) {
      return "Sign in as admin to resume the round.";
    }
    if (busy) {
      return "Another admin action is in progress.";
    }
    if (competition?.round !== selectedRoundNumber) {
      return `Resume is only available on the currently paused round (${competition?.round ?? "-"}).`;
    }
    if (selectedRoundStatus !== "PAUSED") {
      return "Resume is only available while selected round status is PAUSED.";
    }
    return "Cannot resume when no time remains.";
  };

  const getEndDisabledReason = () => {
    if (canEnd) {
      return null;
    }
    if (!isAdmin) {
      return "Sign in as admin to end the round.";
    }
    if (busy) {
      return "Another admin action is in progress.";
    }
    if (competition?.round !== selectedRoundNumber) {
      return `End is only available on the currently running round (${competition?.round ?? "-"}).`;
    }
    if (selectedRoundStatus !== "ACTIVE" && selectedRoundStatus !== "PAUSED") {
      return "End is only available while selected round status is ACTIVE or PAUSED.";
    }
    return "Cannot end when timer has reached 00:00.";
  };

  const getResetDisabledReason = () => {
    if (canReset) {
      return null;
    }
    if (!isAdmin) {
      return "Sign in as admin to reset the round.";
    }
    if (busy) {
      return "Another admin action is in progress.";
    }
    return "Reset is available only when selected round status is ENDED.";
  };

  const startDisabledReason = getStartDisabledReason();
  const pauseDisabledReason = getPauseDisabledReason();
  const resumeDisabledReason = getResumeDisabledReason();
  const endDisabledReason = getEndDisabledReason();
  const resetDisabledReason = getResetDisabledReason();

  const getAdminActionErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof ApiError) {
      if (error.status === 403) {
        return "Admin privileges are required for this action.";
      }
      if (error.status === 409) {
        return error.message;
      }
    }
    return error instanceof Error ? error.message : fallback;
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isAdmin || !user?.token) {
      return;
    }

    let disposed = false;

    const syncState = () => {
      Promise.all([
        apiClient.getState(user.token),
        apiClient.getAdminRounds(user.token),
      ])
        .then(([snapshot, rounds]) => {
          if (!disposed) {
            setCompetition(snapshot.competition);
            setRoundPanels(rounds);
          }
        })
        .catch(() => {
          if (!disposed) {
            setActionError("Failed to refresh round state from server.");
          }
        });
    };

    syncState();
    const refresh = window.setInterval(syncState, 2000);

    return () => {
      disposed = true;
      window.clearInterval(refresh);
    };
  }, [isAdmin, setCompetition, user?.token]);

  const handleAdminLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password) {
      setAuthError("Email and password are required.");
      return;
    }

    setBusy(true);
    setAuthError(null);
    try {
      const response = await apiClient.loginAdmin(email.trim(), password);
      setUser(response.session);
      setCompetition(response.competition);
      resetQuestionState(response.currentQuestion);
      const rounds = await apiClient.getAdminRounds(response.session.token);
      setRoundPanels(rounds);
      setPassword("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Admin login failed.");
    } finally {
      setBusy(false);
    }
  };

  const startRound = async () => {
    if (!canStart) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      await apiClient.startRound(
        user?.token ?? "mock-admin-token",
        selectedRoundNumber,
        startInSeconds,
      );
      if (user?.token) {
        const [snapshot, rounds] = await Promise.all([
          apiClient.getState(user.token),
          apiClient.getAdminRounds(user.token),
        ]);
        setCompetition(snapshot.competition);
        setRoundPanels(rounds);
      }
    } catch (error) {
      setActionError(getAdminActionErrorMessage(error, "Failed to start round."));
    } finally {
      setBusy(false);
    }
  };

  const pauseRound = async () => {
    if (!canPause) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      await apiClient.pauseRound(user?.token ?? "", selectedRoundNumber);
      if (user?.token) {
        const [snapshot, rounds] = await Promise.all([
          apiClient.getState(user.token),
          apiClient.getAdminRounds(user.token),
        ]);
        setCompetition(snapshot.competition);
        setRoundPanels(rounds);
      }
    } catch (error) {
      setActionError(getAdminActionErrorMessage(error, "Failed to pause round."));
    } finally {
      setBusy(false);
    }
  };

  const resumeRound = async () => {
    if (!canResume) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      await apiClient.resumeRound(user?.token ?? "", selectedRoundNumber);
      if (user?.token) {
        const [snapshot, rounds] = await Promise.all([
          apiClient.getState(user.token),
          apiClient.getAdminRounds(user.token),
        ]);
        setCompetition(snapshot.competition);
        setRoundPanels(rounds);
      }
    } catch (error) {
      setActionError(getAdminActionErrorMessage(error, "Failed to resume round."));
    } finally {
      setBusy(false);
    }
  };

  const endRound = async () => {
    if (!canEnd) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      await apiClient.endRound(user?.token ?? "", selectedRoundNumber);
      if (user?.token) {
        const [snapshot, rounds] = await Promise.all([
          apiClient.getState(user.token),
          apiClient.getAdminRounds(user.token),
        ]);
        setCompetition(snapshot.competition);
        setRoundPanels(rounds);
      }
    } catch (error) {
      setActionError(getAdminActionErrorMessage(error, "Failed to end round."));
    } finally {
      setBusy(false);
    }
  };

  const resetRound = async () => {
    if (!canReset) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      await apiClient.resetRound(user?.token ?? "", selectedRoundNumber);
      if (user?.token) {
        const [snapshot, rounds] = await Promise.all([
          apiClient.getState(user.token),
          apiClient.getAdminRounds(user.token),
        ]);
        setCompetition(snapshot.competition);
        setRoundPanels(rounds);
      }
    } catch (error) {
      setActionError(getAdminActionErrorMessage(error, "Failed to reset round."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <HeaderBar left={<BrandLogo href="/admin" compact />} right={<ConnectionStatusBadge status={connectionStatus} />} />

      {!isAdmin ? (
        <main className={styles.main}>
          <section className={styles.card}>
            <p className={styles.cardLabel}>Admin Access</p>
            <h1 className={styles.pageTitle}>Sign in as Admin</h1>
            <form className={styles.adminForm} onSubmit={handleAdminLogin}>
              <label className={styles.fieldLabel} htmlFor="adminEmail">Email</label>
              <input
                id="adminEmail"
                className={styles.fieldInput}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                placeholder="admin@ex.com"
              />

              <label className={styles.fieldLabel} htmlFor="adminPassword">Password</label>
              <input
                id="adminPassword"
                className={styles.fieldInput}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                placeholder="Your admin password"
              />

              {authError ? <p className={styles.authError}>{authError}</p> : null}

              <button type="submit" disabled={busy} className={styles.start}>
                {busy ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </section>
        </main>
      ) : null}

      {isAdmin ? (
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

          {!isRoundTab ? (
          <section className={styles.card}>
            <p className={styles.cardLabel}>Current Round State</p>
            <div className={styles.stateRow}>
              <span className={styles.stateBadge}>{stateLabel}</span>
              <span className={styles.roundBadge}>Round {competition?.round ?? 1}</span>
              <span className={styles.roundBadge}>Time Left {formatClock(competition?.roundEndsAt ?? null, now)}</span>
            </div>

            <p className={styles.roundHint}>Use Round 1, Round 2, or Round 3 tabs for direct control panels.</p>
          </section>
          ) : null}

          {isRoundTab ? (
          <section className={styles.card}>
            <p className={styles.cardLabel}>Round {selectedRoundNumber} Control Panel</p>
            <div className={styles.stateRow}>
              <span className={styles.stateBadge}>{selectedRoundStatus}</span>
              <span className={styles.roundBadge}>Round {selectedRoundNumber}</span>
              <span className={styles.roundBadge}>Time Left {formatClock(competition?.round === selectedRoundNumber ? (competition?.roundEndsAt ?? null) : null, now)}</span>
            </div>

            {actionError ? <p className={styles.authError}>{actionError}</p> : null}

            <div className={styles.adminForm}>
              <label className={styles.fieldLabel} htmlFor="roundStartInSeconds">Start In (seconds)</label>
              <input
                id="roundStartInSeconds"
                className={styles.fieldInput}
                value={startInSeconds}
                onChange={(event) => setStartInSeconds(Math.max(1, Number(event.target.value) || 1))}
                type="number"
                min={1}
                max={600}
                step={1}
              />
            </div>

            <div className={styles.actions}>
              <div className={styles.actionControl}>
                <button
                  onClick={startRound}
                  disabled={!canStart}
                  title={startDisabledReason ?? undefined}
                  className={styles.start}
                >
                  {busy ? "Starting..." : "Start Round"}
                </button>
                {startDisabledReason ? <p className={styles.actionHint}>{startDisabledReason}</p> : null}
              </div>
              <div className={styles.actionControl}>
                <button
                  onClick={pauseRound}
                  disabled={!canPause}
                  title={pauseDisabledReason ?? undefined}
                  className={styles.pause}
                >
                  Pause
                </button>
                {pauseDisabledReason ? <p className={styles.actionHint}>{pauseDisabledReason}</p> : null}
              </div>
              <div className={styles.actionControl}>
                <button
                  onClick={resumeRound}
                  disabled={!canResume}
                  title={resumeDisabledReason ?? undefined}
                  className={styles.start}
                >
                  Resume
                </button>
                {resumeDisabledReason ? <p className={styles.actionHint}>{resumeDisabledReason}</p> : null}
              </div>
              <div className={styles.actionControl}>
                <button
                  onClick={endRound}
                  disabled={!canEnd}
                  title={endDisabledReason ?? undefined}
                  className={styles.pause}
                >
                  End Round
                </button>
                {endDisabledReason ? <p className={styles.actionHint}>{endDisabledReason}</p> : null}
              </div>
              <div className={styles.actionControl}>
                <button
                  onClick={resetRound}
                  disabled={!canReset}
                  title={resetDisabledReason ?? undefined}
                  className={styles.reset}
                >
                  Reset Round
                </button>
                {resetDisabledReason ? <p className={styles.actionHint}>{resetDisabledReason}</p> : null}
              </div>
            </div>
          </section>
          ) : null}
        </main>
      </div>
      ) : null}
    </div>
  );
}
