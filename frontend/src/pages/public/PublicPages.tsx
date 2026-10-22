import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Database,
  FileSearch,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Layers,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { Badge, Button, Card } from '../../components/ui/Primitives';

export function LandingPage() {
  return (
    <div className="space-y-24 pb-24">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-200/80 dark:border-slate-800 bg-gradient-to-b from-slate-50 via-white to-slate-50/60 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 pt-16 pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="blue" className="mb-4 px-3 py-1 text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Enterprise Grounded Knowledge Intelligence Platform
            </Badge>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
              Turn Scattered Internal Documents into{' '}
              <span className="text-blue-600 dark:text-blue-400">Verifiable Answers</span>
            </h1>
            <p className="mt-6 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
              SUMIND-IQ unifies your organisation’s PDFs, Word policies, PowerPoint decks, Excel
              spreadsheets, and technical manuals into a permission-aware knowledge base. Ask natural
              language questions and receive AI answers grounded strictly in retrieved evidence—with
              clickable page, slide, and sheet citations.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
              <Link to="/login">
                <Button variant="primary" size="lg">
                  Launch Knowledge Console
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/register">
                <Button variant="outline" size="lg">
                  Register Organisation Workspace
                </Button>
              </Link>
            </div>
          </div>

          {/* Problem vs Solution Comparison Grid */}
          <div className="mt-16 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6 sm:p-8 border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                The Organisational Challenge
              </span>
              <h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
                Why Traditional Enterprise Search & Generic LLMs Fail
              </h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2.5">
                  <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0 mt-1" />
                  <span>
                    <strong>Siloed Formats:</strong> Critical answers are buried across 80-page PDFs,
                    DOCX handbooks, PPTX board decks, and XLSX budget sheets.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0 mt-1" />
                  <span>
                    <strong>Hallucination Risk:</strong> Unconstrained chatbots fabricate policies or
                    financial numbers when evidence is missing.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0 mt-1" />
                  <span>
                    <strong>Permission Leaks:</strong> Naive RAG systems index restricted executive
                    or HR files without enforcing role and workspace boundaries.
                  </span>
                </li>
              </ul>
            </Card>

            <Card className="p-6 sm:p-8 border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                The SUMIND-IQ Architecture
              </span>
              <h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
                Permission-First Retrieval & Source-Verified Synthesis
              </h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-200">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-1" />
                  <span>
                    <strong>Strict Evidence Grounding:</strong> Every claim maps to a verified chunk,
                    document title, and page/slide/sheet location. If evidence is absent, SUMIND-IQ
                    explicitly refuses to guess.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-1" />
                  <span>
                    <strong>Pre-Retrieval RBAC Filtering:</strong> Access policies for Admin,
                    Manager, and Employee roles are enforced before vector search ever executes.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-1" />
                  <span>
                    <strong>Untrusted Document Sandboxing:</strong> Prompt-injection directives
                    embedded inside uploaded files are neutralized and cannot override system rules.
                  </span>
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* Core Capabilities Section */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Engineered for Enterprise Knowledge Governance
          </h2>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            End-to-end document ingestion, hybrid semantic retrieval, hierarchical summarisation, and
            role-scoped auditability.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
              <Card key={idx} className="p-6 hover:border-blue-400 transition-colors">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-white">
                  {feat.title}
                </h3>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {feat.desc}
                </p>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function FeaturesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 space-y-12">
      <div className="max-w-3xl">
        <Badge variant="blue">Platform Capabilities</Badge>
        <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
          Full-Stack RAG & Ingestion Architecture
        </h1>
        <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          SUMIND-IQ separates authoritative relational security state (PostgreSQL), document-oriented
          extraction structures (MongoDB), background job orchestration (Redis & Celery), and
          replaceable AI/embedding interfaces.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-3">
          <div className="flex items-center gap-2.5 text-blue-600 font-semibold text-sm">
            <Layers className="h-5 w-5" />
            17-Stage Document Ingestion Pipeline
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Every uploaded file undergoes extension, MIME, and magic-byte container verification,
            SHA-256 checksum indexing, isolated non-public storage, structure extraction (pages,
            slides, sheets, headings), optional OCR, overlapping chunk segmentation, vector embedding
            generation, and idempotent retry support.
          </p>
        </Card>

        <Card className="p-6 space-y-3">
          <div className="flex items-center gap-2.5 text-blue-600 font-semibold text-sm">
            <FileSearch className="h-5 w-5" />
            Source-First Citation Inspector
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Citations are never trusted blindly from LLM text output. The backend Citation Validator
            maps referenced source indices strictly to authoritative database chunk records and
            re-verifies user permissions whenever historical conversations or citations are opened.
          </p>
        </Card>

        <Card className="p-6 space-y-3">
          <div className="flex items-center gap-2.5 text-blue-600 font-semibold text-sm">
            <Users className="h-5 w-5" />
            Three-Tier Organisational RBAC
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            <strong>Admins</strong> govern users, roles, workspaces, jobs, system settings, and audit
            trails. <strong>Managers</strong> oversee team workspaces, team document permissions, and
            team analytics. <strong>Employees</strong> upload permitted files, search semantically,
            ask grounded questions, and rate answer quality.
          </p>
        </Card>

        <Card className="p-6 space-y-3">
          <div className="flex items-center gap-2.5 text-blue-600 font-semibold text-sm">
            <Database className="h-5 w-5" />
            Polyglot Persistence & Resilient Dev Fallbacks
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            PostgreSQL serves as the single source of truth for identity, ownership, RBAC, and vector
            chunks, while MongoDB stores extracted section trees and ingestion metadata. Live health
            endpoints report exact connection and fallback status.
          </p>
        </Card>
      </div>
    </div>
  );
}

