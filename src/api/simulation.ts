/**
 * Simulation API
 * ==============
 * Typed wrappers for all /api/simulation/* endpoints.
 * Note: the solver is *started* via Socket.IO (see socket.ts).
 * These REST endpoints handle file management around the simulation.
 */

import { apiClient } from './client';
import type { VfpData, SimulationFile, FileGroups } from '../types';

// ── Response types ────────────────────────────────────────────────────────────

export interface SimulationFolderResponse {
  sim_name:   string;
  files:      SimulationFile[];
  groups:     FileGroups;
}

export interface FileContentResponse {
  content:    string;
  file_name:  string;
  sim_name:   string;
}

export interface UploadDataResponse {
  success:    boolean;
  message:    string;
  sim_name:   string;
  file_name:  string;
}

// ── Functions ─────────────────────────────────────────────────────────────────

/**
 * List all output files for a completed simulation.
 */
export async function getSimulationFolder(
  simName: string,
): Promise<SimulationFolderResponse> {
  const res = await apiClient.get<SimulationFolderResponse>(
    `/api/simulation/folder/${encodeURIComponent(simName)}`,
  );
  if (!res.data) throw new Error('Empty response from simulation folder');
  return res.data;
}

/**
 * Retrieve a text file from a simulation output folder.
 */
export async function getFileContent(
  simName:  string,
  fileName: string,
): Promise<FileContentResponse> {
  const res = await apiClient.post<FileContentResponse>(
    '/api/simulation/file-content',
    { sim_name: simName, file_name: fileName },
  );
  if (!res.data) throw new Error('Empty response from file-content');
  return res.data;
}

/**
 * Upload post-processed VFP data back to the simulation folder.
 */
export async function uploadVfpData(
  vfpData:  VfpData,
  simName:  string,
  fileName: string,
): Promise<UploadDataResponse> {
  const res = await apiClient.post<UploadDataResponse>(
    '/api/simulation/upload-data',
    { vfp_data: vfpData, sim_name: simName, file_name: fileName },
  );
  if (!res.data) throw new Error('Empty response from upload-data');
  return res.data;
}
