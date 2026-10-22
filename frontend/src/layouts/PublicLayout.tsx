import React from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Moon, Sun, ArrowRight, Shield } from 'lucide-react';
import { BrandLogo } from '../components/shared/BrandLogo';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Primitives';

export function PublicLayout() {
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <BrandLogo to="/" />
            <nav aria-label="Public navigation" className="hidden md:flex items-center gap-6 text-sm font-medium">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }
              >
                Overview
              </NavLink>
              <NavLink
                to="/features"
                className={({ isActive }) =>
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }
              >
                Capabilities & Architecture
              </NavLink>
              <NavLink
                to="/security"
                className={({ isActive }) =>
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
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
              className="rounded-lg border border-slate-200 dark:border-slate-800 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900"
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
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 py-10">
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

