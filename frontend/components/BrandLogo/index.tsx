import Link from "next/link";
import styles from "./BrandLogo.module.css";

interface BrandLogoProps {
  href?: string;
  compact?: boolean;
}

export function BrandLogo({ href = "/", compact }: BrandLogoProps) {
  return (
    <Link href={href} className={styles.link}>
      <span className={styles.badge}>
        <span className={styles.glow} />
        <span className={styles.letter}>D</span>
      </span>
      {!compact ? (
        <span className={styles.textWrap}>
          <span className={styles.title}>Debug Relay</span>
          <span className={styles.subtitle}>Realtime Code Arena</span>
        </span>
      ) : null}
    </Link>
  );
}
