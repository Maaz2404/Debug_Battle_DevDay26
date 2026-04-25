"use client"

import Link from "next/link";
import { useState, useEffect } from "react";
import Image from "next/image";
import styles from "./BrandLogo.module.css";

interface BrandLogoProps {
  href?: string;
  compact?: boolean;
  withImage?: boolean;
}

export function BrandLogo({ href = "/", compact, withImage }: BrandLogoProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const currentTheme = (document.documentElement.getAttribute('data-theme') || 'dark') as 'dark' | 'light'
    setTheme(currentTheme)

    const handleThemeChange = () => {
      const newTheme = (document.documentElement.getAttribute('data-theme') || 'dark') as 'dark' | 'light'
      setTheme(newTheme)
    }

    const observer = new MutationObserver(handleThemeChange)
    observer.observe(document.documentElement, { attributes: true })

    return () => observer.disconnect()
  }, [])

  return (
    <Link href={href} className={styles.link}>
      {withImage ? (
        <Image 
          src={theme === 'light' ? '/logored.png' : '/logo.png'} 
          alt="Debug Battle Logo" 
          width={75} 
          height={75} 
        />
      ) : (
        <span className={styles.badge}>
          <span className={styles.glow} />
          <span className={styles.letter}>D</span>
        </span>
      )}
      {!compact ? (
        <span className={styles.textWrap}>
          <span className={styles.title}>Debug Relay</span>
          <span className={styles.subtitle}>Realtime Code Arena</span>
        </span>
      ) : null}
    </Link>
  );
}
