import path from 'node:path';

export class HttpError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    code = `HTTP_${status}`,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function sanitizeUserText(input: string | undefined | null, maxLength = 1000): string {
  if (!input) return '';
  return String(input)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeFilename(rawName: string): string {
  const base = path.basename(rawName || 'document.txt');
  const cleaned = base
    .replace(/[\u0000-\u001f\u0080-\u009f/?<>\\:*|"]/g, '_')
    .replace(/^\.+/, '');
  return cleaned.slice(0, 180) || 'document.txt';
}

export function paginateSequence<T>(
  items: T[],
  page = 1,
  pageSize = 20
): {
  items: T[];
  meta: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
} {
  const safePageSize = Math.max(1, Math.min(100, Number(pageSize) || 20));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.max(1, Math.min(Number(page) || 1, totalPages));
  const start = (safePage - 1) * safePageSize;
  const paged = items.slice(start, start + safePageSize);

  return {
    items: paged,
    meta: {
      page: safePage,
      page_size: safePageSize,
      total,
      total_pages: totalPages,
    },
  };
}
