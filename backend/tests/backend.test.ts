import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { Duplex } from 'node:stream';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp, initializeBackendRuntime } from '../src/app.js';
import { mongoDb } from '../src/db/mongo.js';
import { resetRateLimitersForTesting } from '../src/security/rateLimit.js';

const app = createApp();

class InMemorySocket extends Duplex {
  override _read(): void {}
  override _write(
    _chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    callback();
  }
}

interface TestResponse {
  status: number;
  headers: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

async function callApp(options: {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  json?: unknown;
  rawBody?: Buffer;
}): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const socket = new InMemorySocket();
    const req = new http.IncomingMessage(socket as unknown as import('node:net').Socket);
    req.method = options.method;
    req.url = options.url;
    req.headers = {};

    for (const [k, v] of Object.entries(options.headers || {})) {
      req.headers[k.toLowerCase()] = v;
    }

    let bodyBuffer: Buffer | null = null;
    if (options.rawBody) {
      bodyBuffer = options.rawBody;
      req.headers['content-length'] = String(bodyBuffer.length);
    } else if (options.json !== undefined) {
      bodyBuffer = Buffer.from(JSON.stringify(options.json), 'utf-8');
      req.headers['content-type'] = 'application/json';
      req.headers['content-length'] = String(bodyBuffer.length);
    }

    const res = new http.ServerResponse(req);
    const chunks: Buffer[] = [];

    const origWrite = res.write.bind(res);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.write = ((chunk: any, encoding?: any, cb?: any): boolean => {
      if (chunk) {
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding || 'utf-8')
        );
      }
      return origWrite(chunk, encoding, cb);
    }) as typeof res.write;

    const origEnd = res.end.bind(res);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.end = ((chunk?: any, encoding?: any, cb?: any): http.ServerResponse => {
      if (chunk && typeof chunk !== 'function') {
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding || 'utf-8')
        );
      }
      origEnd(chunk, encoding, cb);

      const rawText = Buffer.concat(chunks).toString('utf-8');
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.getHeaders())) {
        if (v !== undefined) headers[k.toLowerCase()] = String(v);
      }

      let parsedBody: unknown = rawText;
      if ((headers['content-type'] || '').includes('application/json') && rawText) {
        try {
          parsedBody = JSON.parse(rawText);
        } catch {
          parsedBody = rawText;
        }
      }

      resolve({
        status: res.statusCode,
        headers,
        body: parsedBody,
      });
      return res;
    }) as typeof res.end;

    app(
      req as unknown as import('express').Request,
      res as unknown as import('express').Response,
      (err?: unknown) => {
        if (err) reject(err);
      }
    );

    setImmediate(() => {
      if (bodyBuffer) {
        req.push(bodyBuffer);
      }
      req.push(null);
    });
  });
}

function buildMultipartFormData(params: {
  fileField: string;
  filename: string;
  mimeType: string;
  fileBuffer: Buffer;
  fields: Record<string, string>;
}): { contentType: string; body: Buffer } {
  const boundary = `----SumindIqTestBoundary${Date.now()}`;
  const parts: Buffer[] = [];

  for (const [key, val] of Object.entries(params.fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`,
        'utf-8'
      )
    );
  }

  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${params.fileField}"; filename="${params.filename}"\r\nContent-Type: ${params.mimeType}\r\n\r\n`,
      'utf-8'
    )
  );
  parts.push(params.fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8'));

  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat(parts),
  };
}

function buildMinimalValidPdf(text: string): Buffer {
  const safeText = text.replace(/[()\\]/g, '');
  const stream = `BT /F1 12 Tf 72 720 Td (${safeText}) Tj ET`;
  const pdf = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    'trailer << /Root 1 0 R >>',
    '%%EOF',
  ].join('\n');
  return Buffer.from(pdf, 'latin1');
}

