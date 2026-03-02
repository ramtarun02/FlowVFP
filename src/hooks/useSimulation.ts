/**
 * useSimulation
 * =============
 * Drives the FlowVFP solver over Socket.IO.
 *
 * Handles: connecting, starting/stopping the solver, collecting stdout
 * lines, and signalling completion/error.
 *
 * The socket is created lazily on the first call to `startSimulation()`.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { createSocket, type VfpSocket, type SimulationPayload } from '../api/socket';

export type SimulationStatus = 'idle' | 'connecting' | 'running' | 'complete' | 'error' | 'stopped';

export interface UseSimulationReturn {
  status:       SimulationStatus;
  outputLines:  string[];
  exitCode:     number | null;
  error:        string | null;
  connected:    boolean;

  startSimulation(payload: SimulationPayload): Promise<void>;
  stopSimulation():                            void;
  clearOutput():                               void;
}

export function useSimulation(): UseSimulationReturn {
  const socketRef                    = useRef<VfpSocket | null>(null);
  const [status,      setStatus]     = useState<SimulationStatus>('idle');
  const [outputLines, setOutputLines] = useState<string[]>([]);
  const [exitCode,    setExitCode]   = useState<number | null>(null);
  const [error,       setError]      = useState<string | null>(null);
  const [connected,   setConnected]  = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const getSocket = useCallback((): VfpSocket => {
    if (!socketRef.current) {
      const s = createSocket();

      s.on('connect', () => setConnected(true));
      s.on('disconnect', () => {
        setConnected(false);
        if (status === 'running') setStatus('error');
      });
      s.on('connect_error', (err) => {
        setError(`Connection failed: ${err.message}`);
        setStatus('error');
        setConnected(false);
      });

      s.on('simulation_output', ({ line }) => {
        setOutputLines((prev) => [...prev, line]);
      });

      s.on('simulation_complete', ({ exit_code }) => {
        setExitCode(exit_code);
        setStatus(exit_code === 0 ? 'complete' : 'error');
      });

      s.on('simulation_error', ({ error: msg }) => {
        setError(msg);
        setStatus('error');
      });

      s.on('simulation_stopped', () => {
        setStatus('stopped');
      });

      socketRef.current = s;
    }
    return socketRef.current;
  }, [status]);

  const startSimulation = useCallback(
    async (payload: SimulationPayload): Promise<void> => {
      setStatus('connecting');
      setOutputLines([]);
      setError(null);
      setExitCode(null);

      const s = getSocket();

      if (!s.connected) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            s.off('connect',       onConn);
            s.off('connect_error', onErr);
            reject(new Error('Socket connection timed out'));
          }, 15_000);

          function onConn() {
            clearTimeout(timer);
            s.off('connect_error', onErr);
            resolve();
          }
          function onErr(err: Error) {
            clearTimeout(timer);
            s.off('connect', onConn);
            reject(err);
          }
          s.once('connect',       onConn);
          s.once('connect_error', onErr);
          s.connect();
        });
      }

      setStatus('running');
      s.emit('start_simulation', payload);
    },
    [getSocket],
  );

  const stopSimulation = useCallback(() => {
    socketRef.current?.emit('stop_simulation');
  }, []);

  const clearOutput = useCallback(() => {
    setOutputLines([]);
  }, []);

  return {
    status,
    outputLines,
    exitCode,
    error,
    connected,
    startSimulation,
    stopSimulation,
    clearOutput,
  };
}
