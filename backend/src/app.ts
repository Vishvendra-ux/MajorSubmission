import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { getCorsOrigins, settings } from './config/index.js';
import { mongoDb } from './db/mongo.js';
import { ensureSystemRolesAndPermissions, seedDemoData } from './db/seed.js';
import { authRouter } from './routes/authRoutes.js';
import { documentRouter } from './routes/documentRoutes.js';
import { chatRouter, searchRouter } from './routes/searchChatRoutes.js';
import { userAdminRouter } from './routes/userAdminRoutes.js';
import { apiRateLimiter, authRateLimiter } from './security/rateLimit.js';
import { HttpError } from './utils/errors.js';
import { initWorkerQueue } from './workers/queue.js';

export async function initializeBackendRuntime(seedDemo = true): Promise<void> {
  await mongoDb.init();
  await initWorkerQueue();
  ensureSystemRolesAndPermissions();
  if (seedDemo && settings.APP_ENV !== 'production') {
    await seedDemoData();
  }
}

export function createApp() {
  const app = express();

  // Security headers middleware
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  app.use(
    cors({
      origin: getCorsOrigins(),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/', (_req, res) => {
    res.json({
      name: settings.APP_NAME,
      version: '1.0.0',
      runtime: 'Node.js + Express.js',
      database: 'MongoDB + Atlas Vector Search',
      api_v1: settings.API_V1_PREFIX,
      docs: '/api/docs',
    });
  });

  app.get('/api/openapi.json', (_req, res) => {
    res.json({
      openapi: '3.0.3',
      info: {
        title: 'SUMIND-IQ — Enterprise AI Knowledge Management Platform API (Node.js + Express.js)',
        version: '1.0.0',
        description:
          'Role-aware organisational knowledge management and grounded RAG platform built with Node.js, Express.js, MongoDB Atlas Vector Search, JWT + bcrypt, PDF.js, Mammoth.js, SheetJS, Tesseract.js, AWS S3, and BullMQ + Redis.',
      },
      paths: {
        '/api/v1/health': { get: { summary: 'System & service health check' } },
        '/api/v1/auth/register': { post: { summary: 'Register user and organisation' } },
        '/api/v1/auth/login': { post: { summary: 'Authenticate with email & password (bcrypt + JWT)' } },
        '/api/v1/auth/me': { get: { summary: 'Get current authenticated user profile' } },
        '/api/v1/documents': {
          get: { summary: 'List authorised documents' },
          post: { summary: 'Upload and ingest PDF, DOCX, PPTX, XLSX, or TXT document' },
        },
        '/api/v1/search': { post: { summary: 'Execute MongoDB Atlas Vector Search + hybrid lexical search' } },
        '/api/v1/chat/conversations': {
          get: { summary: 'List user conversations' },
          post: { summary: 'Create grounded RAG conversation' },
        },
      },
    });
  });

  app.get('/api/docs', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>SUMIND-IQ API Docs — Node.js + Express.js</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger-ui' });
    };
  </script>
</body>
</html>`);
  });

  const prefix = settings.API_V1_PREFIX;
  app.use(`${prefix}/auth`, authRateLimiter, authRouter);
  app.use(prefix, apiRateLimiter);
  app.use(`${prefix}/documents`, documentRouter);
  app.use(`${prefix}/search`, searchRouter);
  app.use(`${prefix}/chat`, chatRouter);
  app.use(prefix, userAdminRouter);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      detail: `Endpoint ${req.method} ${req.originalUrl} not found.`,
      error: {
        code: 'HTTP_404',
        message: `Endpoint ${req.method} ${req.originalUrl} not found.`,
      },
    });
  });

  // Global error handler compatible with frontend ApiClientError
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({
        detail: err.message,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      });
      return;
    }

    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({
      detail: message,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message,
      },
    });
  });

  return app;
}
