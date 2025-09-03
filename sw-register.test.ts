import { describe, it, expect, vi } from 'vitest';

describe('service worker registration', () => {
  it('registers the compiled service worker on window load', async () => {
    const register = vi.fn(() => Promise.resolve());
    const listeners: Record<string, () => void> = {};
    (globalThis as any).navigator = { serviceWorker: { register } };
    (globalThis as any).window = {
      addEventListener: (event: string, handler: () => void) => {
        listeners[event] = handler;
      },
    };

    await import('./sw-register');
    await listeners['load']();

    expect(register).toHaveBeenCalledWith('/sw.js');
  });
});
