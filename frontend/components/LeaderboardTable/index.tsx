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
  return (
    <div className={clsx(styles.wrap, fullscreen && styles.fullscreen)}>
      <table className={styles.table}>
        <thead className={styles.head}>
          <tr>
            <th className={styles.cellHead}>Rank</th>
            <th className={styles.cellHead}>Team</th>
            <th className={styles.cellHeadRight}>R1</th>
            <th className={styles.cellHeadRight}>R2</th>
            <th className={styles.cellHeadRight}>R3</th>
            <th className={styles.cellHeadRight}>Total</th>
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
              <td className={styles.rank}>#{entry.rank}</td>
              <td className={styles.team}>{entry.teamName}</td>
              <td className={styles.score}>{entry.scores.r1}</td>
              <td className={styles.score}>{entry.scores.r2}</td>
              <td className={styles.score}>{entry.scores.r3}</td>
              <td className={styles.total}>{entry.total}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
