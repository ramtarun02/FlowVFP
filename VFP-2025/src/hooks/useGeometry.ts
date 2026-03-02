/**
 * useGeometry
 * ===========
 * Encapsulates all geometry-module state and server interactions.
 *
 * Replaces ad-hoc fetch calls scattered throughout GeometryModule.js.
 */

import { useState, useCallback } from 'react';
import {
  importGeo,
  exportGeo,
  runFpcon,
  computeDesired,
  interpolateParameter,
  type ImportGeoResponse,
  type FpconResponse,
  type ComputeDesiredResponse,
  type InterpolateParameterResponse,
} from '../api/geometry';
import type {
  GeoSection,
  WingSpecs,
  InterpolateParameterRequest,
} from '../types';

export interface UseGeometryReturn {
  sections:         GeoSection[];
  wingSpecs:        WingSpecs | null;
  fileName:         string;
  loading:          boolean;
  error:            string | null;

  importGeoFile(file: File):                    Promise<void>;
  exportGeoFile():                              Promise<void>;
  fpcon():                                      Promise<FpconResponse | null>;
  computeDesiredAoA(targetCl: number):          Promise<ComputeDesiredResponse | null>;
  interpolate(req: InterpolateParameterRequest): Promise<InterpolateParameterResponse | null>;

  setSections(sections: GeoSection[]):          void;
  setWingSpecs(specs: WingSpecs):               void;
  setFileName(name: string):                    void;
  clearError():                                 void;
}

const DEFAULT_WING_SPECS: WingSpecs = {
  aspectRatio:  0,
  wingSpan:     0,
  numSections:  0,
  taperRatio:   0,
  wingArea:     0,
};

export function useGeometry(): UseGeometryReturn {
  const [sections,  setSections]  = useState<GeoSection[]>([]);
  const [wingSpecs, setWingSpecs] = useState<WingSpecs | null>(null);
  const [fileName,  setFileName]  = useState<string>('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const wrap = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const importGeoFile = useCallback(
    async (file: File) => {
      const result = await wrap<ImportGeoResponse>(() => importGeo(file));
      if (result) {
        setSections(result.sections);
        setWingSpecs(result.wing_specs ?? DEFAULT_WING_SPECS);
        setFileName(result.file_name);
      }
    },
    [wrap],
  );

  const exportGeoFile = useCallback(async () => {
    if (!wingSpecs) return;
    await wrap(async () => {
      const blob = await exportGeo({
        sections,
        wing_specs: wingSpecs,
        file_name:  fileName || 'geometry.GEO',
      });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href     = url;
      link.download = fileName || 'geometry.GEO';
      link.click();
      URL.revokeObjectURL(url);
    });
  }, [sections, wingSpecs, fileName, wrap]);

  const fpcon = useCallback(
    async (): Promise<FpconResponse | null> => {
      if (!wingSpecs) return null;
      return wrap(() =>
        runFpcon({ sections, wing_specs: wingSpecs, file_name: fileName }),
      );
    },
    [sections, wingSpecs, fileName, wrap],
  );

  const computeDesiredAoA = useCallback(
    async (targetCl: number): Promise<ComputeDesiredResponse | null> => {
      if (!wingSpecs) return null;
      return wrap(() =>
        computeDesired({ sections, wing_specs: wingSpecs, target_cl: targetCl }),
      );
    },
    [sections, wingSpecs, wrap],
  );

  const interpolate = useCallback(
    async (req: InterpolateParameterRequest): Promise<InterpolateParameterResponse | null> => {
      return wrap(() => interpolateParameter(req));
    },
    [wrap],
  );

  return {
    sections,
    wingSpecs,
    fileName,
    loading,
    error,
    importGeoFile,
    exportGeoFile,
    fpcon,
    computeDesiredAoA,
    interpolate,
    setSections,
    setWingSpecs,
    setFileName,
    clearError: () => setError(null),
  };
}