async function buildMinimalValidDocx(paragraphText: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${paragraphText}</w:t></w:r></w:p>
  </w:body>
</w:document>`
  );
  return await zip.generateAsync({ type: 'nodebuffer' });
}

async function buildMinimalValidPptx(slideText: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${slideText}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`
  );
  return await zip.generateAsync({ type: 'nodebuffer' });
}

beforeAll(async () => {
  const testStorePath = path.join(
    os.tmpdir(),
    `sumindiq_test_mongo_${Date.now()}.json`
  );
  mongoDb.resetForTesting(testStorePath);
  await initializeBackendRuntime(true);
});

beforeEach(() => {
  resetRateLimitersForTesting();
});

async function loginAs(email: string, password: string): Promise<string> {
  const res = await callApp({
    method: 'POST',
    url: '/api/v1/auth/login',
    json: { email, password },
  });
  expect(res.status).toBe(200);
  expect(res.body.access_token).toBeTruthy();
  return res.body.access_token as string;
}

describe('SUMIND-IQ Node.js + Express.js Backend Suite', () => {
  it('reports healthy status with MongoDB, BullMQ, AWS S3, JS Embeddings, and rate-limit headers', async () => {
    const res = await callApp({ method: 'GET', url: '/api/v1/health' });
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBeTruthy();
    expect(res.body.status).toBe('healthy');
    expect(res.body.runtime).toBe('Node.js + Express.js');
    expect(res.body.services.mongodb.connected).toBe(true);
    expect(res.body.services.mongodb.mode).toBeTruthy();
    expect(res.body.services.storage_s3.mode).toBeTruthy();
    expect(res.body.services.worker_queue.queue_engine).toBe('BullMQ + Redis');
    expect(res.body.services.ai_provider.embedding_dimension).toBe(384);
  });

  it('registers users with bcrypt + JWT, rotates refresh tokens, and completes password reset', async () => {
    const uniqueEmail = `test.engineer.${Date.now()}@company.com`;
    const regRes = await callApp({
      method: 'POST',
      url: '/api/v1/auth/register',
      json: {
        full_name: 'Dr. Ananya Verma',
        email: uniqueEmail,
        password: 'Password@123',
        job_title: 'Principal AI Architect',
        department: 'Engineering',
      },
    });

    expect(regRes.status).toBe(201);
    expect(regRes.body.access_token).toBeTruthy();
    expect(regRes.body.refresh_token).toBeTruthy();
    expect(regRes.body.user.email).toBe(uniqueEmail);

    // Duplicate registration must fail with 409
    const dupRes = await callApp({
      method: 'POST',
      url: '/api/v1/auth/register',
      json: {
        full_name: 'Dr. Ananya Verma',
        email: uniqueEmail,
        password: 'Password@123',
      },
    });
    expect(dupRes.status).toBe(409);

    // Refresh token rotation invalidates previous refresh token
    const refreshRes = await callApp({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      json: { refresh_token: regRes.body.refresh_token },
    });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.access_token).toBeTruthy();

    const replayRefreshRes = await callApp({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      json: { refresh_token: regRes.body.refresh_token },
    });
    expect(replayRefreshRes.status).toBe(401);

    // Forgot-password & reset-password flow
    const forgotRes = await callApp({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      json: { email: uniqueEmail },
    });
    expect(forgotRes.status).toBe(200);
    expect(forgotRes.body.dev_mode_reset_token).toBeTruthy();

    const resetRes = await callApp({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      json: {
        token: forgotRes.body.dev_mode_reset_token,
        new_password: 'NewPassword@456',
      },
    });
    expect(resetRes.status).toBe(200);

    // Login with new password succeeds
    const newLoginRes = await callApp({
      method: 'POST',
      url: '/api/v1/auth/login',
      json: { email: uniqueEmail, password: 'NewPassword@456' },
    });
    expect(newLoginRes.status).toBe(200);
  });

  it('enforces multi-tenant RBAC visibility and dynamic allow/deny access policies', async () => {
    const adminToken = await loginAs('admin@sumind-iq.demo', 'Admin@12345');
    const managerToken = await loginAs('manager@sumind-iq.demo', 'Manager@12345');
    const employeeToken = await loginAs('employee@sumind-iq.demo', 'Employee@12345');
    const zenithToken = await loginAs('isolated@zenith.demo', 'Zenith@12345');

    const employeeMe = await callApp({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    const employeeUserId = employeeMe.body.id as string;

    const adminDocs = await callApp({
      method: 'GET',
      url: '/api/v1/documents',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const managerDocs = await callApp({
      method: 'GET',
      url: '/api/v1/documents',
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    const employeeDocs = await callApp({
      method: 'GET',
      url: '/api/v1/documents',
      headers: { Authorization: `Bearer ${employeeToken}` },
    });

    expect(adminDocs.body.items.length).toBe(4);
    expect(managerDocs.body.items.length).toBe(3);
    expect(employeeDocs.body.items.length).toBe(2);

    const restrictedDoc = adminDocs.body.items.find(
      (d: { visibility: string }) => d.visibility === 'restricted'
    );
    expect(restrictedDoc).toBeTruthy();

    // Employee initially blocked from Restricted M&A memo
    const empForbidden = await callApp({
      method: 'GET',
      url: `/api/v1/documents/${restrictedDoc.id}`,
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    expect(empForbidden.status).toBe(403);

    // Admin grants explicit ALLOW view policy to Employee
    const grantRes = await callApp({
      method: 'POST',
      url: `/api/v1/documents/${restrictedDoc.id}/policies`,
      headers: { Authorization: `Bearer ${adminToken}` },
      json: {
        principal_type: 'user',
        principal_id: employeeUserId,
        access_level: 'view',
        effect: 'allow',
      },
    });
    expect(grantRes.status).toBe(201);

    // Employee can now access Restricted M&A memo
    const empAllowed = await callApp({
      method: 'GET',
      url: `/api/v1/documents/${restrictedDoc.id}`,
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    expect(empAllowed.status).toBe(200);

    // Admin revokes the ALLOW policy -> Employee blocked again
    const revokeRes = await callApp({
      method: 'DELETE',
      url: `/api/v1/documents/${restrictedDoc.id}/policies/${grantRes.body.id}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(revokeRes.status).toBe(200);

    const empBlockedAgain = await callApp({
      method: 'GET',
      url: `/api/v1/documents/${restrictedDoc.id}`,
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    expect(empBlockedAgain.status).toBe(403);

    // Cross-tenant Zenith admin blocked with 403
    const crossTenant = await callApp({
      method: 'GET',
      url: `/api/v1/documents/${restrictedDoc.id}`,
      headers: { Authorization: `Bearer ${zenithToken}` },
    });
    expect(crossTenant.status).toBe(403);
  });

  it('ingests PDF (PDF.js), DOCX (Mammoth.js), PPTX, and XLSX (SheetJS) and rejects spoofed PDFs', async () => {
    const adminToken = await loginAs('admin@sumind-iq.demo', 'Admin@12345');

    // 1. Spoofed PDF rejected with 400
    const spoofedForm = buildMultipartFormData({
      fileField: 'file',
      filename: 'fake_report.pdf',
      mimeType: 'application/pdf',
      fileBuffer: Buffer.from('NOT_A_VALID_PDF_HEADER', 'utf-8'),
      fields: { visibility: 'organisation' },
    });
    const spoofedRes = await callApp({
      method: 'POST',
      url: '/api/v1/documents',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': spoofedForm.contentType,
      },
      rawBody: spoofedForm.body,
    });
    expect(spoofedRes.status).toBe(400);

    // 2. Valid PDF parsed via PDF.js pipeline
    const pdfForm = buildMultipartFormData({
      fileField: 'file',
      filename: 'cloud_dr_blueprint.pdf',
      mimeType: 'application/pdf',
      fileBuffer: buildMinimalValidPdf(
        'Tier-1 Disaster Recovery Blueprint mandates a 15-minute RPO across AWS S3 regions.'
      ),
      fields: { title: 'Cloud DR Blueprint PDF', visibility: 'organisation' },
    });
    const pdfRes = await callApp({
      method: 'POST',
      url: '/api/v1/documents',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': pdfForm.contentType,
      },
      rawBody: pdfForm.body,
    });
    expect(pdfRes.status).toBe(201);
    expect(pdfRes.body.document.status).toBe('ready');
    expect(pdfRes.body.document.file_type).toBe('pdf');

    // 3. Valid DOCX parsed via Mammoth.js
    const docxBuf = await buildMinimalValidDocx(
      'Engineering Onboarding Standard: All engineers complete Zero-Trust training in 14 days.'
    );
    const docxForm = buildMultipartFormData({
      fileField: 'file',
      filename: 'engineering_onboarding.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileBuffer: docxBuf,
      fields: { title: 'Engineering Onboarding DOCX', visibility: 'organisation' },
    });
    const docxRes = await callApp({
      method: 'POST',
      url: '/api/v1/documents',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': docxForm.contentType,
      },
      rawBody: docxForm.body,
    });
    expect(docxRes.status).toBe(201);
    expect(docxRes.body.document.status).toBe('ready');
    expect(docxRes.body.document.file_type).toBe('docx');

    // 4. Valid PPTX parsed into Slide 1
    const pptxBuf = await buildMinimalValidPptx(
      'Quarterly Architecture Review: Migrated backend to Node.js Express and MongoDB Atlas Vector Search.'
    );
    const pptxForm = buildMultipartFormData({
      fileField: 'file',
      filename: 'architecture_review.pptx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      fileBuffer: pptxBuf,
      fields: { title: 'Architecture Review Deck', visibility: 'organisation' },
    });
    const pptxRes = await callApp({
      method: 'POST',
      url: '/api/v1/documents',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': pptxForm.contentType,
      },
      rawBody: pptxForm.body,
    });
    expect(pptxRes.status).toBe(201);
    expect(pptxRes.body.document.status).toBe('ready');

    const pptxPreview = await callApp({
      method: 'GET',
      url: `/api/v1/documents/${pptxRes.body.document.id}/preview`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(pptxPreview.body.chunks[0].location_label).toBe('Slide 1');

    // 5. Valid XLSX workbook parsed via SheetJS
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Metric', 'Q4 Target', 'Owner'],
      ['Disaster Recovery RPO', '15 minutes', 'Platform SRE'],
      ['Cloud Cost Reduction', '22%', 'FinOps Team'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Q4_Targets');
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const xlsxForm = buildMultipartFormData({
      fileField: 'file',
      filename: 'q4_engineering_targets.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileBuffer: xlsxBuffer,
      fields: {
        title: 'Q4 Engineering & FinOps Targets',
        visibility: 'organisation',
      },
    });
    const xlsxRes = await callApp({
      method: 'POST',
      url: '/api/v1/documents',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': xlsxForm.contentType,
      },
      rawBody: xlsxForm.body,
    });

    expect(xlsxRes.status).toBe(201);
    expect(xlsxRes.body.document.status).toBe('ready');
    expect(xlsxRes.body.document.chunk_count).toBeGreaterThanOrEqual(1);

    const previewRes = await callApp({
      method: 'GET',
      url: `/api/v1/documents/${xlsxRes.body.document.id}/preview`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.chunks[0].location_label).toContain("Sheet 'Q4_Targets'");
  });

  it('executes hybrid search (/search & /search/query), grounded RAG Q&A, refusal on missing evidence, and feedback checks', async () => {
    const employeeToken = await loginAs('employee@sumind-iq.demo', 'Employee@12345');

    // Test frontend /search/query alias with mode/top_k payload
    const searchRes = await callApp({
      method: 'POST',
      url: '/api/v1/search/query',
      headers: { Authorization: `Bearer ${employeeToken}` },
      json: {
        query: 'incident response SLA triage 15 minutes encryption',
        mode: 'hybrid',
        top_k: 8,
      },
    });

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.total_authorised_documents).toBeGreaterThan(0);
    expect(searchRes.body.items.length).toBeGreaterThan(0);
    expect(searchRes.body.items[0].combined_score).toBeGreaterThan(0);

    // Grounded RAG conversation on authorised topic
    const convRes = await callApp({
      method: 'POST',
      url: '/api/v1/chat/conversations',
      headers: { Authorization: `Bearer ${employeeToken}` },
      json: {
        initial_question: 'How many days of paid annual leave do employees receive?',
      },
    });

    expect(convRes.status).toBe(201);
    const assistantMsg = convRes.body.messages.find(
      (m: { role: string }) => m.role === 'assistant'
    );
    expect(assistantMsg).toBeTruthy();
    expect(assistantMsg.evidence_sufficient).toBe(true);
    expect(assistantMsg.citations.length).toBeGreaterThan(0);
    expect(assistantMsg.content).toContain('[Source 1');

    // Unsupported topic must yield explicit zero-hallucination refusal
    const refusalRes = await callApp({
      method: 'POST',
      url: `/api/v1/chat/conversations/${convRes.body.id}/messages`,
      headers: { Authorization: `Bearer ${employeeToken}` },
      json: {
        question: 'What is the Mars Orbital Cafeteria menu for 2099?',
      },
    });
    expect(refusalRes.status).toBe(201);
    expect(refusalRes.body.assistant_message.evidence_sufficient).toBe(false);
    expect(refusalRes.body.assistant_message.citations.length).toBe(0);

    // Feedback submission & duplicate conflict check
    const fbRes = await callApp({
      method: 'POST',
      url: `/api/v1/chat/messages/${assistantMsg.id}/feedback`,
      headers: { Authorization: `Bearer ${employeeToken}` },
      json: {
        rating: 'positive',
        comment: 'Verified against HR handbook.',
      },
    });
    expect(fbRes.status).toBe(201);

    const dupFbRes = await callApp({
      method: 'POST',
      url: `/api/v1/chat/messages/${assistantMsg.id}/feedback`,
      headers: { Authorization: `Bearer ${employeeToken}` },
      json: {
        rating: 'positive',
        comment: 'Verified against HR handbook.',
      },
    });
    expect(dupFbRes.status).toBe(409);
  });

  it('generates grounded summaries, signed download URLs, and enforces admin governance telemetry', async () => {
    const adminToken = await loginAs('admin@sumind-iq.demo', 'Admin@12345');
    const employeeToken = await loginAs('employee@sumind-iq.demo', 'Employee@12345');

    const docsRes = await callApp({
      method: 'GET',
      url: '/api/v1/documents',
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    const docId = docsRes.body.items[0].id as string;

    const sumRes = await callApp({
      method: 'GET',
      url: `/api/v1/documents/${docId}/summary`,
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    expect(sumRes.status).toBe(200);
    expect(sumRes.body.executive_summary).toBeTruthy();
    expect(sumRes.body.citations.length).toBeGreaterThan(0);

    // Signed download URL generation
    const signedUrlRes = await callApp({
      method: 'GET',
      url: `/api/v1/documents/${docId}/signed-download-url`,
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    expect(signedUrlRes.status).toBe(200);
    expect(signedUrlRes.body.download_url).toContain('download_token=');

    // Employee cannot access admin dashboard
    const empAdminRes = await callApp({
      method: 'GET',
      url: '/api/v1/admin/dashboard',
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    expect(empAdminRes.status).toBe(403);

    // Admin dashboard returns aligned MongoDB, S3, and BullMQ telemetry
    const admRes = await callApp({
      method: 'GET',
      url: '/api/v1/admin/dashboard',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(admRes.status).toBe(200);
    expect(admRes.body.metrics.total_documents).toBeGreaterThanOrEqual(4);
    expect(admRes.body.service_status.mongodb.mode).toBeTruthy();
    expect(admRes.body.service_status.storage.mode).toBeTruthy();
    expect(admRes.body.service_status.worker.mode).toBeTruthy();
  });
});
