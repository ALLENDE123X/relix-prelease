import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// Validation schema
const generateSchema = z.object({
  repo: z.string().min(1, 'Repository is required'),
  branch: z.string().default('main'),
  mode: z.enum(['date', 'sha', 'tag']),
  start: z.string().optional(),
  end: z.string().optional(),
  base: z.string().optional(),
  head: z.string().optional(),
});

// Environment validation
function validateEnvironment() {
  const required = {
    GITHUB_PAT: process.env.GITHUB_PAT,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    HELICONE_API_KEY: process.env.HELICONE_API_KEY,
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return required as Record<string, string>;
}

// Initialize OpenAI client
let openai: OpenAI;

function initializeOpenAI() {
  const env = validateEnvironment();
  openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: 'https://oai.hconeai.com/v1',
    defaultHeaders: {
      'Helicone-Auth': `Bearer ${env.HELICONE_API_KEY}`,
    },
  });
}

// Helper functions

// Resolve a tag to its commit SHA
export async function resolveTagToSha(repo: string, tag: string): Promise<string> {
  const token = process.env.GITHUB_PAT;
  const baseUrl = 'https://api.github.com';
  
  const response = await fetch(`${baseUrl}/repos/${repo}/git/refs/tags/${tag}`, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Relix-Changelog-Generator'
    }
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Tag '${tag}' not found`);
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  
  const tagData = await response.json();
  
  // For annotated tags, we need to get the commit SHA
  if (tagData.object.type === 'tag') {
    const tagResponse = await fetch(`${baseUrl}/repos/${repo}/git/tags/${tagData.object.sha}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Relix-Changelog-Generator'
      }
    });
    
    if (!tagResponse.ok) {
      throw new Error(`Failed to resolve annotated tag: ${tagResponse.status} ${tagResponse.statusText}`);
    }
    
    const annotatedTag = await tagResponse.json();
    return annotatedTag.object.sha;
  }
  
  // For lightweight tags, the SHA is directly available
  return tagData.object.sha;
}

// Find the SHA of the first commit in a date range
export async function findCommitShaByDate(repo: string, branch: string, date: string, isStart: boolean): Promise<string> {
  const token = process.env.GITHUB_PAT;
  const baseUrl = 'https://api.github.com';
  
  // For start date, we want commits since that date
  // For end date, we want commits until that date
  let url = `${baseUrl}/repos/${repo}/commits?sha=${branch}&per_page=100`;
  
  if (isStart) {
    url += `&since=${date}`;
  } else {
    url += `&until=${date}`;
  }
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Relix-Changelog-Generator'
    }
  });
  
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  
  const commits = await response.json();
  
  if (!Array.isArray(commits) || commits.length === 0) {
    throw new Error(`No commits found ${isStart ? 'since' : 'until'} ${date}`);
  }
  
  // For start date, we want the oldest commit (last in the array)
  // For end date, we want the newest commit (first in the array)
  return isStart ? commits[commits.length - 1].sha : commits[0].sha;
}

// Convert any range type to SHA range
export async function convertToShaRange(
  repo: string,
  branch: string,
  mode: 'date' | 'sha' | 'tag',
  params: {
    start?: string;
    end?: string;
    base?: string;
    head?: string;
  }
): Promise<{ baseSha: string; headSha: string }> {
  let baseSha: string;
  let headSha: string;
  
  if (mode === 'date') {
    if (!params.start || !params.end) {
      throw new Error('Start and end dates are required for date mode');
    }
    
    // Find the SHA of the first commit in the date range
    baseSha = await findCommitShaByDate(repo, branch, params.start, true);
    headSha = await findCommitShaByDate(repo, branch, params.end, false);
    
  } else if (mode === 'tag') {
    if (!params.base || !params.head) {
      throw new Error('Base and head tags are required for tag mode');
    }
    
    // Resolve tags to SHAs
    baseSha = await resolveTagToSha(repo, params.base);
    headSha = params.head === 'HEAD' ? 'HEAD' : await resolveTagToSha(repo, params.head);
    
  } else if (mode === 'sha') {
    if (!params.base || !params.head) {
      throw new Error('Base and head SHAs are required for SHA mode');
    }
    
    // Already SHAs, just use them
    baseSha = params.base;
    headSha = params.head;
    
  } else {
    throw new Error(`Invalid mode: ${mode}`);
  }
  
  return { baseSha, headSha };
}

