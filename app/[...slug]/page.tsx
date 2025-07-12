'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import ReactMarkdown from 'react-markdown'
import { ExternalLink, Copy, Check } from 'lucide-react'

type Release = {
  id: string
  repo: string
  tag: string | null
  range: string
  publishedAt: string
  markdown: string
}

// Loading skeleton component
function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 animate-pulse">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
                <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
              </div>
              <div className="h-9 w-9 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
            <div className="space-y-2">
              <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Empty state component
function EmptyState() {
  return (
    <div className="text-center py-12">
      <div className="mb-4 text-6xl">🐙</div>
      <p className="text-gray-600 dark:text-gray-400">No changelogs yet.</p>
    </div>
  )
}

// Release card component
function ReleaseCard({ release }: { release: Release }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(release.markdown)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-sm font-mono">
            {release.tag || release.range}
          </span>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {format(new Date(release.publishedAt), 'MMMM d, yyyy')}
          </span>
        </div>
        <button
          onClick={handleCopyMarkdown}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          title="Copy markdown content"
        >
          {isCopied ? (
            <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className={`prose prose-sm dark:prose-invert max-w-none ${!isExpanded ? 'max-h-96 overflow-hidden' : ''}`}>
        <ReactMarkdown>{release.markdown}</ReactMarkdown>
      </div>
      
      {release.markdown.length > 500 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        </div>
      )}
    </div>
  )
}

// Main page component
export default async function ChangelogPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  
  // Reconstruct the repository name from the slug array
  const repoName = slug.join('/')
  
  return <ChangelogClient slug={repoName} />
}

// Client component for interactivity
function ChangelogClient({ slug }: { slug: string }) {
  const [releases, setReleases] = useState<Release[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRepoUrlCopied, setIsRepoUrlCopied] = useState(false)

  const fetchReleases = async () => {
    try {
      setLoading(true)
      setError(null)
      
      console.log('Fetching releases for:', slug)
      const response = await fetch(`/api/releases?repo=${slug}`)
      
      console.log('Response status:', response.status)
      console.log('Response headers:', Object.fromEntries(response.headers.entries()))
      
      if (!response.ok) {
        const errorText = await response.text()
        console.log('Error response:', errorText)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      console.log('Received releases:', data)
      console.log('Number of releases:', data.length)
      
      // Sort releases by publishedAt desc
      const sortedReleases = data.sort((a: Release, b: Release) => 
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      )
      
      console.log('Setting releases:', sortedReleases)
      setReleases(sortedReleases)
    } catch (err) {
      console.error('Error fetching releases:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      console.log('Setting loading to false')
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReleases()
  }, [slug])

  const handleCopyRepoUrl = async () => {
    try {
      const url = `https://github.com/${slug}`
      await navigator.clipboard.writeText(url)
      setIsRepoUrlCopied(true)
      setTimeout(() => setIsRepoUrlCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy URL:', error)
    }
  }

  const handleRetry = () => {
    fetchReleases()
  }

  // Parse owner/repo from slug
  const [owner, repo] = slug.split('/')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Hero Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold font-mono">
                <span className="text-gray-600 dark:text-gray-400">{owner}</span>
                <span className="text-gray-900 dark:text-white">/{repo}</span>
              </h1>
              <button
                onClick={handleCopyRepoUrl}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                title="Copy repository URL"
              >
                {isRepoUrlCopied ? (
                  <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-red-800 dark:text-red-200">{error}</span>
              <button
                onClick={handleRetry}
                className="bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-200 px-3 py-1 rounded text-sm hover:bg-red-200 dark:hover:bg-red-700 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <main>
          {loading ? (
            <LoadingSkeleton />
          ) : releases.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-6">
              {releases.map((release) => (
                <ReleaseCard key={release.id} release={release} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
} 