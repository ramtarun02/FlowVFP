/**
 * API Client
 * ==========
 * Central HTTP layer.  Import ``apiClient`` and call its methods instead of
 * reaching out to ``fetch`` directly.  This ensures:
 *   - A consistent base URL across environments
 *   - Uniform error handling & response parsing
 *   - Easy mocking in tests
 */

// ── Base URL ──────────────────────────────────────────────────────────────────

const getBaseUrl = (): string => {
  // Respect explicit VITE env override first
  const explicit = import.meta.env.VITE_API_URL as string | undefined;
  if (explicit) return explicit.replace(/\/$/, '');

  // In development, proxy to local Flask server
  const isDev =
    import.meta.env.DEV ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  if (isDev) return 'http://127.0.0.1:5000';

  // Production default (Azure App Service)
  return (import.meta.env.VITE_PROD_API_URL as string) ??
    'https://vfp-solver-gngfaahkh2fkbbhh.uksouth-01.azurewebsites.net';
};

export const BASE_URL = getBaseUrl();

// ── Response wrapper ──────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  ok:       boolean;
  status:   number;
  data:     T | null;
  error?:   string;
  detail?:  string;
}

// ── Custom error class ────────────────────────────────────────────────────────

export class ApiRequestError extends Error {
  public readonly status:  number;
  public readonly detail?: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name   = 'ApiRequestError';
    this.status = status;
    this.detail = detail;
  }
}

// ── Core request function ─────────────────────────────────────────────────────

async function request<T>(
  path:    string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
  });

  const contentType = response.headers.get('content-type') ?? '';

  // Binary responses (ZIP)
  if (
    contentType.includes('application/zip') ||
    contentType.includes('application/octet-stream')
  ) {
    return {
      ok:     response.ok,
      status: response.status,
      data:   (await response.blob()) as unknown as T,
    };
  }

  // Plain text
  if (contentType.includes('text/plain')) {
    return {
      ok:     response.ok,
      status: response.status,
      data:   (await response.text()) as unknown as T,
    };
  }

  // JSON
  let parsed: T | null = null;
  try {
    const text = await response.text();
    parsed = text ? (JSON.parse(text) as T) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const err = parsed as { error?: string; detail?: string } | null;
    throw new ApiRequestError(
      err?.error ?? `HTTP ${response.status}`,
      response.status,
      err?.detail,
    );
  }

  return { ok: true, status: response.status, data: parsed };
}

// ── Exported client ────────────────────────────────────────────────────────────

export const apiClient = {
  get:    <T>(path: string) =>
    request<T>(path, { method: 'GET' }),

  post:   <T>(path: string, body: unknown) =>
    request<T>(path, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    }),

  postForm: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData }),

  /** Legacy shim for code still using the old fetchAPI shape. */
  fetch: async (path: string, options: RequestInit = {}) => {
    const url         = path.startsWith('http') ? path : `${BASE_URL}${path}`;
    const response    = await fetch(url, options);
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/zip') || contentType.includes('application/octet-stream')) {
      return { ok: response.ok, status: response.status, headers: response.headers, blob: () => response.blob(), response };
    }
    if (contentType.includes('text/plain')) {
      const text = await response.text();
      return { ok: response.ok, status: response.status, headers: response.headers, text: () => Promise.resolve(text), response };
    }
    let data: unknown = null;
    try { data = await response.json(); } catch { /* noop */ }
    return { ok: response.ok, status: response.status, headers: response.headers, json: () => Promise.resolve(data), response };
  },
} as const;

export default apiClient;
