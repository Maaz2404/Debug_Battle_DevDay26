"use client"

import React, { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { FormEvent } from 'react'
import styles from './page.module.css'
import Eyes from '../components/Eyes'
import { apiClient, createDemoLoginResponse } from '@/lib/api/client'
import { REAL_BACKEND_ENABLED } from '@/lib/config/runtime'
import { useAppStore } from '@/lib/store/useAppStore'

const ThemeToggle = dynamic(() => import('../components/ThemeToggle').then((mod) => mod.ThemeToggle), {
  ssr: false,
})

const Landing = () => {
  const router = useRouter()
  const user = useAppStore((state) => state.user)
  const competition = useAppStore((state) => state.competition)
  const clearSession = useAppStore((state) => state.clearSession)
  const setUser = useAppStore((state) => state.setUser)
  const setCompetition = useAppStore((state) => state.setCompetition)
  const resetQuestionState = useAppStore((state) => state.resetQuestionState)

  const [theme, setTheme] = useState('dark')
  const [themeLoaded, setThemeLoaded] = useState(false)
  const [teamCode, setTeamCode] = useState('')
  const [participantName, setParticipantName] = useState('')
  const [errors, setErrors] = useState<{ teamCode?: string; participantName?: string; general?: string }>({})
  const [submitting, setSubmitting] = useState(false)
  const [missionIndex, setMissionIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const missions = [
    {
      heading: 'Zone 05',
      subheading: 'The Control Room',
      description: 'The Mastermind has released a swarm of sentient bugs to stall you. You must hunt down these errors and stabilize the core foundation before the room collapses.'
    },
    {
      heading: 'Mission No 1',
      subheading: 'The Swarm Purge',
      description: 'Trace the lens and Exorcise the glitches before they eat the code.'
    }
  ]

  useEffect(() => {
    // Load theme from localStorage immediately
    const savedTheme = localStorage.getItem('debug-relay-theme') || 'dark'
    setTheme(savedTheme)
    document.documentElement.setAttribute('data-theme', savedTheme)
    setThemeLoaded(true)

    const handleThemeChange = () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark'
      setTheme(currentTheme)
    }

    const observer = new MutationObserver(handleThemeChange)
    observer.observe(document.documentElement, { attributes: true })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true)
      setTimeout(() => {
        setMissionIndex((prev) => (prev + 1) % missions.length)
        setIsTransitioning(false)
      }, 800)
    }, 5000)

    return () => clearInterval(interval)
  }, [missions.length])

  useEffect(() => {
    if (!user?.token) {
      return
    }

    if (REAL_BACKEND_ENABLED && user.token.startsWith('mock-')) {
      clearSession()
      return
    }

    if (competition?.status === 'ACTIVE') {
      router.replace('/compete')
      return
    }

    router.replace('/lobby')
  }, [clearSession, competition?.status, router, user?.token])

  const canSubmit = useMemo(() => teamCode.trim().length > 0 && participantName.trim().length > 0, [participantName, teamCode])

  const renderLetters = (text: string) => {
    return text.split('').map((letter, index) => {
      if (letter === ' ') {
        return <span key={index} className={styles.letter}>&nbsp;</span>
      }
      else return (
      <span key={index} className={styles.letter}>
        {letter}
      </span>)
      })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextErrors: { teamCode?: string; participantName?: string } = {}
    if (!teamCode.trim()) {
      nextErrors.teamCode = 'Team code is required.'
    }
    if (!participantName.trim()) {
      nextErrors.participantName = REAL_BACKEND_ENABLED ? 'Password is required.' : 'Your name is required.'
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setSubmitting(true)
    setErrors({})

    try {
      const response = await apiClient.login(teamCode.trim(), participantName.trim())

      setUser(response.session)
      setCompetition(response.competition)
      resetQuestionState(response.currentQuestion)

      if (response.competition.status === 'ACTIVE') {
        router.replace('/compete')
      } else {
        router.replace('/lobby')
      }
    } catch (error) {
      setErrors({
        general: error instanceof Error ? error.message : 'Login failed. Please try again.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const enterDemoMode = () => {
    const demo = createDemoLoginResponse()
    setUser(demo.session)
    setCompetition(demo.competition)
    resetQuestionState(demo.currentQuestion)

    if (demo.competition.status === 'ACTIVE') {
      router.replace('/compete')
    } else {
      router.replace('/lobby')
    }
  }

  return (
    !themeLoaded ? null : (
    <div className={styles.landing}>
        <header className={styles.header}>
            <div className={styles.headerContainer}>
                <div className={styles.logo}>
                  <Image src={theme === 'light' ? '/logored.png' : '/logo.png'} alt="Debug Battle Logo" width={75} height={75} />
                </div>
                <div className={styles.headerRight}>
                  <Link href="/admin" className={styles.adminLink}>Admin</Link>
                  <ThemeToggle />
                </div>
            </div>
        </header>
        <section className={styles.hero}>
            <h1>{renderLetters('DEBUG RELAY')}</h1>
            <section className={styles.heroContent}>
              <div className={styles.webleft}>
                <Image src="/web2.png" alt="Web Background" width={450} height={450} />
              </div>
              <div className={styles.webright}>
                <Image src="/web.png" alt="Web Background" width={500} height={500} />
              </div>
              <div className={styles.spiderContainer}>
                <Eyes />
                <div className={styles.spiderBottom}>
                  <img src="/spider.png" alt="Blue spider" />
                </div>
              </div>
               <div className={styles.heroText}>
                 <h2 className={isTransitioning ? styles.slideOut : styles.slideIn}>
                   {missions[missionIndex].heading}
                 </h2>
                 <div className={styles.lineimg}>
                   <img src="/line.png" alt="Mission" />
                 </div>
                 <h3 className={isTransitioning ? styles.slideOut2 : styles.slideIn2}>
                   {missions[missionIndex].subheading}
                 </h3>
                 <p className={isTransitioning ? styles.fadeOut : styles.fadeIn}>
                   {missions[missionIndex].description}
                 </p>
               </div>
               <div className={styles.heroForm}>
                  <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Team Code:</label>
                      <input 
                        type="text" 
                        placeholder="e.g. BRAVO-7" 
                        className={styles.formInput}
                        value={teamCode}
                        onChange={(e) => setTeamCode(e.target.value)}
                      />
                      {errors.teamCode && <p style={{ color: 'red', fontSize: '12px' }}>{errors.teamCode}</p>}
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>{REAL_BACKEND_ENABLED ? 'Password' : 'Your Name'}:</label>
                      <input 
                        type={REAL_BACKEND_ENABLED ? 'password' : 'text'} 
                        placeholder={REAL_BACKEND_ENABLED ? 'Your team password' : 'Your display name'} 
                        className={styles.formInput}
                        value={participantName}
                        onChange={(e) => setParticipantName(e.target.value)}
                      />
                      {errors.participantName && <p style={{ color: 'red', fontSize: '12px' }}>{errors.participantName}</p>}
                    </div>
                    {errors.general && <p style={{ color: 'red', fontSize: '12px' }}>{errors.general}</p>}
                    <button 
                      type="submit" 
                      className={styles.joinButton}
                      disabled={!canSubmit || submitting}
                    >
                      {submitting ? 'Joining...' : 'Join'}
                    </button>
                  </form>
                  {!REAL_BACKEND_ENABLED && (
                    <button 
                      className={styles.joinButton}
                      onClick={enterDemoMode}
                      style={{ marginTop: '10px', opacity: 0.8 }}
                    >
                      Demo Mode
                    </button>
                  )}
               </div>
            </section>
        </section>
    </div>
    )
  )
}

export default Landing
