"use client";

import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./Timer.module.css";

interface TimerProps {
  label: string;
  endsAt: number | null;
  warningAtSeconds?: number;
  onWarning?: () => void;
}

function formatSeconds(total: number) {
  const minutes = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(total % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

export function Timer({ label, endsAt, warningAtSeconds = 30, onWarning }: TimerProps) {
  const [now, setNow] = useState(() => Date.now());
  const warningTriggered = useRef(false);

  useEffect(() => {
    warningTriggered.current = false;
  }, [endsAt]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const secondsRemaining = useMemo(() => {
    if (!endsAt) {
      return 0;
    }

    return Math.max(0, Math.ceil((endsAt - now) / 1000));
  }, [endsAt, now]);

  useEffect(() => {
    if (!warningTriggered.current && secondsRemaining > 0 && secondsRemaining <= warningAtSeconds) {
      warningTriggered.current = true;
      onWarning?.();
    }
  }, [onWarning, secondsRemaining, warningAtSeconds]);

  const urgencyClass = useMemo(() => {
    if (secondsRemaining <= 10) {
      return styles.danger;
    }
    if (secondsRemaining <= warningAtSeconds) {
      return styles.warning;
    }
    return styles.normal;
  }, [secondsRemaining, warningAtSeconds]);

  return (
    <div className={styles.card}>
      <p className={clsx(styles.value, urgencyClass)}>{formatSeconds(secondsRemaining)}</p>
    </div>
  );
}
