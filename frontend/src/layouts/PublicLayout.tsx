import React, { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  ArrowRight,
  ChevronRight,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { BrandLogo } from '../components/shared/BrandLogo';
import { PageSuspense } from '../components/shared/PageSuspense';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Primitives';

const publicLinks = [
  { to: '/', label: 'Overview', end: true },
  { to: '/features', label: 'Platform' },
  { to: '/security', label: 'Security' },
];

export function PublicLayout() {
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated, user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
      isActive
        ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-blue-300 dark:ring-slate-700'
        : 'text-slate-600 hover:bg-white/70 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white'
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 shadow-[0_10px_36px_-34px_rgba(15,23,42,0.5)] backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-8">
            <BrandLogo to="/" />
            <nav
              aria-label="Public navigation"
              className="hidden items-center gap-1 rounded-2xl bg-slate-100/80 p-1 md:flex dark:bg-slate-900/80"
            >
              {publicLinks.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={navLinkClass}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? (
                <Sun className="h-[18px] w-[18px]" />
              ) : (
                <Moon className="h-[18px] w-[18px]" />
              )}
            </button>

            {isAuthenticated ? (
              <Link to="/app/dashboard" className="hidden md:block">
                <Button variant="primary" size="md">
                  Open workspace <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <div className="hidden items-center gap-2 md:flex">
                <Link to="/login">
                  <Button variant="ghost" size="md">
                    Sign in
                  </Button>
                </Link>
                <Link to="/register">
                  <Button variant="primary" size="md">
                    Get started <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-controls="public-mobile-navigation"
              aria-expanded={mobileMenuOpen}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 md:hidden dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-slate-200/80 bg-white/95 px-4 pb-4 pt-3 shadow-lg shadow-slate-950/5 md:hidden dark:border-slate-800 dark:bg-slate-950/95">
            <nav
              id="public-mobile-navigation"
              aria-label="Mobile navigation"
              className="mx-auto grid max-w-7xl gap-1"
            >
              {publicLinks.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-semibold ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                        : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900'
                    }`
                  }
                >
                  {item.label}
                  <ChevronRight className="h-4 w-4 opacity-60" />
                </NavLink>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                {isAuthenticated ? (
                  <Link
                    to="/app/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="col-span-2"
                  >
                    <Button variant="primary" className="w-full">
                      Open {user?.role ? `${user.role} ` : ''}workspace{' '}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                ) : (
                  <>
                    <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="outline" className="w-full">
                        Sign in
                      </Button>
                    </Link>
                    <Link
                      to="/register"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Button variant="primary" className="w-full">
                        Get started
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">
        <PageSuspense>
          <Outlet />
        </PageSuspense>
      </main>

      <footer className="border-t border-slate-200/80 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-9 sm:px-6 md:grid-cols-[1.2fr_0.8fr] md:items-center lg:px-8">
          <div className="flex flex-col items-start gap-3">
            <BrandLogo to="/" />
            <p className="max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
              A grounded knowledge workspace for finding answers across the
              documents your team can access.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-xs font-medium text-slate-600 dark:text-slate-300 md:justify-end">
            <Link
              to="/features"
              className="transition hover:text-blue-700 dark:hover:text-blue-300"
            >
              Platform
            </Link>
            <Link
              to="/security"
              className="inline-flex items-center gap-1.5 transition hover:text-blue-700 dark:hover:text-blue-300"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Security
            </Link>
            <Link
              to="/privacy"
              className="transition hover:text-blue-700 dark:hover:text-blue-300"
            >
              Privacy <span className="text-slate-400">(draft)</span>
            </Link>
            <Link
              to="/terms"
              className="transition hover:text-blue-700 dark:hover:text-blue-300"
            >
              Terms <span className="text-slate-400">(draft)</span>
            </Link>
            <span className="w-full text-xs text-slate-400 md:w-auto md:border-l md:border-slate-300 md:pl-5 dark:md:border-slate-700">
              © {new Date().getFullYear()} SUMIND-IQ
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
