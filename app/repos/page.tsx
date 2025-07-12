'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { ExternalLink, GitBranch, Calendar, Hash, TagIcon, Clock, FileText, ChevronRight, Sun, Moon } from 'lucide-react'
import { ThemeProvider } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from "next-themes"

interface RepoSummary {
  repo: string;
  totalChangelogs: number;
  branches: string[];
  mostRecentChangelog: {
    id: string;
    publishedAt: string;
    branch: string;
    mode: string;
    range: string;
    markdownPreview: string;
  };
}

function RepoCard({ repo }: { repo: RepoSummary }) {
  const router = useRouter()
  
  const handleRepoClick = () => {
    router.push(`/${repo.repo}`)
  }

  const handleGitHubClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    window.open(`https://github.com/${repo.repo}`, '_blank')
  }

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'date':
        return <Calendar className="h-4 w-4" />
      case 'sha':
        return <Hash className="h-4 w-4" />
      case 'tag':
        return <TagIcon className="h-4 w-4" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'date':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'sha':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'tag':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  return (
    <Card 
      className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] border-border/50 hover:border-border"
      onClick={handleRepoClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CardTitle className="text-lg font-semibold text-foreground">
              {repo.repo}
            </CardTitle>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGitHubClick}
            className="h-8 w-8 p-0"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {repo.totalChangelogs} changelog{repo.totalChangelogs !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            {repo.branches.length} branch{repo.branches.length !== 1 ? 'es' : ''}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Branches */}
          <div>
            <h4 className="text-sm font-medium text-foreground mb-2">Branches</h4>
            <div className="flex flex-wrap gap-1">
              {repo.branches.map((branch) => (
                <Badge key={branch} variant="secondary" className="text-xs">
                  {branch}
                </Badge>
              ))}
            </div>
          </div>

          {/* Most Recent Changelog */}
          <div>
            <h4 className="text-sm font-medium text-foreground mb-2">Most Recent Changelog</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{format(new Date(repo.mostRecentChangelog.publishedAt), 'MMM d, yyyy')}</span>
                <Badge variant="outline" className="text-xs">
                  {repo.mostRecentChangelog.branch}
                </Badge>
                <Badge className={`text-xs ${getModeColor(repo.mostRecentChangelog.mode)}`}>
                  <span className="flex items-center gap-1">
                    {getModeIcon(repo.mostRecentChangelog.mode)}
                    {repo.mostRecentChangelog.mode}
                  </span>
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                  {repo.mostRecentChangelog.range}
                </span>
              </div>
              <div className="text-sm text-muted-foreground line-clamp-2">
                {repo.mostRecentChangelog.markdownPreview.replace(/^#+ /, '').trim()}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ReposSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-8 w-8" />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <Skeleton className="h-4 w-16 mb-2" />
                <div className="flex gap-1">
                  <Skeleton className="h-5 w-12" />
                  <Skeleton className="h-5 w-16" />
                </div>
              </div>
              <div>
                <Skeleton className="h-4 w-32 mb-2" />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-12" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// Theme toggle component
function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="w-9 h-9" />
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="w-9 h-9 p-0"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}

export default function ReposPage() {
  const [repos, setRepos] = useState<RepoSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchRepos = async () => {
      try {
        console.log('Starting to fetch repos...')
        setLoading(true)
        setError(null)
        
        const response = await fetch('/api/repos')
        console.log('API response status:', response.status)
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        
        const data = await response.json()
        console.log('Received repos data:', data)
        setRepos(data)
      } catch (err) {
        console.error('Error fetching repos:', err)
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        console.log('Finished fetching repos')
        setLoading(false)
      }
    }

    fetchRepos()
  }, [])

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Repository Changelogs
            </h1>
            <p className="text-muted-foreground">
              Browse all repositories with published changelogs. Click on any repository to view its complete changelog history.
            </p>
          </div>

          {loading && <ReposSkeleton />}

          {error && (
            <div className="text-center py-12">
              <div className="text-red-500 mb-4">
                <FileText className="h-12 w-12 mx-auto mb-2" />
                <p className="text-lg font-semibold">Error Loading Repositories</p>
              </div>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button 
                onClick={() => window.location.reload()}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Try Again
              </Button>
            </div>
          )}

          {!loading && !error && repos.length === 0 && (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">
                <FileText className="h-12 w-12 mx-auto mb-2" />
                <p className="text-lg font-semibold">No Repositories Found</p>
              </div>
              <p className="text-muted-foreground mb-4">
                No changelogs have been published yet. Start by creating your first changelog.
              </p>
              <Button 
                onClick={() => window.location.href = '/console'}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Create Changelog
              </Button>
            </div>
          )}

          {!loading && !error && repos.length > 0 && (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {repos.map((repo) => (
                <RepoCard key={repo.repo} repo={repo} />
              ))}
            </div>
          )}
        </div>
      </div>
    </ThemeProvider>
  )
} 