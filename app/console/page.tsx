"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { useSearchParams } from "next/navigation"
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

function ConsolePageContent() {
  // URL parameters
  const searchParams = useSearchParams()
  
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

  // Handle URL parameters on component mount
  useEffect(() => {
    const pathParam = searchParams.get('path')
    if (pathParam) {
      // Validate the path format (owner/repo)
      const pathParts = pathParam.split('/')
      if (pathParts.length === 2 && pathParts[0] && pathParts[1]) {
        const githubUrl = `https://github.com/${pathParam}`
        setRepoUrl(githubUrl)
        toast({
          title: "Repository Auto-populated",
          description: `Loaded repository: ${pathParam}`,
        })
      } else {
        toast({
          title: "Invalid Path Parameter",
          description: "Path should be in format: owner/repo",
          variant: "destructive",
        })
      }
    }
  }, [searchParams, toast])

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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        {/* Navigation */}
        <nav className="sticky top-0 z-50 border-b bg-background shadow-sm">
          <div className="container mx-auto px-6 flex h-14 items-center">
            <div className="mr-4 flex">
              <Link href="/" className="flex items-center space-x-2">
                <span className="font-mono font-bold text-xl bg-gradient-to-r from-emerald-600 via-green-700 to-[#107C41] bg-clip-text text-transparent hover:from-emerald-500 hover:via-green-600 hover:to-green-600 transition-all duration-300">
                  Relix
                </span>
              </Link>
            </div>
            <div className="flex flex-1 items-center justify-end">
              <nav className="flex items-center space-x-4 md:space-x-6">
                <Link
                  href="/"
                  className="text-sm font-mono font-medium text-muted-foreground hover:bg-gradient-to-r hover:from-emerald-600 hover:to-[#107C41] hover:bg-clip-text hover:text-transparent transition-all duration-300"
                >
                  Repos
                </Link>
                <Link
                  href="/console"
                  className="text-sm font-mono font-medium bg-gradient-to-r from-emerald-600 to-[#107C41] bg-clip-text text-transparent"
                >
                  Console
                </Link>
              </nav>
              <div className="ml-8 pl-4 border-l border-slate-300 dark:border-slate-600">
                <ThemeToggle />
              </div>
            </div>
          </div>
        </nav>

        {/* Form controls */}
        <div className="bg-background/80 backdrop-blur-sm border-b shadow-sm">
          <div className="container mx-auto px-6 py-6">
            <h1 className="text-2xl font-mono font-semibold mb-6">
              <span className="bg-gradient-to-r from-slate-700 via-slate-800 to-slate-900 dark:from-slate-200 dark:via-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
                Changelog
              </span>
              <span className="ml-2 bg-gradient-to-r from-emerald-600 via-[#107C41] to-green-800 bg-clip-text text-transparent">
                Console
              </span>
            </h1>
            <div className="space-y-4 md:space-y-6 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-200 dark:border-slate-700 p-4 md:p-6 shadow-xl">
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
                      className="pl-10 font-mono bg-white/70 dark:bg-slate-900/70 border-slate-300 dark:border-slate-600 focus:border-indigo-500 focus:ring-indigo-500 transition-all duration-200 shadow-sm hover:shadow-md focus:shadow-lg"
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
                <Tabs value={rangeType} onValueChange={(value) => setRangeType(value as "date" | "tag" | "sha")} className="mt-2">
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
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !repoUrl}
                  className="bg-gradient-to-r from-emerald-600 to-[#107C41] hover:from-emerald-700 hover:to-green-800 text-white shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 px-8 py-2 font-mono w-full sm:w-auto"
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

                <div className="text-sm text-muted-foreground font-mono text-center sm:text-right">
                  <kbd className="px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded-md text-xs border border-slate-300 dark:border-slate-600 shadow-sm">⌘</kbd> +
                  <kbd className="px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded-md text-xs border border-slate-300 dark:border-slate-600 shadow-sm ml-1">Enter</kbd> to generate
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div className="container mx-auto px-6 py-6 min-h-[calc(100vh-200px)] relative">
          {draft ? (
            <div className="space-y-4" ref={editorSectionRef}>
              {/* Publish button */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-lg font-mono font-medium text-slate-800 dark:text-slate-200">Edit Draft & Preview</h2>
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                  <div className="text-sm text-muted-foreground font-mono text-center">
                    <kbd className="px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded-md text-xs border border-slate-300 dark:border-slate-600 shadow-sm">⌘</kbd> +
                    <kbd className="px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded-md text-xs border border-slate-300 dark:border-slate-600 shadow-sm ml-1">⇧</kbd> +
                    <kbd className="px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded-md text-xs border border-slate-300 dark:border-slate-600 shadow-sm ml-1">Enter</kbd> to publish
                  </div>
                  <Button onClick={handlePublish} disabled={isPublishing || !generatedPayload || !shaRange} className="bg-gradient-to-r from-[#107C41] to-green-700 hover:from-green-800 hover:to-green-900 text-white shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 font-mono w-full sm:w-auto">
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
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4 shadow-lg backdrop-blur-sm">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 text-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-gradient-to-r from-emerald-500 to-[#107C41] rounded-full animate-pulse shadow-lg"></div>
                      <span className="font-mono font-medium text-blue-900 dark:text-blue-100">
                        Ready to publish:
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 ml-6 sm:ml-0">
                      <span className="font-mono text-blue-700 dark:text-blue-300 bg-blue-100/50 dark:bg-blue-900/30 px-2 py-1 rounded-md">
                        {generatedPayload.repo} ({generatedPayload.branch})
                      </span>
                      <span className="font-mono text-blue-600 dark:text-blue-400 bg-blue-100/30 dark:bg-blue-900/20 px-2 py-1 rounded-md">
                        {generatedPayload.mode === 'date' && generatedPayload.start && generatedPayload.end && 
                          `${new Date(generatedPayload.start).toLocaleDateString()} - ${new Date(generatedPayload.end).toLocaleDateString()}`}
                        {generatedPayload.mode === 'tag' && 
                          `${generatedPayload.base}...${generatedPayload.head || 'HEAD'}`}
                        {generatedPayload.mode === 'sha' && 
                          `${generatedPayload.base?.substring(0, 7)}...${generatedPayload.head?.substring(0, 7) || 'HEAD'}`}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Split pane editor */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 h-[400px] md:h-[600px] bg-white/50 dark:bg-slate-800/50 rounded-2xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-700">
                {/* Editor pane */}
                <div className="bg-slate-50/80 dark:bg-slate-900/80 flex flex-col backdrop-blur-sm">
                  <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 flex-shrink-0">
                    <h3 className="font-mono font-medium text-sm text-slate-800 dark:text-slate-200">Draft Editor</h3>
                    <p className="text-xs font-mono text-muted-foreground mt-1">
                      Edit your changelog draft. Changes will be saved when you publish.
                    </p>
                  </div>
                  <div className="flex-1 h-[320px] md:h-[520px]">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                      className="w-full h-full border-0 rounded-none resize-none font-mono text-xs leading-relaxed bg-transparent focus:outline-none focus:ring-0 md:text-sm"
                      placeholder="Your changelog draft will appear here..."
                  />
                  </div>
                </div>

                {/* Preview pane */}
                <div className="bg-white/80 dark:bg-slate-800/80 flex flex-col backdrop-blur-sm">
                  <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 flex-shrink-0">
                    <h3 className="font-mono font-medium text-sm text-slate-800 dark:text-slate-200">Preview</h3>
                    <p className="text-xs font-mono text-muted-foreground mt-1">
                      This is how your changelog will look when published.
                    </p>
                  </div>
                  <div className="overflow-y-auto h-[320px] md:h-[520px]">
                    <div className="p-4 md:p-6">
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
              <div className="w-24 h-24 bg-gradient-to-br from-emerald-500 to-[#107C41] rounded-full flex items-center justify-center mb-6 shadow-lg">
                <Hash className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-lg font-mono font-medium mb-3 text-slate-800 dark:text-slate-200">No draft generated yet</h3>
              <p className="font-mono text-muted-foreground mb-6 max-w-md leading-relaxed">
                Configure your repository settings above and click "Generate Draft" to create an AI-powered
                changelog draft that you can edit before publishing.
              </p>
              <div className="text-sm text-muted-foreground font-mono bg-white/50 dark:bg-slate-800/50 px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                Use <kbd className="px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded-md text-xs border border-slate-300 dark:border-slate-600 shadow-sm">⌘</kbd> +
                <kbd className="px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded-md text-xs border border-slate-300 dark:border-slate-600 shadow-sm ml-1">Enter</kbd> to generate quickly
              </div>
            </div>
          )}
        </div>

        <Toaster />
        
        {/* Footer */}
        <footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 mt-auto">
          <div className="container mx-auto px-6 flex py-4 items-center justify-center">
            <div className="text-center">
              <div className="text-sm font-mono text-muted-foreground">
                © 2025 Relix. AI-powered changelog generator.
              </div>
              <div className="text-sm font-mono text-muted-foreground mt-1">
                Made with ❤️ for developers
              </div>
            </div>
          </div>
        </footer>
      </div>
    </ThemeProvider>
  )
}

export default function ConsolePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ConsolePageContent />
    </Suspense>
  )
}