export async function fetchCommits(
  repo: string,
  branch: string,
  mode: 'date' | 'sha' | 'tag',
  params: {
    start?: string;
    end?: string;
    base?: string;
    head?: string;
  }
): Promise<any[]> {
  const token = process.env.GITHUB_PAT;
  const baseUrl = 'https://api.github.com';
  
  // Convert all range types to SHA range
  const { baseSha, headSha } = await convertToShaRange(repo, branch, mode, params);
  
  // Use GitHub's compare API to get commits between two SHAs
  const compareUrl = `${baseUrl}/repos/${repo}/compare/${baseSha}...${headSha}`;
  
  const response = await fetch(compareUrl, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Relix-Changelog-Generator'
    }
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Repository not found or commit range not accessible');
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  
  const compareData = await response.json();
  
  // Return the commits from the comparison
  return compareData.commits || [];
}

// Helper function to check for overlapping commits
async function checkCommitsOverlap(
  repo: string,
  branch: string,
  newCommitsList: string[]
): Promise<boolean> {
  const env = validateEnvironment();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  
  // Query for any existing releases for this repo and branch
  const { data, error } = await supabase
    .from('release_slices')
    .select('id, commits_list')
    .eq('repo', repo)
    .eq('branch', branch);

  if (error) {
    console.error('Database overlap check error:', error);
    throw new Error('Database query failed');
  }

  if (!data || data.length === 0) {
    return false;
  }

  // Create a set of new commit SHAs for efficient lookup
  const newCommitShas = new Set(newCommitsList);

  // Check each existing release for overlap
  for (const existing of data) {
    const existingCommitsList = existing.commits_list || [];
    
    // Check if any commits overlap between the two lists
    const hasOverlap = existingCommitsList.some((commitSha: string) => newCommitShas.has(commitSha));
    
    if (hasOverlap) {
      return true;
    }
  }

  return false;
}

export async function generateChangelog(commits: any[]): Promise<string> {
  // No need to check for empty commits here since we validate before calling this function
  const commitSummaries = commits.map(commit => ({
    sha: commit.sha.substring(0, 7),
    message: commit.commit.message.split('\n')[0],
    author: commit.commit.author.name,
    date: commit.commit.author.date
  }));

  // Get date range for the changelog
  const dates = commitSummaries.map(c => new Date(c.date)).sort((a, b) => b.getTime() - a.getTime());
  const latestDate = dates[0];
  const earliestDate = dates[dates.length - 1];
  
  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  const prompt = `
  You are a senior technical writer responsible for producing clear, factual, and detailed changelogs for a developer audience.

  **Instructions:**
  - **Tone:** Your tone should be objective, professional, and formal. Avoid marketing language, enthusiasm, or informalities.
  - **Goal:** The primary goal is to create a technically precise and exhaustive summary of changes. Synthesize the provided commit messages into a coherent log.
  - **Summarization:** Group related commits under a single, descriptive bullet point where logical. For example, multiple commits related to fixing a single bug or implementing one feature should be summarized together.
  - **Clarity:** Ensure that each entry clearly describes the change that was made.

  **Formatting Rules:**
  - **Main Header:** Start with a top-level header that includes the release version and date (e.g., "# Release v1.2.3 – ${formatDate(latestDate)}").
  - **Categorization:** Use the following categories to group changes. If a category has no items, omit it.
    - **New Features:** For new, user-facing capabilities.
    - **Improvements:** For enhancements to existing features.
    - **Bug Fixes:** For bug resolutions.
    - **Internal Changes:** For internal refactoring, dependency updates, and other non-user-facing modifications.
  - **Content:**
    - Write in complete sentences.
    - Each bullet point must accurately reflect the changes from the commit log.
    - Include the relevant commit SHAs in parentheses at the end of each bullet point for traceability.

  **Commit Log:**
  The following is a list of commits for the period from ${formatDate(earliestDate)} to ${formatDate(latestDate)}. Use this as the source of truth for your changelog.

  ${commitSummaries.map(c => `- ${c.sha}: ${c.message} (${c.author})`).join('\n')}

  Generate a detailed and objective changelog based on these instructions.
  `;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a technical writer responsible for creating precise and professional software changelogs. Your task is to produce a detailed, objective summary of code changes based on commit messages. Focus on clarity, accuracy, and technical detail.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    max_tokens: 2000,
    temperature: 0.3,
  });

  return response.choices[0]?.message?.content || '# Changelog\n\nFailed to generate changelog.';
}

