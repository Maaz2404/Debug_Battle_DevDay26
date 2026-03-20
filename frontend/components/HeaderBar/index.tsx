import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import styles from "./HeaderBar.module.css";

const ThemeToggle = dynamic(() => import("@/components/ThemeToggle").then((mod) => mod.ThemeToggle), {
  ssr: false,
});

interface HeaderBarProps {
  left: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
}

export function HeaderBar({ left, center, right }: HeaderBarProps) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.left}>{left}</div>
        <div className={styles.center}>{center}</div>
        <div className={styles.right}>
          {right}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
