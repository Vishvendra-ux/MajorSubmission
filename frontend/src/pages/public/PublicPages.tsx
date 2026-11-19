import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Cpu,
  Database,
  FileSearch,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Layers,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { Badge, Button, Card } from '../../components/ui/Primitives';

export function LandingPage() {
  return (
    <div className="pb-24">
      <section className="landing-hero relative isolate overflow-hidden border-b border-slate-200/70 dark:border-slate-800">
        <div
          aria-hidden="true"
          className="landing-grid pointer-events-none absolute inset-x-0 top-0 h-[42rem] opacity-70"
        />
        <div className="relative mx-auto max-w-7xl px-4 pb-14 pt-14 sm:px-6 sm:pb-20 sm:pt-20 lg:px-8 lg:pb-24 lg:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-14">
            <div className="max-w-2xl">
              <Badge
                variant="blue"
                className="mb-6 gap-2 rounded-full border-blue-200/80 bg-white/80 px-3.5 py-1.5 text-xs shadow-sm dark:border-blue-900 dark:bg-slate-900/80"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Grounded answers for your team
              </Badge>
              <h1 className="text-balance text-4xl font-bold leading-[1.08] tracking-[-0.045em] text-slate-950 dark:text-white sm:text-5xl lg:text-[3.65rem]">
                Your organization’s knowledge,{' '}
                <span className="bg-gradient-to-r from-blue-700 via-indigo-600 to-violet-600 bg-clip-text text-transparent dark:from-blue-300 dark:via-indigo-300 dark:to-violet-300">
                  clear and cited.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg sm:leading-8">
                Search across policies, manuals, presentations, and spreadsheets. Get answers tied to
                the source pages your team is allowed to see.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/login">
                  <Button variant="primary" size="lg" className="shadow-lg shadow-blue-700/20">
                    Open your knowledge workspace
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/register">
                  <Button variant="outline" size="lg" className="bg-white/80 dark:bg-slate-900/80">
                    Create an organisation workspace
                  </Button>
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs font-medium text-slate-600 dark:text-slate-300">
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Permission-aware search
                </span>
                <span className="inline-flex items-center gap-2">
                  <FileSearch className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Clickable source citations
                </span>
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  Zero-hallucination evidence check
                </span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[590px] lg:ml-auto">
              <div
                aria-hidden="true"
                className="absolute -inset-5 rounded-[36px] bg-gradient-to-br from-blue-300/35 via-indigo-200/25 to-violet-300/35 blur-2xl dark:from-blue-700/20 dark:via-indigo-800/15 dark:to-violet-700/20 animate-pulse-glow"
              />
              <div className="preview-shadow relative overflow-hidden rounded-[26px] border border-white/80 bg-white/95 ring-1 ring-slate-900/[0.04] backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/95 dark:ring-white/[0.06] sm:rounded-[30px] animate-float-slow">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/20">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Knowledge assistant
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Illustrative product preview
                      </p>
                    </div>
                  </div>
                  <Badge variant="emerald" className="hidden sm:inline-flex">
                    Sources verified
                  </Badge>
                </div>

                <div className="space-y-5 p-5 sm:p-6">
                  <div className="ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-gradient-to-br from-blue-600 to-indigo-600 px-4 py-3 text-sm leading-6 text-white shadow-sm">
                    What does our travel policy say about expenses and RPO targets?
                  </div>

                  <div className="flex gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          Grounded response
                        </span>
                        <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          2 verified citations
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
                        The policy defines eligible travel expenses and reimbursement approval tiers{' '}
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          [Source 1]
                        </span>
                        , while Tier-1 disaster recovery mandates a 15-minute RPO{' '}
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          [Source 2]
                        </span>
                        .
                      </p>

                      <div className="mt-4 space-y-2">
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-2xs dark:border-slate-700 dark:bg-slate-900">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                              Travel &amp; Expenses Policy
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                              Page 8 · Expense eligibility
                            </p>
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                        </div>
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-2xs dark:border-slate-700 dark:bg-slate-900">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <FileSpreadsheet className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                              Zero-Trust Security &amp; DR Standard
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                              Section 3 · RPO &amp; RTO Targets
                            </p>
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/50 sm:px-6">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    <Lock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    Access checked before retrieval
                  </span>
                  <span className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:inline">
                    SUMIND-IQ
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-slate-200/70 pt-6 dark:border-slate-800 sm:flex-row">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              One searchable workspace for the files your organisation already uses
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {['PDF', 'DOCX', 'PPTX', 'XLSX', 'TXT'].map((format) => (
                <span
                  key={format}
                  className="rounded-lg border border-slate-200/80 bg-white/70 px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400"
                >
                  {format}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-24 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="blue" className="mb-4">
            Built for trustworthy answers
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            Find the answer. See the source. Know it’s yours to access.
          </h2>
          <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-400 sm:text-base">
            SUMIND-IQ brings your documents together while keeping evidence and access rules in view.
          </p>
        </div>

        <div className="mt-11 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Search,
              title: 'Search naturally',
              copy: 'Ask a question in your own words across policies, guides, and team documents.',
            },
            {
              icon: BookOpen,
              title: 'Follow the evidence',
              copy: 'Open the cited page, slide, or sheet behind an answer and verify the detail.',
            },
            {
              icon: ShieldCheck,
              title: 'Respect every boundary',
              copy: 'Access scope follows the user and workspace before content is retrieved.',
            },
          ].map((item, index) => {
            const Icon = item.icon;
            return (
              <Card
                key={item.title}
                className="interactive-card group relative overflow-hidden p-6 flex flex-col justify-between h-full"
              >
                <div className="mb-5 flex items-start justify-between">
                  <span className="icon-tile">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-slate-300 dark:text-slate-600">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                  {item.copy}
                </p>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 sm:pt-24 lg:px-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <Badge variant="blue" className="mb-4">
              One connected platform
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Built for the full knowledge lifecycle
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-slate-600 dark:text-slate-400">
            From ingestion and discovery to grounded answers, summaries, and governance.
          </p>
        </div>

        <div className="mt-9 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: FileSpreadsheet,
              title: 'Multi-Format Ingestion + OCR',
              desc: 'Parses PDF, DOCX, PPTX, XLSX, and TXT files asynchronously while preserving page, slide, sheet, and section location labels, with Tesseract OCR for scanned pages.',
            },
            {
              icon: Search,
              title: 'Hybrid Semantic + Lexical Search',
              desc: 'Combines vector cosine similarity (pgvector) with keyword overlap ranking, date/type/workspace filters, and highlighted snippet previews.',
            },
            {
              icon: Bot,
              title: 'Citation-Verified AI Assistant',
              desc: 'Multi-turn RAG assistant that validates every citation against actual retrieved chunks and refuses to answer when authorised evidence is insufficient.',
            },
            {
              icon: BookOpen,
              title: 'Hierarchical Document Summaries',
              desc: 'Synthesizes executive and detailed summaries, key dates, numeric thresholds, policy decisions, and action items with direct source citations.',
            },
            {
              icon: KeyRound,
              title: 'Multi-Tenant RBAC & Policies',
              desc: 'Enforces Admin, Manager, and Employee roles across organisations and workspaces, with per-document allow/deny access policy overrides.',
            },
            {
              icon: ShieldCheck,
              title: 'Immutable Security Audit Logs',
              desc: 'Records logins, role modifications, uploads, downloads, permission changes, and denied cross-tenant access attempts without logging secrets.',
            },
          ].map((feat, idx) => {
            const Icon = feat.icon;
            return (
              <Card key={idx} className="interactive-card group p-6 flex flex-col justify-between h-full">
                <div>
                  <div className="icon-tile transition-transform duration-200 group-hover:scale-105">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-slate-900 dark:text-white">
                    {feat.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                    {feat.desc}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Bottom Call-to-Action Banner */}
      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-blue-200/80 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-8 text-white shadow-xl sm:p-12">
          <div className="relative z-10 flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                Enterprise-Ready Knowledge Intelligence
              </span>
              <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
                Ready to explore grounded Q&amp;A with role-scoped citations?
              </h2>
              <p className="mt-2 text-sm text-blue-100 sm:text-base">
                Sign in with one of our pre-seeded demonstration role accounts (Admin, Manager, or
                Employee) or create a dedicated organisation workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/login">
                <Button
                  variant="secondary"
                  size="lg"
                  className="bg-white text-blue-700 hover:bg-blue-50 dark:bg-white dark:text-blue-700"
                >
                  Launch Demo Workspace
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/features">
                <Button
                  variant="outline"
                  size="lg"
                  className="border-white/40 bg-white/10 text-white hover:bg-white/20 dark:border-white/40 dark:bg-white/10 dark:text-white"
                >
                  Explore Architecture
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function FeaturesPage() {
  return (
    <div className="pb-20">
      <section className="landing-hero relative isolate overflow-hidden border-b border-slate-200/70 py-16 dark:border-slate-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <Badge variant="blue">Platform Capabilities &amp; Architecture</Badge>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white sm:text-5xl">
              Full-Stack RAG &amp; Ingestion Architecture
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
              SUMIND-IQ separates authoritative relational security state (PostgreSQL),
              document-oriented extraction structures (MongoDB), background job orchestration (Redis
              &amp; Celery), and replaceable AI/embedding interfaces.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-12 px-4 pt-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card className="interactive-card space-y-3 p-6 flex flex-col justify-between h-full">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="icon-tile">
                  <Layers className="h-5 w-5" />
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  17-Stage Document Ingestion Pipeline
                </h2>
              </div>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                Every uploaded file undergoes extension, MIME, and magic-byte container verification,
                SHA-256 checksum indexing, isolated non-public storage, structure extraction (pages,
                slides, sheets, headings), optional OCR, overlapping chunk segmentation, vector
                embedding generation, and idempotent retry support.
              </p>
            </div>
          </Card>

          <Card className="interactive-card space-y-3 p-6 flex flex-col justify-between h-full">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="icon-tile">
                  <FileSearch className="h-5 w-5" />
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Source-First Citation Inspector
                </h2>
              </div>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                Citations are never trusted blindly from LLM text output. The backend Citation
                Validator maps referenced source indices strictly to authoritative database chunk
                records and re-verifies user permissions whenever historical conversations or
                citations are opened.
              </p>
            </div>
          </Card>

          <Card className="interactive-card space-y-3 p-6 flex flex-col justify-between h-full">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="icon-tile">
                  <Users className="h-5 w-5" />
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Three-Tier Organisational RBAC
                </h2>
              </div>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                <strong>Admins</strong> govern users, roles, workspaces, jobs, system settings, and
                audit trails. <strong>Managers</strong> oversee team workspaces, team document
                permissions, and team analytics. <strong>Employees</strong> upload permitted files,
                search semantically, ask grounded questions, and rate answer quality.
              </p>
            </div>
          </Card>

          <Card className="interactive-card space-y-3 p-6 flex flex-col justify-between h-full">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="icon-tile">
                  <Database className="h-5 w-5" />
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Polyglot Persistence &amp; Resilient Dev Fallbacks
                </h2>
              </div>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                PostgreSQL serves as the single source of truth for identity, ownership, RBAC, and
                vector chunks, while MongoDB stores extracted section trees and ingestion metadata.
                Live health endpoints report exact connection and fallback status.
              </p>
            </div>
          </Card>
        </div>

        <Card className="p-8">
          <div className="flex items-center gap-3">
            <div className="icon-tile">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                End-to-End Grounded Retrieval Flow
              </h2>
              <p className="text-xs text-slate-500">
                How SUMIND-IQ guarantees every answer is permission-checked and source-cited
              </p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
            {[
              {
                step: '01',
                title: 'Pre-Retrieval ACL Filter',
                desc: 'Resolves organisation, workspace, role, and allow/deny policies before vector search runs.',
              },
              {
                step: '02',
                title: 'Hybrid Vector + Lexical Rank',
                desc: 'Combines 384-d cosine similarity with keyword overlap across authorised chunks.',
              },
              {
                step: '03',
                title: 'Sandboxed Evidence Synthesis',
                desc: 'Wraps untrusted passages in XML delimiters and requires inline [Source N] markers.',
              },
              {
                step: '04',
                title: 'Citation & Refusal Verification',
                desc: 'Verifies every citation ID against retrieved chunks or issues an explicit refusal.',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50 flex flex-col justify-between h-full"
              >
                <div>
                  <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400">
                    STEP {item.step}
                  </span>
                  <h3 className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function SecurityPage() {
  return (
    <div className="pb-20">
      <section className="landing-hero relative isolate overflow-hidden border-b border-slate-200/70 py-16 dark:border-slate-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <Badge variant="emerald">Security &amp; Privacy Engineering</Badge>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white sm:text-5xl">
              Zero-Trust Access Enforcement &amp; Data Isolation
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
              Security in SUMIND-IQ is enforced on every server endpoint, database query, vector
              search, and file download—never by merely hiding buttons in the browser.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card className="interactive-card space-y-3 p-6 flex flex-col justify-between h-full">
            <div className="space-y-3">
              <div className="icon-tile">
                <Lock className="h-5 w-5" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Argon2id &amp; Token Rotation
              </h2>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
                Passwords are hashed using Argon2id. Short-lived JWT access tokens are paired with
                revocable, rotated refresh sessions and rate-limited authentication endpoints.
              </p>
            </div>
          </Card>

          <Card className="interactive-card space-y-3 p-6 flex flex-col justify-between h-full">
            <div className="space-y-3">
              <div className="icon-tile">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Multi-Tenant Boundary Isolation
              </h2>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
                Every document, chunk, conversation, and policy is scoped to an Organisation UUID.
                Cross-tenant access attempts via manipulated IDs are blocked with HTTP 403 and
                recorded in the security audit log.
              </p>
            </div>
          </Card>

          <Card className="interactive-card space-y-3 p-6 flex flex-col justify-between h-full">
            <div className="space-y-3">
              <div className="icon-tile">
                <FileText className="h-5 w-5" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Signed Downloads &amp; Safe Storage
              </h2>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
                Uploaded files are stored outside public static directories with randomized internal
                filenames, path-traversal verification, and short-lived signed download tokens.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function LegalPlaceholderPage({ mode }: { mode: 'privacy' | 'terms' }) {
  const isPrivacy = mode === 'privacy';
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-16 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>LEGAL REVIEW PLACEHOLDER NOTICE:</strong> This{' '}
        {isPrivacy ? 'Privacy Policy' : 'Terms of Service'} template is a pre-publication governance
        placeholder for the SUMIND-IQ platform and must be reviewed and approved by organisational
        legal counsel before commercial deployment.
      </div>
      <Card className="space-y-4 p-8">
        <h1 className="text-2xl font-bold">
          SUMIND-IQ —{' '}
          {isPrivacy ? 'Privacy & Data Protection Policy (Draft)' : 'Terms of Service (Draft)'}
        </h1>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {isPrivacy
            ? 'SUMIND-IQ processes uploaded organisational documents, user identity records, conversation history, and security audit logs strictly for providing permission-aware enterprise search and grounded AI assistance within your organisation boundary.'
            : 'By accessing an organisation workspace on SUMIND-IQ, users agree to upload only authorised corporate documents, respect role-based access classifications, and comply with organisational information security policies.'}
        </p>
        <h2 className="pt-2 text-base font-semibold">Data Retention &amp; Deletion</h2>
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          When an authorised administrator or document owner deletes a document, SUMIND-IQ removes
          the physical file, all vector chunks, generated summaries, and MongoDB structural
          metadata. Security audit logs are retained according to the configured organisational
          retention policy.
        </p>
      </Card>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="landing-hero flex min-h-[75vh] flex-col items-center justify-center px-4 text-center">
      <Badge variant="rose">HTTP 404</Badge>
      <h1 className="mt-4 text-3xl font-extrabold text-slate-950 dark:text-white sm:text-4xl">
        Page Not Found
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
        The page or resource route you requested does not exist. Use the navigation controls below
        to return to the SUMIND-IQ console.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link to="/">
          <Button variant="outline">Back to Home</Button>
        </Link>
        <Link to="/app/dashboard">
          <Button variant="primary">Go to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
