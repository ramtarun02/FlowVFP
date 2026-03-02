/**
 * Post-processing API
 * ===================
 * Typed wrappers for all /api/post/* endpoints.
 */

import { apiClient } from './client';
import type {
  CpData,
  ForceCoefficients,
  CpSection,
} from '../types';

// ── Response types ────────────────────────────────────────────────────────────

export interface ParseCpResponse {
  cp_data:    CpData;
  file_name:  string;
}

export interface ParseForcesResponse {
  forces:     ForceCoefficients[];
  file_name:  string;
}

export interface ParseDatResponse {
  content:    string;
  file_name:  string;
}

export interface ParseVisResponse {
  sections:   CpSection[];
  file_name:  string;
}

export interface ContourGridRequest {
  session_id: string;
  file_name:  string;
  component:  string;
}

export interface ContourGridResponse {
  x:          number[][];
  y:          number[][];
  z:          number[][];
  values:     number[][];
  component:  string;
}

export interface TailDownwashRequest {
  session_id:   string;
  forces_file:  string;
  alpha_range:  [number, number];
}

export interface TailDownwashResponse {
  downwash_angle: number[];
  alpha:          number[];
  epsilon_alpha:  number;
}

export interface ParseVfpFileRequest {
  session_id: string;
  file_name:  string;
  file_type:  'cp' | 'forces' | 'dat' | 'vis';
}

// ── Functions ─────────────────────────────────────────────────────────────────

export async function parseCp(file: File): Promise<ParseCpResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiClient.postForm<ParseCpResponse>('/api/post/parse-cp', form);
  if (!res.data) throw new Error('Empty response from parse-cp');
  return res.data;
}

export async function parseForces(file: File): Promise<ParseForcesResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiClient.postForm<ParseForcesResponse>(
    '/api/post/parse-forces',
    form,
  );
  if (!res.data) throw new Error('Empty response from parse-forces');
  return res.data;
}

export async function parseDat(file: File): Promise<ParseDatResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiClient.postForm<ParseDatResponse>('/api/post/parse-dat', form);
  if (!res.data) throw new Error('Empty response from parse-dat');
  return res.data;
}

export async function parseVis(file: File): Promise<ParseVisResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiClient.postForm<ParseVisResponse>('/api/post/parse-vis', form);
  if (!res.data) throw new Error('Empty response from parse-vis');
  return res.data;
}

/**
 * Parse a specific file from an already-uploaded VFP session archive.
 */
export async function parseVfpFile(
  body: ParseVfpFileRequest,
): Promise<ParseCpResponse | ParseForcesResponse | ParseDatResponse | ParseVisResponse> {
  const res = await apiClient.post<
    ParseCpResponse | ParseForcesResponse | ParseDatResponse | ParseVisResponse
  >('/api/post/parse-vfp-file', body);
  if (!res.data) throw new Error('Empty response from parse-vfp-file');
  return res.data;
}

export async function getContourGrid(
  body: ContourGridRequest,
): Promise<ContourGridResponse> {
  const res = await apiClient.post<ContourGridResponse>(
    '/api/post/contour-grid',
    body,
  );
  if (!res.data) throw new Error('Empty response from contour-grid');
  return res.data;
}

export async function computeTailDownwash(
  body: TailDownwashRequest,
): Promise<TailDownwashResponse> {
  const res = await apiClient.post<TailDownwashResponse>(
    '/api/post/tail-downwash',
    body,
  );
  if (!res.data) throw new Error('Empty response from tail-downwash');
  return res.data;
}
