"use client"

import React, { useEffect, useRef } from 'react'
import styles from './Eyes.module.css'

const Eyes = () => {
  const leftRef = useRef<HTMLDivElement | null>(null)
  const rightRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      ;[leftRef, rightRef].forEach((ref) => {
        const el = ref.current
        if (!el) return
        const pupil = el.querySelector(`.${styles.pupil}`) as HTMLDivElement | null
        if (!pupil) return
        const rect = el.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const dx = e.clientX - centerX
        const dy = e.clientY - centerY
        const max = rect.width * 0.25
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const ratio = Math.min(max / dist, 1)
        const x = dx * ratio
        const y = dy * ratio
        pupil.style.transform = `translate(${x}px, ${y}px)`
      })
    }

    window.addEventListener('mousemove', handleMove)
    return () => window.removeEventListener('mousemove', handleMove)
  }, [])

  return (
    <div className={styles.container} aria-hidden>
      <div className={styles.eye} ref={leftRef}>
        <div className={styles.pupil} />
      </div>
      <div className={styles.eye} ref={rightRef}>
        <div className={styles.pupil} />
      </div>
    </div>
  )
}

export default Eyes
