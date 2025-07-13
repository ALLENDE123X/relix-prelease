import { notFound } from 'next/navigation'
import ChangelogClient from './changelog-client'

export default async function ChangelogPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  
  // Validate URL format: must have at least 2 segments (owner/repo)
  if (slug.length < 2) {
    notFound()
  }
  
  // Reconstruct the repository name from the slug array
  const repoName = slug.join('/')
  
  // Prevent "repos" from being treated as a repository slug
  if (repoName === 'repos') {
    notFound()
  }
  
  return <ChangelogClient slug={repoName} />
} 