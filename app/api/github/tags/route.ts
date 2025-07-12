import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const repo = searchParams.get('repo');

    if (!repo) {
      return NextResponse.json(
        { error: 'Repository parameter is required' },
        { status: 400 }
      );
    }

    const token = process.env.GITHUB_PAT;
    if (!token) {
      return NextResponse.json(
        { error: 'GitHub PAT not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(`https://api.github.com/repos/${repo}/tags`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Relix-Changelog-Generator'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Repository not found or not accessible' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `GitHub API error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const tags = await response.json();
    return NextResponse.json(tags);

  } catch (error) {
    console.error('GitHub tags API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 