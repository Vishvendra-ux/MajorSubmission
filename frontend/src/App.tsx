import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout';
import { ProtectedRoute } from './layouts/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import {
  FeaturesPage,
  LandingPage,
  LegalPlaceholderPage,
  NotFoundPage,
  SecurityPage,
} from './pages/public/PublicPages';
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
} from './pages/public/AuthPages';
import { OverviewDashboardPage } from './pages/app/OverviewDashboardPage';
import { AssistantPage } from './pages/app/AssistantPage';
import {
  DocumentDetailPage,
  DocumentLibraryPage,
  DocumentSummaryPage,
  UploadDocumentsPage,
} from './pages/app/DocumentsPages';
import {
  AccessDeniedPage,
  ConversationHistoryPage,
  FeedbackHistoryPage,
  NotificationsPage,
  ProfileSettingsPage,
  SearchResultsPage,
} from './pages/app/WorkspacePages';
import {
  TeamAccessManagementPage,
  TeamAnalyticsPage,
  TeamDocumentsPage,
  TeamOverviewPage,
} from './pages/manager/ManagerPages';
import {
  AdminDocumentManagementPage,
  AdminOverviewPage,
  AuditLogsPage,
  JobMonitoringPage,
  OrgWorkspacePage,
  RolePermissionPage,
  SystemConfigPage,
  UsageAnalyticsPage,
  UserManagementPage,
} from './pages/admin/AdminPages';

export function App() {
  return (
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
  );
}

export default App;

