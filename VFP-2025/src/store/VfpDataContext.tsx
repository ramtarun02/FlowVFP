/**
 * VfpDataContext
 * ==============
 * Global context for the uploaded VFP archive session.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { VfpData, UploadVfpResponse, VfpManifest } from '../types';

// ── Shape ─────────────────────────────────────────────────────────────────────

export interface VfpDataContextValue {
  sessionId:    string | null;
  manifest:     VfpManifest | null;
  vfpData:      VfpData | null;
  isLoaded:     boolean;

  setSessionId(id: string | null): void;
  setManifest(manifest: VfpManifest | null): void;
  setVfpData(data: VfpData | null): void;
  applyUploadResponse(res: UploadVfpResponse): void;
  reset(): void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const VfpDataContext = createContext<VfpDataContextValue | null>(null);

export function VfpDataProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [manifest,  setManifest]  = useState<VfpManifest | null>(null);
  const [vfpData,   setVfpData]   = useState<VfpData | null>(null);

  const applyUploadResponse = useCallback((res: UploadVfpResponse) => {
    setSessionId(res.session_id ?? null);
    setManifest(res.manifest ?? null);
  }, []);

  const reset = useCallback(() => {
    setSessionId(null);
    setManifest(null);
    setVfpData(null);
  }, []);

  const value: VfpDataContextValue = {
    sessionId,
    manifest,
    vfpData,
    isLoaded:  sessionId !== null,

    setSessionId,
    setManifest,
    setVfpData,
    applyUploadResponse,
    reset,
  };

  return (
    <VfpDataContext.Provider value={value}>{children}</VfpDataContext.Provider>
  );
}

export function useVfpDataContext(): VfpDataContextValue {
  const ctx = useContext(VfpDataContext);
  if (!ctx) {
    throw new Error('useVfpDataContext must be used within <VfpDataProvider>');
  }
  return ctx;
}
