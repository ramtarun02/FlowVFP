/**
 * useSocket
 * =========
 * Manages a single Socket.IO connection lifecycle for a component tree.
 *
 * Usage:
 *   const { socket, connected, error, connect, disconnect } = useSocket();
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createSocket, type VfpSocket } from '../api/socket';

export interface UseSocketReturn {
  socket:     VfpSocket | null;
  connected:  boolean;
  error:      string | null;
  connect():  void;
  disconnect(): void;
}

export function useSocket(): UseSocketReturn {
  const socketRef              = useRef<VfpSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Lazily create the socket instance once
  const getSocket = useCallback((): VfpSocket => {
    if (!socketRef.current) {
      socketRef.current = createSocket();
    }
    return socketRef.current;
  }, []);

  const connect = useCallback(() => {
    const s = getSocket();

    s.on('connect',       () => { setConnected(true);  setError(null); });
    s.on('disconnect',    () => { setConnected(false); });
    s.on('connect_error', (err) => {
      setError(err.message);
      setConnected(false);
    });

    if (!s.connected) s.connect();
  }, [getSocket]);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    setConnected(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  return {
    socket:     socketRef.current,
    connected,
    error,
    connect,
    disconnect,
  };
}
