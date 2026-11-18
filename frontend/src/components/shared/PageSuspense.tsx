import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

// Suspense boundary for lazy-loaded route chunks. Rendered around each
// layout's <Outlet /> so the surrounding app shell stays mounted while a
// page chunk downloads.
export function PageSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-[60vh] w-full items-center justify-center"
          role="status"
          aria-label="Loading page"
        >
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" aria-hidden="true" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
