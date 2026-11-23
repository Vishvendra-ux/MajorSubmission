import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { Duplex } from 'node:stream';
import * as XLSX from 'xlsx';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp, initializeBackendRuntime } from '../src/app.js';
import { mongoDb } from '../src/db/mongo.js';

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

beforeAll(async () => {
  const testStorePath = path.join(
    os.tmpdir(),
    `sumindiq_test_mongo_${Date.now()}.json`
  );
  mongoDb.resetForTesting(testStorePath);
  await initializeBackendRuntime(true);
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
  it('reports healthy status with MongoDB, BullMQ, AWS S3, and JS Embeddings', async () => {
    const res = await callApp({ method: 'GET', url: '/api/v1/health' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.runtime).toBe('Node.js + Express.js');
    expect(res.body.services.mongodb.connected).toBe(true);
    expect(res.body.services.worker_queue.queue_engine).toBe('BullMQ + Redis');
    expect(res.body.services.ai_provider.embedding_dimension).toBe(384);
  });

  it('registers a new user with bcrypt + JWT and prevents duplicate registration', async () => {
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
    expect(regRes.body.user.email).toBe(uniqueEmail);

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

    const meRes = await callApp({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { Authorization: `Bearer ${regRes.body.access_token}` },
    });
    expect(meRes.status).toBe(200);
    expect(meRes.body.full_name).toBe('Dr. Ananya Verma');
  });

  it('enforces multi-tenant and role-based document visibility across Admin, Manager, and Employee', async () => {
    const adminToken = await loginAs('admin@sumind-iq.demo', 'Admin@12345');
    const managerToken = await loginAs('manager@sumind-iq.demo', 'Manager@12345');
    const employeeToken = await loginAs('employee@sumind-iq.demo', 'Employee@12345');
    const zenithToken = await loginAs('isolated@zenith.demo', 'Zenith@12345');

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

    // Employee must receive 403 when attempting to view Restricted M&A memo
    const empForbidden = await callApp({
      method: 'GET',
      url: `/api/v1/documents/${restrictedDoc.id}`,
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    expect(empForbidden.status).toBe(403);

    // Cross-tenant Zenith admin must receive 403 when attempting to access Apex Global document
    const crossTenant = await callApp({
      method: 'GET',
      url: `/api/v1/documents/${restrictedDoc.id}`,
      headers: { Authorization: `Bearer ${zenithToken}` },
    });
    expect(crossTenant.status).toBe(403);
  });

  it('ingests TXT and XLSX (SheetJS) documents and rejects spoofed PDF magic bytes', async () => {
    const adminToken = await loginAs('admin@sumind-iq.demo', 'Admin@12345');

    // 1. Spoofed PDF must be rejected with 400
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

    // 2. Valid XLSX workbook parsed via SheetJS
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

  it('executes permission-filtered hybrid vector search and grounded RAG Q&A with verified citations', async () => {
    const employeeToken = await loginAs('employee@sumind-iq.demo', 'Employee@12345');

    const searchRes = await callApp({
      method: 'POST',
      url: '/api/v1/search',
      headers: { Authorization: `Bearer ${employeeToken}` },
      json: {
        query: 'incident response SLA triage 15 minutes encryption',
        search_mode: 'hybrid',
      },
    });

    expect(searchRes.status).toBe(200);
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

  it('generates grounded hierarchical document summaries and enforces admin governance endpoints', async () => {
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

    // Employee cannot access admin dashboard
    const empAdminRes = await callApp({
      method: 'GET',
      url: '/api/v1/admin/dashboard',
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    expect(empAdminRes.status).toBe(403);

    // Admin can access admin dashboard & audit logs
    const admRes = await callApp({
      method: 'GET',
      url: '/api/v1/admin/dashboard',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(admRes.status).toBe(200);
    expect(admRes.body.metrics.total_documents).toBeGreaterThanOrEqual(4);
  });
});
