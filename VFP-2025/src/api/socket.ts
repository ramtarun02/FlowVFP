/**
 * Socket service
 * ==============
 * Factory that creates a typed Socket.IO client for the VFP solver.
 *
 * Usage:
 *   const socket = createSocket();
 *   socket.on('simulation_output', handler);
 *   socket.emit('start_simulation', payload);
 *   // ...
 *   socket.disconnect();
 */

import { io, Socket } from 'socket.io-client';
import { BASE_URL } from './client';

// ── Event type maps ───────────────────────────────────────────────────────────

export interface SimulationPayload {
  vfp_data:   Record<string, unknown>;
  sim_name:   string;
  file_name?: string;
}

export interface DownloadPayload {
  sim_name: string;
}

export interface ServerToClientEvents {
  connect:               () => void;
  disconnect:            (reason: string) => void;
  connect_error:         (err: Error) => void;
  pong:                  (data: { pong: true; sid: string }) => void;
  simulation_output:     (data: { line: string }) => void;
  simulation_complete:   (data: { sim_name: string; exit_code: number }) => void;
  simulation_error:      (data: { error: string }) => void;
  simulation_stopped:    (data: { message: string }) => void;
  simulation_folder:     (data: { sim_name: string; files: string[] }) => void;
  download_ready:        (data: { url: string }) => void;
  download_error:        (data: { error: string }) => void;
}

export interface ClientToServerEvents {
  ping:                  () => void;
  start_simulation:      (payload: SimulationPayload) => void;
  stop_simulation:       () => void;
  download:              (payload: DownloadPayload) => void;
  get_simulation_folder: (payload: { sim_name: string }) => void;
}

export type VfpSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a Socket.IO client connected to the VFP backend.
 *
 * The socket is NOT connected on creation; call `socket.connect()` when
 * you are ready to start communicating.
 */
export function createSocket(): VfpSocket {
  const isPackaged = import.meta.env.VITE_PACKAGED === 'true';
  const wsUrl = isPackaged
    ? window.location.origin
    : ((import.meta.env.VITE_WS_URL as string) ?? BASE_URL);

  // Werkzeug's dev server cannot handle the WebSocket handshake / upgrade —
  // it returns a plain HTTP response, which the browser reports as
  // "Invalid frame header".  Force polling-only in dev; production (Azure +
  // eventlet or gunicorn) handles WebSocket fine.
  const isDev = (import.meta.env.DEV as boolean) || import.meta.env.MODE === 'development';

  const socket: VfpSocket = io(wsUrl, {
    autoConnect:          false,   // explicit connect for full control
    transports:           isDev ? ['polling'] : ['polling', 'websocket'],
    upgrade:              !isDev,
    reconnection:         true,
    reconnectionAttempts: 5,
    reconnectionDelay:    1_000,
    reconnectionDelayMax: 10_000,
    timeout:              20_000,
    // withCredentials must be false when server uses cors_allowed_origins="*".
    // A wildcard origin and credentials=true is rejected by browsers (CORS spec).
    withCredentials:      false,
  });

  return socket;
}

// ── Convenience helpers ───────────────────────────────────────────────────────

/**
 * Promise that resolves when the socket successfully connects, or rejects
 * after `timeoutMs` milliseconds.
 */
export function waitForConnect(
  socket: VfpSocket,
  timeoutMs = 10_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
      reject(new Error(`Socket did not connect within ${timeoutMs}ms`));
    }, timeoutMs);

    function onConnect() {
      clearTimeout(timer);
      socket.off('connect_error', onError);
      resolve();
    }

    function onError(err: Error) {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      reject(err);
    }

    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
  });
}
