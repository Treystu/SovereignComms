import { listenForAudioData } from './audio';
import { vi, describe, it, expect } from 'vitest';

describe('listenForAudioData cleanup', () => {
  it('clears timeout when aborted', async () => {
    vi.useFakeTimers();

    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });

    const mockCtx = {
      sampleRate: 48000,
      createMediaStreamSource: vi.fn().mockReturnValue({ connect: vi.fn() }),
      createAnalyser: vi.fn().mockReturnValue({
        fftSize: 0,
        frequencyBinCount: 0,
        connect: vi.fn(),
        getFloatFrequencyData: vi.fn(),
      }),
      close: vi.fn(),
    } as any;

    const navigatorMock = { mediaDevices: { getUserMedia } };
    vi.stubGlobal('navigator', navigatorMock as any);
    vi.stubGlobal('window', {
      AudioContext: vi.fn().mockImplementation(() => mockCtx),
      navigator: navigatorMock,
    } as any);
    vi.stubGlobal('requestAnimationFrame', vi.fn());

    const controller = new AbortController();
    const promise = listenForAudioData(controller.signal, 1000);
    controller.abort();
    await expect(promise).rejects.toThrow('aborted');

    expect(vi.getTimerCount()).toBe(0);

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
