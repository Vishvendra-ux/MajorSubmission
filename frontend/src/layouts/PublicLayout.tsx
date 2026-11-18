import React from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Moon, Sun, ArrowRight, Shield } from 'lucide-react';
import { BrandLogo } from '../components/shared/BrandLogo';
import { PageSuspense } from '../components/shared/PageSuspense';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Primitives';

export function PublicLayout() {
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 shadow-[0_10px_36px_-34px_rgba(15,23,42,0.5)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <BrandLogo to="/" />
            <nav aria-label="Public navigation" className="hidden md:flex items-center gap-1 rounded-2xl bg-slate-50/90 p-1 text-sm font-medium dark:bg-slate-900/70">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  isActive
                    ? 'rounded-xl bg-white px-3 py-2 font-semibold text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300'
                    : 'rounded-xl px-3 py-2 text-slate-600 transition-colors hover:text-blue-700 dark:text-slate-300 dark:hover:text-white'
                }
              >
                Overview
              </NavLink>
              <NavLink
                to="/features"
                className={({ isActive }) =>
                  isActive
                    ? 'rounded-xl bg-white px-3 py-2 font-semibold text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300'
                    : 'rounded-xl px-3 py-2 text-slate-600 transition-colors hover:text-blue-700 dark:text-slate-300 dark:hover:text-white'
                }
              >
                Capabilities & Architecture
              </NavLink>
              <NavLink
                to="/security"
                className={({ isActive }) =>
                  isActive
                    ? 'rounded-xl bg-white px-3 py-2 font-semibold text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300'
                    : 'rounded-xl px-3 py-2 text-slate-600 transition-colors hover:text-blue-700 dark:text-slate-300 dark:hover:text-white'
                }
              >
                Security & Governance
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle colour theme"
              className="rounded-xl border border-slate-200 bg-white/80 p-2.5 text-slate-600 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {isAuthenticated ? (
              <Link to="/app/dashboard">
                <Button variant="primary" size="md">
                  Open Console ({user?.role.toUpperCase()})
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="md">
                    Sign In
                  </Button>
                </Link>
                <Link to="/register">
                  <Button variant="primary" size="md">
                    Get Started
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <PageSuspense>
          <Outlet />
        </PageSuspense>
      </main>

      <footer className="border-t border-slate-200/80 bg-slate-50/80 py-9 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <BrandLogo to="/" />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              • Enterprise Grounded Knowledge Management Platform
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs text-slate-500 dark:text-slate-400">
            <Link to="/features" className="hover:text-blue-600">
              Features
            </Link>
            <Link to="/security" className="hover:text-blue-600 inline-flex items-center gap-1">
              <Shield className="h-3.5 w-3.5" />
              Security
            </Link>
            <Link to="/privacy" className="hover:text-blue-600">
              Privacy Policy (Draft Review)
            </Link>
            <Link to="/terms" className="hover:text-blue-600">
              Terms of Service (Draft Review)
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

