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
          className="flex min-h-[50vh] w-full flex-col items-center justify-center gap-3 animate-fade-in"
          role="status"
          aria-label="Loading page"
        >
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/25">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500 animate-pulse">
            Loading workspace...
          </p>
        </div>
      }
    >
      <div className="animate-fade-in w-full">
        {children}
      </div>
    </Suspense>
  );
}
