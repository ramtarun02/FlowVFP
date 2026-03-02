/**
 * ProWiM API
 * ==========
 * Typed wrappers for /api/prowim/* endpoints.
 */

import { apiClient } from './client';
import type { ProWiMRequest, ProWiMResultItem } from '../types';

// ── Response types ────────────────────────────────────────────────────────────

export interface ProWiMResponse {
  results:     ProWiMResultItem[];
  cl_total:    number;
  cd_total:    number;
  efficiency:  number;
}

// ── Functions ─────────────────────────────────────────────────────────────────

export async function computeProWiM(
  body: ProWiMRequest,
): Promise<ProWiMResponse> {
  const res = await apiClient.post<ProWiMResponse>(
    '/api/prowim/compute',
    body,
  );
  if (!res.data) throw new Error('Empty response from prowim/compute');
  return res.data;
}