// Main API handler
export async function POST(request: NextRequest) {
  try {
    // Initialize OpenAI
    initializeOpenAI();

    // Parse and validate request body
    const body = await request.json();
    const validatedData = generateSchema.parse(body);

    const { repo, branch, mode, start, end, base, head } = validatedData;

    // Convert the range to SHA range for consistent overlap detection
    const { baseSha, headSha } = await convertToShaRange(repo, branch, mode, { start, end, base, head });

    // Fetch commits from GitHub using the SHA range
    const commits = await fetchCommits(repo, branch, mode, { start, end, base, head });

    // Check if any commits were found
    if (!commits || commits.length === 0) {
      let errorMessage = 'No commits found in the specified range.';
      
      // Provide more specific error messages based on mode
      if (mode === 'date') {
        errorMessage = `No commits found between ${start} and ${end} on branch '${branch}'.`;
      } else if (mode === 'sha') {
        errorMessage = `No commits found between SHA '${base}' and '${head}' on branch '${branch}'.`;
      } else if (mode === 'tag') {
        errorMessage = `No commits found between tag '${base}' and '${head}' on branch '${branch}'.`;
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      );
    }

    // Extract commit SHAs for overlap detection (use full SHA values)
    const commitsList = commits.map(commit => commit.sha);

    // Check for overlapping commits before generating changelog
    const hasOverlap = await checkCommitsOverlap(repo, branch, commitsList);
    if (hasOverlap) {
      return NextResponse.json(
        { error: 'A changelog for this commit range already exists. Some commits have already been included in another changelog.' },
        { status: 400 }
      );
    }

    // Generate changelog using AI only if no overlaps found
    const markdown = await generateChangelog(commits);

    // Return the generated markdown with SHA range and commits list for database storage
    return NextResponse.json({
      markdown,
      repo,
      branch,
      mode,
      // Return the converted SHA range for overlap detection
      baseSha,
      headSha,
      // Return the commits list for overlap detection
      commits_list: commitsList,
      // Also return original parameters for display purposes
      originalParams: {
        start,
        end,
        base,
        head
      }
    }, { status: 200 });

  } catch (error) {
    console.error('API Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      if (error.message.includes('Missing required environment variables')) {
        return NextResponse.json(
          { error: 'Server configuration error' },
          { status: 500 }
        );
      }

      if (error.message.includes('Repository not found')) {
        return NextResponse.json(
          { error: 'Repository not found or not accessible' },
          { status: 404 }
        );
      }

      if (error.message.includes('Tag') && error.message.includes('not found')) {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        );
      }

      if (error.message.includes('GitHub API error')) {
        return NextResponse.json(
          { error: 'Failed to fetch repository data' },
          { status: 502 }
        );
      }

      if (error.message.includes('OpenAI')) {
        return NextResponse.json(
          { error: 'AI service unavailable' },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 