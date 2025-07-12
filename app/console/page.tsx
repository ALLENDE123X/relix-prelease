"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "@/components/theme-provider"
import { Github, Loader2, Send, Sun, Moon, Calendar, TagIcon, Hash, GitBranch, ExternalLink } from "lucide-react"
import { useTheme } from "next-themes"
import ReactMarkdown from "react-markdown"
import { ToastAction } from "@/components/ui/toast"
import Link from "next/link"

// Types for our state management
interface GeneratePayload {
  repo: string
  branch: string
  mode: "date" | "tag" | "sha"
  start?: string
  end?: string
  base?: string
  head?: string
}

interface Branch {
  name: string
  commit: { sha: string }
}

interface Tag {
  name: string
  commit: { sha: string }
}

interface GenerateResponse {
  markdown: string
  repo: string
  branch: string
  mode: string
  baseSha: string
  headSha: string
  commits_list: string[] // Array of commit SHAs
  originalParams?: {
    start?: string
    end?: string
    base?: string
    head?: string
  }
}

// Real API functions
const fetchBranches = async (repo: string): Promise<Branch[]> => {
  const response = await fetch(`/api/github/branches?repo=${encodeURIComponent(repo)}`)
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch branches')
  }
  
  return response.json()
}

const fetchTags = async (repo: string): Promise<Tag[]> => {
  const response = await fetch(`/api/github/tags?repo=${encodeURIComponent(repo)}`)
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch tags')
  }
  
  return response.json()
}

// Generate changelog draft (AI-generated markdown only, no database save)
const generateChangelogDraft = async (payload: GeneratePayload): Promise<GenerateResponse> => {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to generate changelog')
  }
  
  return response.json()
}

// Publish changelog directly to release_slices
const publishChangelog = async (payload: GeneratePayload, markdown: string, shaRange: { baseSha: string; headSha: string; commits_list: string[] }): Promise<any> => {
  const response = await fetch('/api/releases', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      repo: payload.repo,
      branch: payload.branch,
      mode: payload.mode,
      baseSha: shaRange.baseSha,
      headSha: shaRange.headSha,
      markdown,
      commits_list: shaRange.commits_list, // Pass commits_list
      originalParams: {
        start: payload.start,
        end: payload.end,
        base: payload.base,
        head: payload.head,
      },
    }),
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to publish changelog')
  }
  
  return response.json()
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
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="w-9 h-9 p-0"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}

