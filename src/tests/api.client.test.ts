/**
 * Tests: API client
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiClient, ApiRequestError } from '../api/client';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(
  status: number,
  body: unknown,
  contentType = 'application/json',
) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok:          status >= 200 && status < 300,
      status,
      headers: { get: () => contentType },
      text:    () => Promise.resolve(JSON.stringify(body)),
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('apiClient.get', () => {
  it('returns data on 200', async () => {
    mockFetch(200, { pong: true });
    const res = await apiClient.get<{ pong: boolean }>('/health');

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ pong: true });
  });

  it('throws ApiRequestError on 404', async () => {
    mockFetch(404, { error: 'Not found' });

    await expect(apiClient.get('/missing')).rejects.toThrow(ApiRequestError);
    await expect(apiClient.get('/missing')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('throws ApiRequestError on 500 with message from body', async () => {
    mockFetch(500, { error: 'Internal server error' });

    await expect(apiClient.get('/boom')).rejects.toMatchObject({
      message: 'Internal server error',
      status:  500,
    });
  });

  it('throws ApiRequestError when body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok:      false,
        status:  503,
        headers: { get: () => 'text/html' },
        text:    () => Promise.resolve('<html>Maintenance</html>'),
      }),
    );

    await expect(apiClient.get('/maint')).rejects.toMatchObject({
      status: 503,
    });
  });
});

describe('apiClient.post', () => {
  it('sends JSON with correct Content-Type', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok:      true,
      status:  200,
      headers: { get: () => 'application/json' },
      text:    () => Promise.resolve('{"ok":true}'),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await apiClient.post('/api/test', { key: 'value' });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      expect.objectContaining({
        method:  'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ key: 'value' }),
      }),
    );
  });
});

describe('apiClient.postForm', () => {
  it('sends FormData without Content-Type header', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok:      true,
      status:  200,
      headers: { get: () => 'application/json' },
      text:    () => Promise.resolve('{}'),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const form = new FormData();
    form.append('file', new Blob(['test']), 'test.geo');
    await apiClient.postForm('/api/geometry/import', form);

    const call = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(call.body).toBeInstanceOf(FormData);
    // multipart/form-data Content-Type must be set by the browser, not us
    expect((call.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });
});
