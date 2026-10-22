import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Briefcase,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareHeart,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Upload,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { BrandLogo } from '../components/shared/BrandLogo';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { apiRequest } from '../services/apiClient';
import { Badge, Button, Dialog } from '../components/ui/Primitives';
import type { NotificationItem } from '../types/api';

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!user) return;
    apiRequest<{ unread_count: number; items: NotificationItem[] }>('/notifications')
      .then((res) => setUnreadCount(res.unread_count))
      .catch(() => {});
  }, [user, location.pathname]);

  const workspaceItems: NavItem[] = [
    { label: 'Overview Dashboard', to: '/app/dashboard', icon: LayoutDashboard },
    { label: 'AI Knowledge Assistant', to: '/app/assistant', icon: Bot },
    { label: 'Semantic Search', to: '/app/search', icon: Search },
    { label: 'Document Library', to: '/app/documents', icon: FileText },
    { label: 'Upload Documents', to: '/app/upload', icon: Upload },
    { label: 'Document Summaries', to: '/app/summaries', icon: Sparkles },
    { label: 'Conversation History', to: '/app/conversations', icon: History },
    { label: 'Answer Feedback', to: '/app/feedback', icon: MessageSquareHeart },
    { label: 'Notifications', to: '/app/notifications', icon: Bell },
    { label: 'Profile & Settings', to: '/app/profile', icon: UserIcon },
  ];

  const managerItems: NavItem[] =
    user?.role === 'manager' || user?.role === 'admin'
      ? [
          { label: 'Team Overview', to: '/app/manager/overview', icon: Briefcase },
          { label: 'Team Documents', to: '/app/manager/documents', icon: BookOpen },
          { label: 'Team Usage Analytics', to: '/app/manager/analytics', icon: BarChart3 },
          { label: 'Team & Access Scope', to: '/app/manager/access', icon: KeyRound },
        ]
      : [];

  const adminItems: NavItem[] =
    user?.role === 'admin'
      ? [
          { label: 'Admin Overview', to: '/app/admin/overview', icon: ShieldCheck },
          { label: 'User Management', to: '/app/admin/users', icon: Users },
          { label: 'Roles & Permissions', to: '/app/admin/roles', icon: KeyRound },
          { label: 'Org & Workspaces', to: '/app/admin/workspaces', icon: Building2 },
          { label: 'Document Governance', to: '/app/admin/documents', icon: FileSpreadsheet },
          { label: 'Usage Analytics', to: '/app/admin/analytics', icon: BarChart3 },
          { label: 'Audit Logs', to: '/app/admin/audit-logs', icon: ShieldCheck },
          { label: 'Jobs & Failures', to: '/app/admin/jobs', icon: Activity },
          { label: 'System Configuration', to: '/app/admin/system-config', icon: Settings },
        ]
      : [];

  const handleCommandSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickQuery.trim()) return;
    setCommandOpen(false);
    navigate(`/app/search?q=${encodeURIComponent(quickQuery.trim())}`);
    setQuickQuery('');
  };

  const breadcrumbs = location.pathname
    .split('/')
    .filter(Boolean)
    .map((seg) => seg.replace(/-/g, ' '));

  const renderSection = (title: string, items: NavItem[]) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-5">
        {!collapsed && (
          <p className="px-3 mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {title}
          </p>
        )}
        <div className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Collapsible Left Sidebar */}
      <aside
        aria-label="Application Sidebar"
        className={`hidden lg:flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all duration-200 ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4">
          <BrandLogo to="/app/dashboard" collapsed={collapsed} />
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {renderSection('Knowledge Workspace', workspaceItems)}
          {renderSection('Team Management', managerItems)}
          {renderSection('Administration', adminItems)}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 p-3">
          {!collapsed ? (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
              <div className="flex items-center justify-between">
                <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {user?.full_name}
                </span>
                <Badge variant="blue">{user?.role.toUpperCase()}</Badge>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                {user?.organisation_name}
              </p>
            </div>
          ) : (
            <div className="flex justify-center">
              <Badge variant="blue">{user?.role.slice(0, 1).toUpperCase()}</Badge>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 flex w-72 flex-col bg-white dark:bg-slate-900 p-4 shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <BrandLogo to="/app/dashboard" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="p-1.5 rounded-lg text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 flex-1">
              {renderSection('Knowledge Workspace', workspaceItems)}
              {renderSection('Team Management', managerItems)}
              {renderSection('Administration', adminItems)}
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 px-4 sm:px-6 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden rounded-lg p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="h-5 w-5" />
            </button>

            <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 capitalize truncate">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span>/</span>}
                  <span
                    className={
                      idx === breadcrumbs.length - 1
                        ? 'font-semibold text-slate-900 dark:text-slate-100'
                        : ''
                    }
                  >
                    {crumb}
                  </span>
                </React.Fragment>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Global Command Search Entry Point */}
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:border-blue-400 transition-colors"
            >
              <Search className="h-3.5 w-3.5 text-blue-600" />
              <span className="hidden md:inline">Search knowledge base or jump...</span>
              <span className="md:hidden">Search</span>
              <kbd className="hidden sm:inline-block rounded bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 border border-slate-200 dark:border-slate-700">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="rounded-lg border border-slate-200 dark:border-slate-800 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <Link
              to="/app/notifications"
              aria-label="Notifications"
              className="relative rounded-lg border border-slate-200 dark:border-slate-800 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </Link>

            <Link
              to="/app/profile"
              className="hidden sm:flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <UserIcon className="h-3.5 w-3.5 text-blue-600" />
              <span className="max-w-28 truncate">{user?.full_name}</span>
            </Link>

            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Global Command Search Modal */}
      <Dialog
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        title="Global Knowledge & Command Search"
        description="Search across all authorised documents semantically or navigate directly to a module."
      >
        <form onSubmit={handleCommandSearch} className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              autoFocus
              value={quickQuery}
              onChange={(e) => setQuickQuery(e.target.value)}
              placeholder="Ask a question or enter keywords (e.g., incident response SLA, annual leave)..."
              className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
            />
            <Button type="submit" variant="primary">
              Search
            </Button>
          </div>

          <div className="space-y-2 pt-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Quick Actions
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setCommandOpen(false);
                  navigate('/app/assistant');
                }}
                className="flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 text-left text-xs font-medium hover:border-blue-500"
              >
                <Bot className="h-4 w-4 text-blue-600" />
                Ask AI Knowledge Assistant
              </button>
              <button
                type="button"
                onClick={() => {
                  setCommandOpen(false);
                  navigate('/app/upload');
                }}
                className="flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 text-left text-xs font-medium hover:border-blue-500"
              >
                <Upload className="h-4 w-4 text-blue-600" />
                Upload Internal Document
              </button>
              <button
                type="button"
                onClick={() => {
                  setCommandOpen(false);
                  navigate('/app/documents');
                }}
                className="flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 text-left text-xs font-medium hover:border-blue-500"
              >
                <FileText className="h-4 w-4 text-blue-600" />
                Browse Document Library
              </button>
              <button
                type="button"
                onClick={() => {
                  setCommandOpen(false);
                  navigate('/app/summaries');
                }}
                className="flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 text-left text-xs font-medium hover:border-blue-500"
              >
                <Sparkles className="h-4 w-4 text-blue-600" />
                Executive Document Summaries
              </button>
            </div>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

