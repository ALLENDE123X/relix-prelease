'use client'

import { useEffect } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Changelog page error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Alert className="max-w-md border-destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Something went wrong!</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="mb-4">
                We encountered an error while loading the changelog. This could be due to:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm mb-4">
                <li>Network connectivity issues</li>
                <li>API service temporarily unavailable</li>
                <li>Invalid repository slug</li>
              </ul>
              <Button
                onClick={reset}
                variant="outline"
                size="sm"
                className="gap-2"
                aria-label="Retry loading the changelog"
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </div>
  )
} 