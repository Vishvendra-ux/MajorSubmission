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
      className="group inline-flex items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
    >
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white shadow-md shadow-blue-600/25 ring-1 ring-white/20 transition-transform duration-200 group-hover:scale-105">
        <ShieldCheck className="h-5 w-5" />
        <Sparkles className="absolute right-1 top-1 h-2.5 w-2.5 text-blue-200" />
      </div>
      {!collapsed && (
        <div className="flex flex-col">
          <span className="text-base font-extrabold leading-none tracking-tight text-slate-950 dark:text-white">
            SUMIND
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-indigo-400">
              -IQ
            </span>
          </span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            Grounded Enterprise AI
          </span>
        </div>
      )}
    </Link>
  );
}
