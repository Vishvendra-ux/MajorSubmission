const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '/api/v1';

const ACCESS_TOKEN_KEY = 'sumindiq_access_token';
const REFRESH_TOKEN_KEY = 'sumindiq_refresh_token';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAuthTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearAuthTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export class ApiClientError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code = 'API_ERROR',
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function tryRefreshSession(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) {
      clearAuthTokens();
      return null;
    }
    const data = await res.json();
    if (data.access_token && data.refresh_token) {
      setAuthTokens(data.access_token, data.refresh_token);
      return data.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | Record<string, unknown> | null;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
  retryOn401 = true
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  const headers = new Headers(options.headers || {});
  const token = getAccessToken();

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let serializedBody: BodyInit | null | undefined;
  if (
    options.body &&
    typeof options.body === 'object' &&
    !(options.body instanceof FormData) &&
    !(options.body instanceof Blob) &&
    !(options.body instanceof URLSearchParams)
  ) {
    serializedBody = JSON.stringify(options.body);
  } else {
    serializedBody = options.body as BodyInit | null | undefined;
  }

  if (!(serializedBody instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const fetchInit: RequestInit = {
    ...options,
    headers,
    body: serializedBody,
  };

  const response = await fetch(url, fetchInit);

  if (response.status === 401 && retryOn401 && !path.includes('/auth/login')) {
    const newAccess = await tryRefreshSession();
    if (newAccess) {
      headers.set('Authorization', `Bearer ${newAccess}`);
      const retried = await fetch(url, { ...fetchInit, headers });
      return handleResponse<T>(retried);
    }
  }

  return handleResponse<T>(response);
}

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await response.json().catch(() => ({})) : await response.text();

  if (!response.ok) {
    const errObj = typeof body === 'object' && body !== null && 'error' in body ? body.error : null;
    const message =
      errObj?.message ||
      (typeof body === 'object' && body !== null && 'detail' in body ? String(body.detail) : null) ||
      `Request failed with status ${response.status}`;
    const code = errObj?.code || `HTTP_${response.status}`;
    const details = errObj?.details || {};
    throw new ApiClientError(message, response.status, code, details);
  }

  return body as T;
}
