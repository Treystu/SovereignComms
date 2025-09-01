import { describe, it, expect } from 'vitest';
import { RtcSession } from './RtcSession';

class MockDataChannel {
  readyState: RTCDataChannelState = 'open';
  onopen?: ()=>void;
  onclose?: ()=>void;
  onerror?: (e:any)=>void;
  onmessage?: (e:any)=>void;
  close(){}
}

class MockRTCPeerConnection {
  public config: any;
  public localDescription: any = null;
  public oniceconnectionstatechange: any;
  public ondatachannel: any;
  public iceConnectionState: RTCIceConnectionState = 'new';
  public iceGatheringState: RTCIceGatheringState = 'complete';
  public signalingState: RTCSignalingState = 'stable';
  public connectionState: RTCPeerConnectionState = 'new';
  constructor(config: any){ this.config = config; }
  addEventListener(){}
  removeEventListener(){}
  createDataChannel(){ return new MockDataChannel() as any; }
  createOffer(){ return Promise.resolve({}); }
  setLocalDescription(desc: any){ this.localDescription = desc; return Promise.resolve(); }
  createAnswer(){ return Promise.resolve({}); }
  setRemoteDescription(){ return Promise.resolve(); }
  close(){ this.signalingState = 'closed'; this.connectionState = 'closed'; }
}

// @ts-ignore
globalThis.RTCPeerConnection = MockRTCPeerConnection as any;

describe('RtcSession', () => {
  it('uses STUN server when enabled', () => {
    const s = new RtcSession({ useStun: true });
    // @ts-ignore accessing private for test
    expect((s as any).pc.config.iceServers).toEqual([
      { urls: 'stun:stun.l.google.com:19302' },
    ]);
  });

  it('waitIceComplete resolves even if ICE never completes', async () => {
    const s = new RtcSession({});
    // @ts-ignore force iceGatheringState to simulate no completion
    (s as any).pc.iceGatheringState = 'new';
    const start = Date.now();
    // @ts-ignore accessing private for test
    await (s as any).waitIceComplete(10);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('creates a new offer after close', async () => {
    const s = new RtcSession({});
    await s.createOffer();
    s.close();
    await expect(s.createOffer()).resolves.toBeTypeOf('string');
  });
});
