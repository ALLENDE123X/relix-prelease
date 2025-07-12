import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Environment validation
function validateEnvironment() {
  const required = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return required as Record<string, string>;
}

// Database types
interface ReleaseSlice {
  id: string;
  published_at: string;
  repo: string;
  branch: string;
  mode: 'date' | 'sha' | 'tag';
  start_date?: string;
  end_date?: string;
  base_sha?: string;
  head_sha?: string;
  base_tag?: string;
  head_tag?: string;
  markdown: string;
  commits_list: string[];
  owner_id?: string;
}

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

// GET handler - fetch all repositories with changelogs
export async function GET(request: NextRequest) {
  try {
    const env = validateEnvironment();
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all release slices from database
    const { data, error } = await supabase
      .from('release_slices')
      .select('*')
      .order('published_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch repositories' },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json([]);
    }

    // Group by repository
    const repoGroups = new Map<string, ReleaseSlice[]>();
    
    for (const release of data) {
      if (!repoGroups.has(release.repo)) {
        repoGroups.set(release.repo, []);
      }
      repoGroups.get(release.repo)!.push(release);
    }

    // Transform to summary format
    const repoSummaries: RepoSummary[] = Array.from(repoGroups.entries()).map(([repo, releases]) => {
      // Get unique branches
      const branches = [...new Set(releases.map(r => r.branch))];
      
      // Get most recent changelog (already sorted by published_at desc)
      const mostRecent = releases[0];
      
      // Create display range based on mode
      let range = '';
      if (mostRecent.mode === 'date') {
        const startDate = mostRecent.start_date ? new Date(mostRecent.start_date).toISOString().split('T')[0] : 'unknown';
        const endDate = mostRecent.end_date ? new Date(mostRecent.end_date).toISOString().split('T')[0] : 'unknown';
        range = `${startDate} to ${endDate}`;
      } else if (mostRecent.mode === 'sha') {
        const baseSha = mostRecent.base_sha?.substring(0, 7) || 'unknown';
        const headSha = mostRecent.head_sha?.substring(0, 7) || 'unknown';
        range = `${baseSha}...${headSha}`;
      } else if (mostRecent.mode === 'tag') {
        range = `${mostRecent.base_tag || 'unknown'}...${mostRecent.head_tag || 'unknown'}`;
      }

      // Create markdown preview (first 200 characters)
      const markdownPreview = mostRecent.markdown.length > 200 
        ? mostRecent.markdown.substring(0, 200) + '...'
        : mostRecent.markdown;

      return {
        repo,
        totalChangelogs: releases.length,
        branches,
        mostRecentChangelog: {
          id: mostRecent.id,
          publishedAt: mostRecent.published_at,
          branch: mostRecent.branch,
          mode: mostRecent.mode,
          range,
          markdownPreview
        }
      };
    });

    // Sort by most recent changelog date
    repoSummaries.sort((a, b) => 
      new Date(b.mostRecentChangelog.publishedAt).getTime() - 
      new Date(a.mostRecentChangelog.publishedAt).getTime()
    );

    return NextResponse.json(repoSummaries);

  } catch (error) {
    console.error('API Error:', error);

    if (error instanceof Error && error.message.includes('Missing required environment variables')) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 