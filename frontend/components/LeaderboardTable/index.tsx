"use client";

import { motion } from "framer-motion";
import clsx from "clsx";
import type { LeaderboardEntry } from "@/lib/types";
import styles from "./LeaderboardTable.module.css";

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  fullscreen?: boolean;
}

export function LeaderboardTable({ entries, fullscreen }: LeaderboardTableProps) {
  const formatScore = (value: number | null) => (typeof value === "number" ? value : "-");

  const defaultRoundLayout = [1, 2, 3].map((roundNumber) => ({
    roundNumber,
    questionCount: 10,
  }));

  const roundLayout = (() => {
    if (entries.length === 0) {
      return defaultRoundLayout;
    }

    const derived = Array.from(
      entries.reduce((map, entry) => {
        for (const round of entry.rounds) {
          const existing = map.get(round.roundNumber) || 0;
          map.set(round.roundNumber, Math.max(existing, round.questions.length || 0));
        }
        return map;
      }, new Map<number, number>()),
    )
      .sort((a, b) => a[0] - b[0])
      .map(([roundNumber, questionCount]) => ({
        roundNumber,
        questionCount: Math.max(1, questionCount),
      }));

    return derived.length > 0 ? derived : defaultRoundLayout;
  })();

  const totalQuestionColumns = roundLayout.reduce((sum, item) => sum + item.questionCount, 0);

  return (
    <div className={clsx(styles.wrap, fullscreen && styles.fullscreen)}>
      <table className={styles.table}>
        <thead className={styles.head}>
          <tr>
            <th className={clsx(styles.cellHead, styles.stickyRankHead)} rowSpan={2}>Rank</th>
            <th className={clsx(styles.cellHead, styles.stickyTeamHead)} rowSpan={2}>Team</th>
            {roundLayout.map((round) => (
              <th key={`round-${round.roundNumber}`} className={styles.cellHeadCenter} colSpan={round.questionCount}>
                R{round.roundNumber}
              </th>
            ))}
            <th className={styles.cellHeadRight} rowSpan={2}>Total</th>
          </tr>
          <tr>
            {roundLayout.flatMap((round) => (
              Array.from({ length: round.questionCount }, (_, index) => (
                <th key={`r${round.roundNumber}-q${index + 1}`} className={styles.cellHeadTiny}>
                  Q{index + 1}
                </th>
              ))
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <motion.tr
              key={entry.teamId}
              layout
              transition={{ type: "spring", stiffness: 220, damping: 28 }}
              className={clsx(
                styles.row,
                entry.rank === 1 && styles.rowFirst,
                entry.rank === 2 && styles.rowSecond,
                entry.rank === 3 && styles.rowThird,
              )}
            >
              <td className={clsx(styles.rank, styles.stickyRankCell)}>#{entry.rank}</td>
              <td className={clsx(styles.team, styles.stickyTeamCell)}>{entry.teamName}</td>
              {roundLayout.flatMap((round) => {
                const roundData = entry.rounds.find((item) => item.roundNumber === round.roundNumber);
                const orderedQuestions = [...(roundData?.questions || [])].sort((a, b) => Number(a.position) - Number(b.position));
                const hasZeroBasedPositions = Boolean(
                  roundData?.questions.some((item) => Number(item.position) === 0),
                );
                return Array.from({ length: round.questionCount }, (_, index) => {
                  const targetPosition = hasZeroBasedPositions ? index : (index + 1);
                  const byPosition = roundData?.questions.find((item) => Number(item.position) === targetPosition);
                  const question = byPosition || orderedQuestions[index];
                  return (
                    <td key={`${entry.teamId}-r${round.roundNumber}-q${index + 1}`} className={styles.scoreCompact}>
                      {formatScore(question?.score ?? null)}
                    </td>
                  );
                });
              })}
              <td className={styles.total}>{entry.total}</td>
            </motion.tr>
          ))}
          {entries.length === 0 ? (
            <tr className={styles.row}>
              <td className={styles.empty} colSpan={2 + totalQuestionColumns + 1}>No leaderboard data yet.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