export function SecurityPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 space-y-12">
      <div className="max-w-3xl">
        <Badge variant="emerald">Security & Privacy Engineering</Badge>
        <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
          Zero-Trust Access Enforcement & Data Isolation
        </h1>
        <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          Security in SUMIND-IQ is enforced on every server endpoint, database query, vector search,
          and file download—never by merely hiding buttons in the browser.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 space-y-2.5">
          <Lock className="h-6 w-6 text-blue-600" />
          <h3 className="text-base font-bold">Argon2id & Token Rotation</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Passwords are hashed using Argon2id. Short-lived JWT access tokens are paired with
            revocable, rotated refresh sessions and rate-limited authentication endpoints.
          </p>
        </Card>
        <Card className="p-6 space-y-2.5">
          <ShieldCheck className="h-6 w-6 text-emerald-600" />
          <h3 className="text-base font-bold">Multi-Tenant Boundary Isolation</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Every document, chunk, conversation, and policy is scoped to an Organisation UUID. Cross-tenant
            access attempts via manipulated IDs are blocked with HTTP 403 and recorded in the security
            audit log.
          </p>
        </Card>
        <Card className="p-6 space-y-2.5">
          <FileText className="h-6 w-6 text-indigo-600" />
          <h3 className="text-base font-bold">Signed Downloads & Safe Storage</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Uploaded files are stored outside public static directories with randomized internal
            filenames, path-traversal verification, and short-lived signed download tokens.
          </p>
        </Card>
      </div>
    </div>
  );
}

export function LegalPlaceholderPage({ mode }: { mode: 'privacy' | 'terms' }) {
  const isPrivacy = mode === 'privacy';
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16 space-y-6">
      <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 text-xs text-amber-900 dark:text-amber-200">
        <strong>LEGAL REVIEW PLACEHOLDER NOTICE:</strong> This {isPrivacy ? 'Privacy Policy' : 'Terms of Service'}{' '}
        template is a pre-publication governance placeholder for the SUMIND-IQ platform and must be
        reviewed and approved by organisational legal counsel before commercial deployment.
      </div>
      <Card className="p-8 space-y-4">
        <h1 className="text-2xl font-bold">
          SUMIND-IQ — {isPrivacy ? 'Privacy & Data Protection Policy (Draft)' : 'Terms of Service (Draft)'}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {isPrivacy
            ? 'SUMIND-IQ processes uploaded organisational documents, user identity records, conversation history, and security audit logs strictly for providing permission-aware enterprise search and grounded AI assistance within your organisation boundary.'
            : 'By accessing an organisation workspace on SUMIND-IQ, users agree to upload only authorised corporate documents, respect role-based access classifications, and comply with organisational information security policies.'}
        </p>
        <h2 className="text-base font-semibold pt-2">Data Retention & Deletion</h2>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          When an authorised administrator or document owner deletes a document, SUMIND-IQ removes the
          physical file, all vector chunks, generated summaries, and MongoDB structural metadata.
          Security audit logs are retained according to the configured organisational retention policy.
        </p>
      </Card>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
      <Badge variant="rose">HTTP 404</Badge>
      <h1 className="mt-4 text-3xl font-extrabold text-slate-900 dark:text-white">
        Page Not Found
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
        The page or resource route you requested does not exist. Use the navigation controls below to
        return to the SUMIND-IQ console.
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

