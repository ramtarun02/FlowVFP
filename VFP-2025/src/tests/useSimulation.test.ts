/**
 * Tests: useSimulation hook
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSimulation } from '../hooks/useSimulation';
import * as socketModule from '../api/socket';
import type { VfpSocket } from '../api/socket';

// ── Mock socket.io client ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeMockSocket(): any {
  const handlers: Record<string, Function[]> = {};

  const socket = {
    _handlers:     handlers,
    connected:     false,
    on:            (event: string, fn: Function) => {
      handlers[event] = [...(handlers[event] ?? []), fn];
      return socket;
    },
    once:          (event: string, fn: Function) => {
      const wrapper = (...args: unknown[]) => {
        fn(...args);
        handlers[event] = (handlers[event] ?? []).filter((h) => h !== wrapper);
      };
      handlers[event] = [...(handlers[event] ?? []), wrapper];
      return socket;
    },
    off:           (event: string, fn?: Function) => {
      if (fn) {
        handlers[event] = (handlers[event] ?? []).filter((h) => h !== fn);
      } else {
        delete handlers[event];
      }
      return socket;
    },
    emit:           vi.fn(),
    connect:        vi.fn().mockImplementation(() => {
      socket.connected = true;
      (handlers['connect'] ?? []).forEach((fn) => fn());
    }),
    disconnect:     vi.fn().mockImplementation(() => {
      socket.connected = false;
    }),
    triggerEvent(event: string, ...args: unknown[]) {
      (handlers[event] ?? []).forEach((fn) => fn(...args));
    },
  };

  return socket as ReturnType<typeof makeMockSocket>;
}

afterEach(() => vi.restoreAllMocks());

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useSimulation', () => {
  it('initial state is idle', () => {
    const { result } = renderHook(() => useSimulation());
    expect(result.current.status).toBe('idle');
    expect(result.current.outputLines).toHaveLength(0);
    expect(result.current.connected).toBe(false);
  });

  it('status becomes "running" after startSimulation', async () => {
    const mockSocket = makeMockSocket();
    vi.spyOn(socketModule, 'createSocket').mockReturnValue(
      mockSocket as unknown as VfpSocket,
    );

    const { result } = renderHook(() => useSimulation());

    await act(async () => {
      await result.current.startSimulation({
        vfp_data: {},
        sim_name: 'test-sim',
      });
    });

    expect(result.current.status).toBe('running');
    expect(mockSocket.emit).toHaveBeenCalledWith('start_simulation', {
      vfp_data: {},
      sim_name: 'test-sim',
    });
  });

  it('collects output lines', async () => {
    const mockSocket = makeMockSocket();
    vi.spyOn(socketModule, 'createSocket').mockReturnValue(
      mockSocket as unknown as VfpSocket,
    );

    const { result } = renderHook(() => useSimulation());

    await act(async () => {
      await result.current.startSimulation({ vfp_data: {}, sim_name: 'x' });
    });

    act(() => {
      mockSocket.triggerEvent('simulation_output', { line: 'Step 1' });
      mockSocket.triggerEvent('simulation_output', { line: 'Step 2' });
    });

    expect(result.current.outputLines).toEqual(['Step 1', 'Step 2']);
  });

  it('status becomes "complete" on simulation_complete with exit_code 0', async () => {
    const mockSocket = makeMockSocket();
    vi.spyOn(socketModule, 'createSocket').mockReturnValue(
      mockSocket as unknown as VfpSocket,
    );

    const { result } = renderHook(() => useSimulation());

    await act(async () => {
      await result.current.startSimulation({ vfp_data: {}, sim_name: 'x' });
    });

    act(() => {
      mockSocket.triggerEvent('simulation_complete', {
        sim_name:  'x',
        exit_code: 0,
      });
    });

    expect(result.current.status).toBe('complete');
    expect(result.current.exitCode).toBe(0);
  });

  it('status becomes "error" on simulation_error', async () => {
    const mockSocket = makeMockSocket();
    vi.spyOn(socketModule, 'createSocket').mockReturnValue(
      mockSocket as unknown as VfpSocket,
    );

    const { result } = renderHook(() => useSimulation());

    await act(async () => {
      await result.current.startSimulation({ vfp_data: {}, sim_name: 'x' });
    });

    act(() => {
      mockSocket.triggerEvent('simulation_error', { error: 'Crash!' });
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Crash!');
  });

  it('clearOutput resets output lines', async () => {
    const mockSocket = makeMockSocket();
    vi.spyOn(socketModule, 'createSocket').mockReturnValue(
      mockSocket as unknown as VfpSocket,
    );

    const { result } = renderHook(() => useSimulation());

    await act(async () => {
      await result.current.startSimulation({ vfp_data: {}, sim_name: 'x' });
    });

    act(() => {
      mockSocket.triggerEvent('simulation_output', { line: 'Line' });
    });

    act(() => result.current.clearOutput());

    expect(result.current.outputLines).toHaveLength(0);
  });
});
