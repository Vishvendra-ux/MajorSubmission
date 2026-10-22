import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../src/hooks/useTheme';
import { ToastProvider } from '../src/hooks/useToast';
import { AuthProvider } from '../src/hooks/useAuth';
import { CitationCard } from '../src/components/shared/CitationCard';
import { EmptyState, ErrorState, StatusBadge } from '../src/components/ui/Primitives';
import { LoginPage, RegisterPage } from '../src/pages/public/AuthPages';
import { LandingPage } from '../src/pages/public/PublicPages';
import { AccessDeniedPage, SearchResultsPage } from '../src/pages/app/WorkspacePages';
import { UploadDocumentsPage } from '../src/pages/app/DocumentsPages';

function renderWithProviders(ui: React.ReactElement, initialEntries = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe('SUMIND-IQ Frontend Suite', () => {
  it('renders LandingPage with problem, solution, and call-to-action links', () => {
    renderWithProviders(<LandingPage />);
    expect(
      screen.getByText(/Turn Scattered Internal Documents into/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Permission-First Retrieval & Source-Verified Synthesis/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Launch Knowledge Console/i)).toBeInTheDocument();
  });

  it('validates LoginPage fields and displays quick demo role switcher buttons', async () => {
    renderWithProviders(<LoginPage />, ['/login']);
    expect(screen.getByText(/Sign in to SUMIND-IQ/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Demonstration Role Accounts \[DEMO DATA\]/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
    expect(screen.getByText('Employee')).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Sign In to Workspace/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Please enter a valid work email address/i)
      ).toBeInTheDocument();
    });
  });

  it('validates RegisterPage password strength requirements', async () => {
    renderWithProviders(<RegisterPage />, ['/register']);
    expect(
      screen.getByText(/Create Your SUMIND-IQ Account/i)
    ).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', {
      name: /Register & Launch Workspace/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Full name must be at least 2 characters/i)
      ).toBeInTheDocument();
    });
  });

  it('renders UploadDocumentsPage with format validation and role access controls', () => {
    renderWithProviders(<UploadDocumentsPage />, ['/app/upload']);
    expect(
      screen.getByText(/Upload & Ingest Internal Document/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/PDF, DOCX, PPTX, XLSX, or TXT/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Upload & Run Ingestion Pipeline/i })
    ).toBeInTheDocument();
  });

  it('renders SearchResultsPage with retrieval mode filters and sample queries', () => {
    renderWithProviders(<SearchResultsPage />, ['/app/search']);
    expect(
      screen.getByText(/Semantic & Hybrid Knowledge Search/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Enter a search query to explore indexed knowledge/i)
    ).toBeInTheDocument();
  });

  it('renders CitationCard with verifiable source metadata and handles restricted sources safely', () => {
    const onInspect = vi.fn();
    renderWithProviders(
      <CitationCard
        citation={{
          citation_index: 1,
          chunk_id: 'chunk-12345678',
          document_id: 'doc-999',
          document_title: 'Enterprise Information Security & Zero-Trust Policy',
          file_type: 'pdf',
          location_label: 'Page 2',
          page_number: 2,
          excerpt: 'All Tier-1 systems must maintain an RPO of 15 minutes and RTO of 60 minutes.',
          similarity_score: 0.91,
          is_accessible: true,
        }}
        onInspect={onInspect}
      />
    );

    expect(
      screen.getByText('Enterprise Information Security & Zero-Trust Policy')
    ).toBeInTheDocument();
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    expect(screen.getByText(/Relevance 91%/i)).toBeInTheDocument();

    const inspectBtn = screen.getByRole('button', { name: /Inspect Source/i });
    fireEvent.click(inspectBtn);
    expect(onInspect).toHaveBeenCalledTimes(1);
  });

  it('shows Access Restricted badge on CitationCard when document permission was revoked', () => {
    renderWithProviders(
      <CitationCard
        citation={{
          citation_index: 2,
          chunk_id: 'chunk-revoked',
          document_id: 'doc-restricted',
          document_title: 'Confidential Board M&A Strategy',
          file_type: 'pptx',
          location_label: 'Slide 4',
          excerpt: '[Access to this cited source has been revoked or restricted]',
          is_accessible: false,
        }}
      />
    );

    expect(screen.getByText(/Access Restricted/i)).toBeInTheDocument();
    expect(screen.queryByText(/Inspect Source/i)).not.toBeInTheDocument();
  });

  it('renders EmptyState, ErrorState, and StatusBadge primitives accurately', () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <div>
        <StatusBadge status="ready" />
        <StatusBadge status="processing" />
        <StatusBadge status="failed" />
        <EmptyState
          title="No Indexed Documents"
          description="Upload a PDF or DOCX file to begin."
        />
        <ErrorState
          title="Service Unavailable"
          message="Could not reach knowledge index."
          onRetry={onRetry}
        />
      </div>
    );

    expect(screen.getByText('READY')).toBeInTheDocument();
    expect(screen.getByText('PROCESSING')).toBeInTheDocument();
    expect(screen.getByText('FAILED')).toBeInTheDocument();
    expect(screen.getByText('No Indexed Documents')).toBeInTheDocument();
    expect(screen.getByText('Service Unavailable')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Retry Request/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders AccessDeniedPage for unauthorized role navigation attempts', () => {
    renderWithProviders(<AccessDeniedPage />, ['/app/access-denied']);
    expect(
      screen.getByText(/Access Denied — Insufficient Role Permissions/i)
    ).toBeInTheDocument();
  });
});

