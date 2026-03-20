"use client";

import { useEffect, useState } from "react";
import styles from "./ThemeToggle.module.css";

type ThemeMode = "dark" | "light";

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "dark";
    }

    return window.localStorage.getItem("debug-relay-theme") === "light" ? "light" : "dark";
  });

  useEffect(() => {
    window.localStorage.setItem("debug-relay-theme", theme);
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  };

  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={styles.button}
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      title={isLight ? "Switch to dark theme" : "Switch to light theme"}
      role="switch"
      aria-checked={isLight}
    >
      <span className={styles.iconWrap} aria-hidden="true">
        <svg viewBox="0 0 24 24" className={`${styles.icon} ${isLight ? styles.sunIn : styles.sunOut}`}>
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 2.5v2.7M12 18.8v2.7M2.5 12h2.7M18.8 12h2.7M5.4 5.4l1.9 1.9M16.7 16.7l1.9 1.9M18.6 5.4l-1.9 1.9M7.3 16.7l-1.9 1.9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <svg viewBox="0 0 24 24" className={`${styles.icon} ${isLight ? styles.moonOut : styles.moonIn}`}>
          <path d="M14.8 3.4a8.8 8.8 0 1 0 5.8 15.5A9.4 9.4 0 0 1 14.8 3.4Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}