// Combobox component for tag selection
function TagCombobox({
  value,
  onValueChange,
  placeholder,
  tags,
}: {
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  tags: Tag[]
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {tags.map((tag) => (
          <SelectItem key={tag.name} value={tag.name}>
            {tag.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default function ConsolePage() {
  // Form state
  const [repoUrl, setRepoUrl] = useState("")
  const [branch, setBranch] = useState("main")
  const [rangeType, setRangeType] = useState<"date" | "tag" | "sha">("date")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [baseTag, setBaseTag] = useState("")
  const [headTag, setHeadTag] = useState("")
  const [baseSha, setBaseSha] = useState("")
  const [headSha, setHeadSha] = useState("")

  // UI state
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [draft, setDraft] = useState("")
  const [generatedPayload, setGeneratedPayload] = useState<GeneratePayload | null>(null) // Store the payload for publishing
  const [shaRange, setShaRange] = useState<{ baseSha: string; headSha: string; commits_list: string[] } | null>(null) // Store SHA range for publishing
  const [branches, setBranches] = useState<Branch[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [loadingTags, setLoadingTags] = useState(false)

  const { toast } = useToast()
  const editorSectionRef = useRef<HTMLDivElement>(null)

  // Extract repo owner/name from URL
  const extractRepoFromUrl = (url: string): string | null => {
    const match = url.match(/github\.com\/([^/]+\/[^/]+)/)
    return match ? match[1] : null
  }

  // Fetch branches when repo URL changes
  useEffect(() => {
    const repo = extractRepoFromUrl(repoUrl)
    if (repo) {
      setLoadingBranches(true)
      fetchBranches(repo)
        .then(setBranches)
        .catch(() => {
          toast({
            title: "Error",
            description: "Failed to fetch branches",
            variant: "destructive",
          })
        })
        .finally(() => setLoadingBranches(false))
    }
  }, [repoUrl, toast])

  // Fetch tags when repo URL changes and tag mode is selected
  useEffect(() => {
    const repo = extractRepoFromUrl(repoUrl)
    if (repo && rangeType === "tag") {
      setLoadingTags(true)
      fetchTags(repo)
        .then(setTags)
        .catch(() => {
          toast({
            title: "Error",
            description: "Failed to fetch tags",
            variant: "destructive",
          })
        })
        .finally(() => setLoadingTags(false))
    }
  }, [repoUrl, rangeType, toast])

  // Generate changelog draft
  const handleGenerate = useCallback(async () => {
    const repo = extractRepoFromUrl(repoUrl)
    if (!repo) {
      toast({
        title: "Invalid Repository",
        description: "Please enter a valid GitHub repository URL",
        variant: "destructive",
      })
      return
    }

    const payload: GeneratePayload = {
      repo,
      branch,
      mode: rangeType,
    }

    // Add range-specific parameters
    if (rangeType === "date") {
      if (!startDate || !endDate) {
        toast({
          title: "Missing Dates",
          description: "Please select both start and end dates",
          variant: "destructive",
        })
        return
      }
      payload.start = new Date(startDate).toISOString()
      payload.end = new Date(endDate).toISOString()
    } else if (rangeType === "tag") {
      if (!baseTag) {
        toast({
          title: "Missing Base Tag",
          description: "Please select a base tag",
          variant: "destructive",
        })
        return
      }
      payload.base = baseTag
      payload.head = headTag || "HEAD"
    } else if (rangeType === "sha") {
      if (!baseSha) {
        toast({
          title: "Missing Base SHA",
          description: "Please enter a base commit SHA",
          variant: "destructive",
        })
        return
      }
      payload.base = baseSha
      payload.head = headSha || "HEAD"
    }

    setIsGenerating(true)
    try {
      const response = await generateChangelogDraft(payload)
      setGeneratedPayload(payload) // Store payload for publishing
      setShaRange({ baseSha: response.baseSha, headSha: response.headSha, commits_list: response.commits_list }) // Store SHA range for publishing
      setDraft(response.markdown)
      toast({
        title: "Draft Generated",
        description: "Your changelog draft is ready for review and editing. Click 'Publish' when ready to make it live.",
      })
    } catch (error) {
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate changelog. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }, [repoUrl, branch, rangeType, startDate, endDate, baseTag, headTag, baseSha, headSha, toast])

  // Scroll to editor when draft is generated
  useEffect(() => {
    if (draft && editorSectionRef.current) {
      // Small delay to ensure the DOM has updated
      setTimeout(() => {
        editorSectionRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        })
      }, 100)
    }
  }, [draft])

  // Publish changelog (save edited markdown to database)
  const handlePublish = useCallback(async () => {
    if (!generatedPayload || !shaRange) return

    setIsPublishing(true)
    try {
      // Publish the edited markdown directly to release_slices
      const publishedData = await publishChangelog(generatedPayload, draft, shaRange)
      
      const repo = publishedData.repo
      const changelogUrl = `/${repo}`
      
      toast({
        title: "✅ Published Successfully",
        description: "Your changelog has been published!",
        action: (
          <ToastAction
            altText="View changelog"
            onClick={() => window.open(changelogUrl, '_blank')}
          >
            View Changelog
          </ToastAction>
        ),
      })
      
    } catch (error) {
      toast({
        title: "Publish Failed",
        description: error instanceof Error ? error.message : "Failed to publish changelog. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsPublishing(false)
    }
  }, [generatedPayload, draft, shaRange, toast])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault()
        if (e.shiftKey) {
          // Cmd/Ctrl + Shift + Enter = Publish
          if (generatedPayload && shaRange && !isPublishing) {
            handlePublish()
          }
        } else {
          // Cmd/Ctrl + Enter = Generate
          if (!isGenerating) {
            handleGenerate()
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleGenerate, handlePublish, generatedPayload, shaRange, isGenerating, isPublishing])

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <div className="min-h-screen bg-background">
        {/* Navigation */}
        <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-14 items-center">
            <div className="mr-4 flex">
              <Link href="/console" className="mr-6 flex items-center space-x-2">
                <span className="hidden font-bold sm:inline-block">
                  Changelog Console
                </span>
              </Link>
            </div>
            <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
              <nav className="flex items-center space-x-2">
                <Link
                  href="/repos"
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Browse Repos
                </Link>
              </nav>
              <ThemeToggle />
            </div>
          </div>
        </nav>

        {/* Header */}
        <header className={`${!draft ? 'sticky top-0 z-50' : ''} border-b bg-background/80 backdrop-blur-sm`}>
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold">Changelog Console</h1>
              <ThemeToggle />
            </div>

            {/* Form controls */}
            <div className="mt-4 space-y-4">
              {/* Repository URL and Branch */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="repo-url">Repository URL</Label>
                  <div className="relative">
                    <Github className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="repo-url"
                      placeholder="https://github.com/vercel/next.js"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="branch">Branch</Label>
                  <Select value={branch} onValueChange={setBranch} disabled={loadingBranches}>
                    <SelectTrigger>
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        <SelectValue placeholder="main" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.name} value={b.name}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Range Type Tabs */}
              <div>
                <Label>Range Type</Label>
                <Tabs value={rangeType} onValueChange={(value: "date" | "tag" | "sha") => setRangeType(value)} className="mt-2">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="date" className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Date
                    </TabsTrigger>
                    <TabsTrigger value="tag" className="flex items-center gap-2">
                      <TagIcon className="h-4 w-4" />
                      Tag
                    </TabsTrigger>
                    <TabsTrigger value="sha" className="flex items-center gap-2">
                      <Hash className="h-4 w-4" />
                      SHA
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="date" className="mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="start-date">Start Date</Label>
                        <Input
                          id="start-date"
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="end-date">End Date</Label>
                        <Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="tag" className="mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="base-tag">Base Tag</Label>
                        <TagCombobox
                          value={baseTag}
                          onValueChange={setBaseTag}
                          placeholder="Select base tag"
                          tags={tags}
                        />
                      </div>
                      <div>
                        <Label htmlFor="head-tag">Head Tag (optional)</Label>
                        <TagCombobox
                          value={headTag}
                          onValueChange={setHeadTag}
                          placeholder="HEAD (latest)"
                          tags={tags}
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="sha" className="mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="base-sha">Base SHA</Label>
                        <Input
                          id="base-sha"
                          placeholder="3f2c61a9..."
                          value={baseSha}
                          onChange={(e) => setBaseSha(e.target.value)}
                          className="font-mono text-sm"
                          maxLength={40}
                        />
                      </div>
                      <div>
                        <Label htmlFor="head-sha">Head SHA (optional)</Label>
                        <Input
                          id="head-sha"
                          placeholder="HEAD (latest)"
                          value={headSha}
                          onChange={(e) => setHeadSha(e.target.value)}
                          className="font-mono text-sm"
                          maxLength={40}
                        />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Generate Button */}
              <div className="flex justify-between items-center">
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !repoUrl}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating Draft...
                    </>
                  ) : (
                    "Generate Draft"
                  )}
                </Button>

                <div className="text-sm text-muted-foreground">
                  <kbd className="px-2 py-1 bg-muted rounded text-xs">⌘</kbd> +
                  <kbd className="px-2 py-1 bg-muted rounded text-xs ml-1">Enter</kbd> to generate
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main content area */}
        <div className="container mx-auto px-6 py-6">
          {draft ? (
            <div className="space-y-4" ref={editorSectionRef}>
              {/* Publish button */}
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-medium">Edit Draft & Preview</h2>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    <kbd className="px-2 py-1 bg-muted rounded text-xs">⌘</kbd> +
                    <kbd className="px-2 py-1 bg-muted rounded text-xs ml-1">⇧</kbd> +
                    <kbd className="px-2 py-1 bg-muted rounded text-xs ml-1">Enter</kbd> to publish
                  </div>
                  <Button onClick={handlePublish} disabled={isPublishing || !generatedPayload || !shaRange}>
                    {isPublishing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Publishing...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Publish
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Show what will be published */}
              {generatedPayload && (
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="font-medium text-blue-900 dark:text-blue-100">
                      Ready to publish:
                    </span>
                    <span className="text-blue-700 dark:text-blue-300">
                      {generatedPayload.repo} ({generatedPayload.branch})
                    </span>
                    <span className="text-blue-600 dark:text-blue-400">
                      {generatedPayload.mode === 'date' && generatedPayload.start && generatedPayload.end && 
                        `${new Date(generatedPayload.start).toLocaleDateString()} - ${new Date(generatedPayload.end).toLocaleDateString()}`}
                      {generatedPayload.mode === 'tag' && 
                        `${generatedPayload.base}...${generatedPayload.head || 'HEAD'}`}
                      {generatedPayload.mode === 'sha' && 
                        `${generatedPayload.base?.substring(0, 7)}...${generatedPayload.head?.substring(0, 7) || 'HEAD'}`}
                    </span>
                  </div>
                </div>
              )}

              {/* Split pane editor */}
              <div className="grid grid-cols-2 gap-1 h-[600px] border rounded-2xl overflow-hidden">
                {/* Editor pane */}
                <div className="bg-slate-50 dark:bg-slate-900 flex flex-col">
                  <div className="p-4 border-b bg-background/50 flex-shrink-0">
                    <h3 className="font-medium text-sm">Draft Editor</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Edit your changelog draft. Changes will be saved when you publish.
                    </p>
                  </div>
                  <div className="flex-1" style={{ height: 'calc(600px - 80px)' }}>
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                      className="w-full border-0 rounded-none resize-none font-mono text-xs leading-relaxed bg-transparent focus:outline-none focus:ring-0"
                      placeholder="Your changelog draft will appear here..."
                      style={{ height: '100%', minHeight: '100%' }}
                  />
                  </div>
                </div>

                {/* Preview pane */}
                <div className="bg-background flex flex-col">
                  <div className="p-4 border-b flex-shrink-0">
                    <h3 className="font-medium text-sm">Preview</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      This is how your changelog will look when published.
                    </p>
                  </div>
                  <div className="overflow-y-auto" style={{ height: 'calc(600px - 80px)' }}>
                    <div className="p-6">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{draft}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Empty state
            <div className="flex flex-col items-center justify-center h-[400px] text-center">
              <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
                <Hash className="w-12 h-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No draft generated yet</h3>
              <p className="text-muted-foreground mb-4 max-w-md">
                Configure your repository settings above and click "Generate Draft" to create an AI-powered
                changelog draft that you can edit before publishing.
              </p>
              <div className="text-sm text-muted-foreground">
                Use <kbd className="px-2 py-1 bg-muted rounded text-xs">⌘</kbd> +
                <kbd className="px-2 py-1 bg-muted rounded text-xs ml-1">Enter</kbd> to generate quickly
              </div>
            </div>
          )}
        </div>

        <Toaster />
      </div>
    </ThemeProvider>
  )
}
