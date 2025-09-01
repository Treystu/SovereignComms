import { describe, it, expect } from 'vitest';
import { listenForAudioData } from './audio';

describe('listenForAudioData', () => {
  it('throws mic-permission-denied when microphone access is denied', async () => {
    const oldNavigator = (globalThis as any).navigator;
    (globalThis as any).navigator = {
      mediaDevices: {
        getUserMedia: () =>
          Promise.reject({ name: 'NotAllowedError' } as unknown as Error),
      },
    };

    const controller = new AbortController();
    await expect(
      listenForAudioData(controller.signal),
    ).rejects.toThrow('mic-permission-denied');

    (globalThis as any).navigator = oldNavigator;
  });
});

