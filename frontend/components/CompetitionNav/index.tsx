"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import styles from "./CompetitionNav.module.css";

export function CompetitionNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Competition navigation">
      <Link href="/compete" className={clsx(styles.link, pathname === "/compete" && styles.active)}>
        Compete
      </Link>
      <Link href="/leaderboard" className={clsx(styles.link, pathname === "/leaderboard" && styles.active)}>
        Leaderboard
      </Link>
    </nav>
  );
}
