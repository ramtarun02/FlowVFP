/**
 * Geometry API
 * ============
 * Typed wrappers for all /api/geometry/* endpoints.
 */

import { apiClient } from './client';
import type {
  GeoSection,
  InterpolateParameterRequest,
  WingSpecs,
} from '../types';

// ── Request / response types ──────────────────────────────────────────────────

export interface ImportGeoResponse {
  sections:      GeoSection[];
  wing_specs:    WingSpecs;
  file_name:     string;
}

export interface ExportGeoRequest {
  sections:   GeoSection[];
  wing_specs: WingSpecs;
  file_name:  string;
}

export interface FpconRequest {
  sections:   GeoSection[];
  wing_specs: WingSpecs;
  file_name:  string;
}

export interface FpconResponse {
  success:     boolean;
  map_content: string;
  message?:    string;
}

export interface ComputeDesiredRequest {
  sections:   GeoSection[];
  wing_specs: WingSpecs;
  target_cl:  number;
}

export interface ComputeDesiredResponse {
  aoa:             number;
  cl_achieved:     number;
  cd:              number;
  cm:              number;
  [key: string]:   unknown;
}

export interface InterpolateParameterResponse {
  values:        number[];
  parameter:     string;
  method:        string;
}

// ── Functions ─────────────────────────────────────────────────────────────────

/**
 * Upload a .GEO file and parse it into sections + wing specs.
 */
export async function importGeo(
  file: File,
): Promise<ImportGeoResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiClient.postForm<ImportGeoResponse>('/api/geometry/import', form);
  if (!res.data) throw new Error('Empty response from import-geo');
  return res.data;
}

/**
 * Download a .GEO file generated from the given sections/wing_specs.
 */
export async function exportGeo(body: ExportGeoRequest): Promise<Blob> {
  const res = await apiClient.post<Blob>('/api/geometry/export', body);
  if (!res.data) throw new Error('Empty response from export-geo');
  return res.data;
}

/**
 * Run FPCON to convert geometry into a .MAP mesh file.
 */
export async function runFpcon(body: FpconRequest): Promise<FpconResponse> {
  const res = await apiClient.post<FpconResponse>('/api/geometry/fpcon', body);
  if (!res.data) throw new Error('Empty response from fpcon');
  return res.data;
}

/**
 * Compute the AoA needed to achieve a desired CL.
 */
export async function computeDesired(
  body: ComputeDesiredRequest,
): Promise<ComputeDesiredResponse> {
  const res = await apiClient.post<ComputeDesiredResponse>(
    '/api/geometry/compute-desired',
    body,
  );
  if (!res.data) throw new Error('Empty response from compute-desired');
  return res.data;
}

/**
 * Interpolate a spanwise parameter to produce per-section values.
 */
export async function interpolateParameter(
  body: InterpolateParameterRequest,
): Promise<InterpolateParameterResponse> {
  const res = await apiClient.post<InterpolateParameterResponse>(
    '/api/geometry/interpolate-parameter',
    body,
  );
  if (!res.data) throw new Error('Empty response from interpolate-parameter');
  return res.data;
}
