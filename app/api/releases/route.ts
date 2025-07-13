import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

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

// Database types matching your schema
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
  commits_list: string[]; // Array of commit SHAs
  owner_id?: string;
}

// Transform database record to frontend format
function transformReleaseSlice(slice: ReleaseSlice) {
  // Create a display tag/range based on the mode
  let tag = null;
  let range = '';

  if (slice.mode === 'date') {
    const startDate = slice.start_date ? new Date(slice.start_date).toISOString().split('T')[0] : 'unknown';
    const endDate = slice.end_date ? new Date(slice.end_date).toISOString().split('T')[0] : 'unknown';
    range = `${startDate} to ${endDate}`;
  } else if (slice.mode === 'sha') {
    const baseSha = slice.base_sha?.substring(0, 7) || 'unknown';
    const headSha = slice.head_sha?.substring(0, 7) || 'unknown';
    range = `${baseSha}...${headSha}`;
  } else if (slice.mode === 'tag') {
    tag = slice.head_tag || 'unknown';
    range = `${slice.base_tag || 'unknown'}...${slice.head_tag || 'unknown'}`;
  }

  return {
    id: slice.id,
    repo: slice.repo,
    tag,
    range,
    publishedAt: slice.published_at,
    markdown: slice.markdown,
    mode: slice.mode,
    branch: slice.branch
  };
}

// Validation schema for POST requests
const createReleaseSchema = z.object({
  repo: z.string().min(1, 'Repository is required'),
  branch: z.string().default('main'),
  mode: z.enum(['date', 'sha', 'tag']),
  baseSha: z.string().min(1, 'Base SHA is required'),
  headSha: z.string().min(1, 'Head SHA is required'),
  markdown: z.string().min(1, 'Markdown content is required'),
  commits_list: z.array(z.string()).min(1, 'Commits list is required'),
  originalParams: z.object({
    start: z.string().optional(),
    end: z.string().optional(),
    base: z.string().optional(),
    head: z.string().optional(),
  }).optional(),
});

// GET handler - fetch releases for a repository
export async function GET(request: NextRequest) {
  try {
    const env = validateEnvironment();
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Get repo from query params
    const { searchParams } = new URL(request.url);
    const repo = searchParams.get('repo');
    const branch = searchParams.get('branch');

    if (!repo) {
      return NextResponse.json(
        { error: 'Repository parameter is required' },
        { status: 400 }
      );
    }

    // Fetch releases from database
    let query = supabase
      .from('release_slices')
      .select('*')
      .eq('repo', repo);

    if (branch) {
      query = query.eq('branch', branch);
    }

    const { data, error } = await query.order('published_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch releases' },
        { status: 500 }
      );
    }

    // Transform the data to match frontend expectations
    const releases = (data || []).map(transformReleaseSlice);

    return NextResponse.json(releases);

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

// PUT handler - update existing release markdown
export async function PUT(request: NextRequest) {
  try {
    const env = validateEnvironment();
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Parse request body
    const body = await request.json();
    const { id, markdown } = body;

    if (!id || !markdown) {
      return NextResponse.json(
        { error: 'ID and markdown are required' },
        { status: 400 }
      );
    }

    // Update the markdown content
    const { data, error } = await supabase
      .from('release_slices')
      .update({ markdown })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Database update error:', error);
      return NextResponse.json(
        { error: 'Failed to update changelog' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Changelog not found' },
        { status: 404 }
      );
    }

    // Transform and return the updated data
    const updatedRelease = transformReleaseSlice(data as ReleaseSlice);
    return NextResponse.json(updatedRelease);

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

// POST handler - create new release with markdown
export async function POST(request: NextRequest) {
  try {
    const env = validateEnvironment();
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createReleaseSchema.parse(body);

    const { repo, branch, mode, baseSha, headSha, markdown, commits_list, originalParams } = validatedData;

    // Prepare insert data - store commits_list for overlap detection and SHA range for display
    const insertData: Partial<ReleaseSlice> = {
      repo,
      branch,
      mode,
      markdown,
      commits_list, // Store the full commits_list for overlap detection
      base_sha: baseSha, // Keep SHA range for display purposes
      head_sha: headSha,
      // Store original parameters for display purposes if provided
      ...(originalParams?.start && { start_date: originalParams.start }),
      ...(originalParams?.end && { end_date: originalParams.end }),
      ...(originalParams?.base && mode === 'tag' && { base_tag: originalParams.base }),
      ...(originalParams?.head && mode === 'tag' && { head_tag: originalParams.head }),
    };

    // Insert into database
    const { data, error } = await supabase
      .from('release_slices')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Database insert error:', error);
      return NextResponse.json(
        { error: 'Failed to save changelog to database' },
        { status: 500 }
      );
    }

    // Transform and return the created release
    const newRelease = transformReleaseSlice(data as ReleaseSlice);
    return NextResponse.json(newRelease, { status: 201 });

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

      if (error.message.includes('Database')) {
        return NextResponse.json(
          { error: 'Database operation failed' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 