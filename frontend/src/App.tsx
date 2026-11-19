import React, { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout';
import { ProtectedRoute } from './layouts/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { InteractiveDots } from './components/shared/InteractiveDots';

// Route-level code splitting: each page module ships as its own chunk so the
// initial bundle stays small and heavy modules (recharts, editors) load on
// demand. The Suspense boundaries live in the layouts' <Outlet /> so the app
// shell stays mounted while a page chunk is downloading.
function lazyPage<P>(
  load: () => Promise<unknown>,
  name: string
): React.LazyExoticComponent<React.ComponentType<P>> {
  return lazy(() =>
    (load as () => Promise<Record<string, unknown>>)().then((module) => ({
      default: module[name] as React.ComponentType<P>,
    }))
  );
}

const loadPublic = () => import('./pages/public/PublicPages');
const loadAuth = () => import('./pages/public/AuthPages');
const loadDashboard = () => import('./pages/app/OverviewDashboardPage');
const loadAssistant = () => import('./pages/app/AssistantPage');
const loadDocuments = () => import('./pages/app/DocumentsPages');
const loadWorkspace = () => import('./pages/app/WorkspacePages');
const loadManager = () => import('./pages/manager/ManagerPages');
const loadAdmin = () => import('./pages/admin/AdminPages');

// Public
const LandingPage = lazyPage(loadPublic, 'LandingPage');
const FeaturesPage = lazyPage(loadPublic, 'FeaturesPage');
const SecurityPage = lazyPage(loadPublic, 'SecurityPage');
const LegalPlaceholderPage = lazyPage<{ mode: 'privacy' | 'terms' }>(loadPublic, 'LegalPlaceholderPage');
const NotFoundPage = lazyPage(loadPublic, 'NotFoundPage');

// Auth
const LoginPage = lazyPage(loadAuth, 'LoginPage');
const RegisterPage = lazyPage(loadAuth, 'RegisterPage');
const ForgotPasswordPage = lazyPage(loadAuth, 'ForgotPasswordPage');
const ResetPasswordPage = lazyPage(loadAuth, 'ResetPasswordPage');

// Authenticated workspace
const OverviewDashboardPage = lazyPage(loadDashboard, 'OverviewDashboardPage');
const AssistantPage = lazyPage(loadAssistant, 'AssistantPage');
const DocumentLibraryPage = lazyPage(loadDocuments, 'DocumentLibraryPage');
const UploadDocumentsPage = lazyPage(loadDocuments, 'UploadDocumentsPage');
const DocumentDetailPage = lazyPage(loadDocuments, 'DocumentDetailPage');
const DocumentSummaryPage = lazyPage(loadDocuments, 'DocumentSummaryPage');
const SearchResultsPage = lazyPage(loadWorkspace, 'SearchResultsPage');
const ConversationHistoryPage = lazyPage(loadWorkspace, 'ConversationHistoryPage');
const FeedbackHistoryPage = lazyPage(loadWorkspace, 'FeedbackHistoryPage');
const NotificationsPage = lazyPage(loadWorkspace, 'NotificationsPage');
const ProfileSettingsPage = lazyPage(loadWorkspace, 'ProfileSettingsPage');
const AccessDeniedPage = lazyPage(loadWorkspace, 'AccessDeniedPage');

// Manager scope
const TeamOverviewPage = lazyPage(loadManager, 'TeamOverviewPage');
const TeamDocumentsPage = lazyPage(loadManager, 'TeamDocumentsPage');
const TeamAnalyticsPage = lazyPage(loadManager, 'TeamAnalyticsPage');
const TeamAccessManagementPage = lazyPage(loadManager, 'TeamAccessManagementPage');

// Admin governance
const AdminOverviewPage = lazyPage(loadAdmin, 'AdminOverviewPage');
const UserManagementPage = lazyPage(loadAdmin, 'UserManagementPage');
const RolePermissionPage = lazyPage(loadAdmin, 'RolePermissionPage');
const OrgWorkspacePage = lazyPage(loadAdmin, 'OrgWorkspacePage');
const AdminDocumentManagementPage = lazyPage(loadAdmin, 'AdminDocumentManagementPage');
const AuditLogsPage = lazyPage(loadAdmin, 'AuditLogsPage');
const UsageAnalyticsPage = lazyPage(loadAdmin, 'UsageAnalyticsPage');
const JobMonitoringPage = lazyPage(loadAdmin, 'JobMonitoringPage');
const SystemConfigPage = lazyPage(loadAdmin, 'SystemConfigPage');

export function App() {
  return (
    <>
      <InteractiveDots />
      <Routes>
      {/* Public pages */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/privacy" element={<LegalPlaceholderPage mode="privacy" />} />
        <Route path="/terms" element={<LegalPlaceholderPage mode="terms" />} />
      </Route>

      {/* Authenticated Application Routes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<OverviewDashboardPage />} />
          <Route path="assistant" element={<AssistantPage />} />
          <Route path="search" element={<SearchResultsPage />} />
          <Route path="documents" element={<DocumentLibraryPage />} />
          <Route path="upload" element={<UploadDocumentsPage />} />
          <Route path="documents/:documentId" element={<DocumentDetailPage />} />
          <Route path="documents/:documentId/summary" element={<DocumentSummaryPage />} />
          <Route path="summaries" element={<DocumentSummaryPage />} />
          <Route path="conversations" element={<ConversationHistoryPage />} />
          <Route path="feedback" element={<FeedbackHistoryPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfileSettingsPage />} />
          <Route path="access-denied" element={<AccessDeniedPage />} />

          {/* Manager Scope Routes */}
          <Route element={<ProtectedRoute allowedRoles={['admin', 'manager']} />}>
            <Route path="manager/overview" element={<TeamOverviewPage />} />
            <Route path="manager/documents" element={<TeamDocumentsPage />} />
            <Route path="manager/analytics" element={<TeamAnalyticsPage />} />
            <Route path="manager/access" element={<TeamAccessManagementPage />} />
          </Route>

          {/* Admin Governance Routes */}
          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="admin/overview" element={<AdminOverviewPage />} />
            <Route path="admin/users" element={<UserManagementPage />} />
            <Route path="admin/roles" element={<RolePermissionPage />} />
            <Route path="admin/workspaces" element={<OrgWorkspacePage />} />
            <Route path="admin/documents" element={<AdminDocumentManagementPage />} />
            <Route path="admin/audit-logs" element={<AuditLogsPage />} />
            <Route path="admin/analytics" element={<UsageAnalyticsPage />} />
            <Route path="admin/jobs" element={<JobMonitoringPage />} />
            <Route path="admin/system-config" element={<SystemConfigPage />} />
          </Route>
        </Route>
      </Route>

      {/* Fallback 404 */}
      <Route element={<PublicLayout />}>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
    </>
  );
}

export default App;
