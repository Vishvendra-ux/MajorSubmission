import React from 'react';
import { BrainCircuit, Check } from 'lucide-react';
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
      className="group inline-flex items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
    >
      <div
        className={`relative flex shrink-0 items-center justify-center bg-gradient-to-br from-slate-950 via-blue-900 to-blue-600 text-white shadow-lg shadow-blue-900/20 ring-1 ring-white/25 transition-transform duration-200 group-hover:scale-[1.04] dark:from-blue-950 dark:via-blue-800 dark:to-indigo-600 ${collapsed ? 'h-8 w-8 rounded-xl' : 'h-11 w-11 rounded-2xl'}`}
      >
        <BrainCircuit
          className={
            collapsed
              ? 'h-4 w-4 stroke-[1.8]'
              : 'h-[21px] w-[21px] stroke-[1.8]'
          }
        />
        <span className="absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-white shadow-sm dark:border-slate-950">
          <Check className="h-2.5 w-2.5 stroke-[3]" />
        </span>
      </div>
      {!collapsed && (
        <div className="flex flex-col">
          <span className="text-base font-extrabold leading-none tracking-[-0.035em] text-slate-950 dark:text-white">
            SUMIND
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-indigo-400">
              -IQ
            </span>
          </span>
          <span className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Knowledge, verified
          </span>
        </div>
      )}
    </Link>
  );
}
