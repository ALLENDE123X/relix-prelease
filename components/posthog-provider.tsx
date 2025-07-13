'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { PostHogProvider } from 'posthog-js/react'
import { useEffect, useState } from 'react'
import posthog from 'posthog-js'

if (typeof window !== 'undefined') {
  // Debug: Check if environment variables are loaded
  console.log('PostHog Key exists:', !!process.env.NEXT_PUBLIC_POSTHOG_KEY)
  console.log('PostHog Host:', process.env.NEXT_PUBLIC_POSTHOG_HOST)
  
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      capture_pageview: false,
      session_recording: {
        maskAllInputs: true,
      },
    })
    console.log('PostHog initialized')
    
    // Make posthog available globally for debugging
    ;(window as any).posthog = posthog
  } else {
    console.error('PostHog key is missing! Check your .env.local file')
  }
}

export function PostHogPageview(): null {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return
    
    if (pathname) {
      let url = window.origin + pathname
      if (searchParams && searchParams.toString()) {
        url = url + `?${searchParams.toString()}`
      }
      console.log('Sending pageview:', url)
      posthog.capture(
        '$pageview',
        {
          '$current_url': url,
        }
      )
    }
  }, [pathname, searchParams])

  return null
}

export function PHProvider({ children }: { children: React.ReactNode }) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  // Only render PostHogProvider on client side
  if (!isClient) {
    return <>{children}</>
  }

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
} 