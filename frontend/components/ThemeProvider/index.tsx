"use client"

import React, { useEffect } from 'react'

interface ThemeProviderProps {
  children: React.ReactNode
}

export default function ThemeProvider({ children }: ThemeProviderProps) {
  useEffect(() => {
    const savedTheme = localStorage.getItem('debug-relay-theme') || 'dark'
    document.documentElement.setAttribute('data-theme', savedTheme)
    localStorage.setItem('debug-relay-theme', savedTheme)
  }, [])

  return <>{children}</>
}
