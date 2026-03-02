/**
 * useVfpData
 * ==========
 * Manages loading and caching of post-processing data fetched from
 * uploaded VFP archives (cp, forces, dat, vis, contour grids).
 */

import { useState, useCallback } from 'react';
import {
  parseCp,
  parseForces,
  parseDat,
  parseVis,
  getContourGrid,
  computeTailDownwash,
  type ParseCpResponse,
  type ParseForcesResponse,
  type ParseDatResponse,
  type ParseVisResponse,
  type ContourGridRequest,
  type ContourGridResponse,
  type TailDownwashRequest,
  type TailDownwashResponse,
} from '../api/postprocessing';
import type { CpData, ForceCoefficients } from '../types';

export interface VfpDataState {
  cpData:          CpData | null;
  forces:          ForceCoefficients[] | null;
  datContent:      string | null;
  visData:         ParseVisResponse | null;
  contourGrid:     ContourGridResponse | null;
  tailDownwash:    TailDownwashResponse | null;
  loading:         boolean;
  error:           string | null;
}

export interface UseVfpDataReturn extends VfpDataState {
  loadCp(file: File):                           Promise<void>;
  loadForces(file: File):                       Promise<void>;
  loadDat(file: File):                          Promise<void>;
  loadVis(file: File):                          Promise<void>;
  loadContourGrid(req: ContourGridRequest):     Promise<void>;
  loadTailDownwash(req: TailDownwashRequest):   Promise<void>;
  clearError():                                 void;
  resetAll():                                   void;
}

const INITIAL_STATE: VfpDataState = {
  cpData:       null,
  forces:       null,
  datContent:   null,
  visData:      null,
  contourGrid:  null,
  tailDownwash: null,
  loading:      false,
  error:        null,
};

export function useVfpData(): UseVfpDataReturn {
  const [state, setState] = useState<VfpDataState>(INITIAL_STATE);

  const setPartial = useCallback(
    (partial: Partial<VfpDataState>) =>
      setState((prev) => ({ ...prev, ...partial })),
    [],
  );

  const wrap = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      onSuccess: (data: T) => Partial<VfpDataState>,
    ): Promise<void> => {
      setPartial({ loading: true, error: null });
      try {
        const data = await fn();
        setPartial({ ...onSuccess(data), loading: false });
      } catch (err) {
        setPartial({
          loading: false,
          error:   err instanceof Error ? err.message : String(err),
        });
      }
    },
    [setPartial],
  );

  const loadCp = useCallback(
    (file: File) =>
      wrap<ParseCpResponse>(
        () => parseCp(file),
        (d) => ({ cpData: d.cp_data }),
      ),
    [wrap],
  );

  const loadForces = useCallback(
    (file: File) =>
      wrap<ParseForcesResponse>(
        () => parseForces(file),
        (d) => ({ forces: d.forces }),
      ),
    [wrap],
  );

  const loadDat = useCallback(
    (file: File) =>
      wrap<ParseDatResponse>(
        () => parseDat(file),
        (d) => ({ datContent: d.content }),
      ),
    [wrap],
  );

  const loadVis = useCallback(
    (file: File) =>
      wrap<ParseVisResponse>(
        () => parseVis(file),
        (d) => ({ visData: d }),
      ),
    [wrap],
  );

  const loadContourGrid = useCallback(
    (req: ContourGridRequest) =>
      wrap<ContourGridResponse>(
        () => getContourGrid(req),
        (d) => ({ contourGrid: d }),
      ),
    [wrap],
  );

  const loadTailDownwash = useCallback(
    (req: TailDownwashRequest) =>
      wrap<TailDownwashResponse>(
        () => computeTailDownwash(req),
        (d) => ({ tailDownwash: d }),
      ),
    [wrap],
  );

  return {
    ...state,
    loadCp,
    loadForces,
    loadDat,
    loadVis,
    loadContourGrid,
    loadTailDownwash,
    clearError: () => setPartial({ error: null }),
    resetAll:   () => setState(INITIAL_STATE),
  };
}
