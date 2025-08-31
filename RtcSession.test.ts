import { describe, it, expect } from 'vitest';
import { RtcSession } from './RtcSession';

// Minimal mock implementations of WebRTC classes for testing credential exchange
class MockDataChannel {
  public readyState = 'open';
  onopen: any;
  onclose: any;
  onerror: any;
  onmessage: any;
  close() {}
  send() {}
}

class MockRTCPeerConnection {
  public localDescription: RTCSessionDescriptionInit | null = null;
  public remoteDescription: RTCSessionDescriptionInit | null = null;
  public iceGatheringState: RTCIceGatheringState = 'complete';
  public iceConnectionState: RTCIceConnectionState = 'new';
  oniceconnectionstatechange: any;
  ondatachannel: any;
  createDataChannel() {
    return new MockDataChannel();
  }
  createOffer() {
    return Promise.resolve({ type: 'offer', sdp: 'v=0\r\n' });
  }
  createAnswer() {
    return Promise.resolve({ type: 'answer', sdp: 'v=0\r\n' });
  }
  setLocalDescription(desc: RTCSessionDescriptionInit) {
    this.localDescription = desc;
    return Promise.resolve();
  }
  setRemoteDescription(desc: RTCSessionDescriptionInit) {
    this.remoteDescription = desc;
    return Promise.resolve();
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

(globalThis as any).RTCPeerConnection = MockRTCPeerConnection as any;

describe('RtcSession credential verification', () => {
  it('rejects mismatched psk before applying remote description', async () => {
    const session = new RtcSession({ psk: 'secret' });
    const badOffer = { type: 'offer', sdp: 'v=0\r\na=psk:wrong\r\n' };

    await expect(
      session.receiveOfferAndCreateAnswer(JSON.stringify(badOffer))
    ).rejects.toThrow('pre-shared key');

    const pc = (session as any).pc as MockRTCPeerConnection;
    expect(pc.remoteDescription).toBeNull();
  });

  it('accepts matching psk and strips credential before setRemoteDescription', async () => {
    const session = new RtcSession({ psk: 'secret' });
    const goodOffer = { type: 'offer', sdp: 'v=0\r\na=psk:secret\r\n' };

    const answerJson = await session.receiveOfferAndCreateAnswer(
      JSON.stringify(goodOffer)
    );
    const pc = (session as any).pc as MockRTCPeerConnection;

    expect(pc.remoteDescription?.sdp).not.toContain('a=psk:');
    const answer = JSON.parse(answerJson);
    expect(answer.sdp).toContain('a=psk:secret');
  });
});

