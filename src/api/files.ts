/**
 * Files API
 * =========
 * Typed wrappers for VFP archive upload/retrieval: /api/files/*.
 */

import { apiClient } from './client';
import type { UploadVfpResponse, VfpManifest } from '../types';

// ── Request / response types ──────────────────────────────────────────────────

export interface VfpResultFilesRequest {
  session_id:   string;
}

export interface VfpResultFilesResponse {
  session_id:   string;
  manifest:     VfpManifest;
  files:        string[];
}

// ── Functions ─────────────────────────────────────────────────────────────────

/**
 * Upload a .vfp archive, extract it server-side and return the manifest.
 */
export async function uploadVfp(file: File): Promise<UploadVfpResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiClient.postForm<UploadVfpResponse>(
    '/api/files/upload-vfp',
    form,
  );
  if (!res.data) throw new Error('Empty response from upload-vfp');
  return res.data;
}

/**
 * Fetch the list of result files for an already-uploaded VFP session.
 */
export async function getVfpResultFiles(
  sessionId: string,
): Promise<VfpResultFilesResponse> {
  const res = await apiClient.post<VfpResultFilesResponse>(
    '/api/files/vfp-result-files',
    { session_id: sessionId },
  );
  if (!res.data) throw new Error('Empty response from vfp-result-files');
  return res.data;
}
