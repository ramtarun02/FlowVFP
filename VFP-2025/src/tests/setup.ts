/**
 * Vitest + Testing Library global setup
 * ======================================
 * Referenced by vite.config.js as `test.setupFiles`.
 */

import '@testing-library/jest-dom';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Silence noisy console.error in tests (uncomment to suppress)
// vi.spyOn(console, 'error').mockImplementation(() => undefined);

// Mock import.meta.env defaults for tests
Object.defineProperty(import.meta, 'env', {
  value: {
    ...import.meta.env,
    DEV:            false,
    PROD:           false,
    MODE:           'test',
    VITE_API_URL:   'http://localhost:5000',
    VITE_WS_URL:    'http://localhost:5000',
    VITE_BASE_PATH: '/',
  },
  writable: true,
});
