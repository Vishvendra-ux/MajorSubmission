import React from 'react';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export function BrandLogo({
  to = '/',
  collapsed = false,
}: {
  to?: string;
  collapsed?: boolean;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg"
    >
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 via-blue-900 to-blue-600 text-white shadow-sm">
        <ShieldCheck className="h-5 w-5" />
        <Sparkles className="h-2.5 w-2.5 text-blue-300 absolute top-1 right-1" />
      </div>
      {!collapsed && (
        <div className="flex flex-col">
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white leading-none">
            SUMIND<span className="text-blue-600 dark:text-blue-400">-IQ</span>
          </span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400 mt-0.5">
            Grounded Enterprise AI
          </span>
        </div>
      )}
    </Link>
  );
}

