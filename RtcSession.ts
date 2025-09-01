import { log } from './logger';

export type RtcEvents = {
  onOpen?: () => void;
  onClose?: (reason?: any) => void;
  onError?: (err: any) => void;
  onMessage?: (data: string | ArrayBuffer) => void;
  onState?: (state: { ice: RTCIceConnectionState | 'ws'; dc?: string; rtt?: number }) => void;
};

export type RtcOptions = RtcEvents & {
  useStun?: boolean; // default false for offline-respecting
  heartbeatMs?: number;
};

export class RtcSession {
  public events: RtcEvents;
  private pc: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private heartbeatMs: number;
  private hbTimer?: any;
  private lastPing = 0;
  private lastPong = Date.now();
  private rtt = 0;
  private useStun: boolean;

  constructor(opts: RtcOptions = {}) {
    this.events = opts;
    this.useStun = !!opts.useStun;
    this.heartbeatMs = opts.heartbeatMs ?? 5000;
    log('rtc', 'RtcSession created useStun=' + this.useStun);
    this.pc = this.initPc();
  }

  // Create a new RTCPeerConnection and wire up all of our event handlers.
  // This allows the session to be reused after being closed.
  private initPc(): RTCPeerConnection {
    const iceServers = this.useStun ? [{ urls: 'stun:stun.l.google.com:19302' }] : [];
    const pc = new RTCPeerConnection({ iceServers });

    pc.oniceconnectionstatechange = () => {
      log('rtc', 'iceConnectionState:' + pc.iceConnectionState);
      this.events.onState?.({ ice: pc.iceConnectionState, dc: this.dc?.readyState, rtt: this.rtt });
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        this.events.onClose?.(pc.iceConnectionState);
      }
    };

    pc.onicegatheringstatechange = () => {
      log('rtc', 'iceGatheringState:' + pc.iceGatheringState);
    };
    pc.onsignalingstatechange = () => {
      log('rtc', 'signalingState:' + pc.signalingState);
    };
    pc.onconnectionstatechange = () => {
      log('rtc', 'connectionState:' + pc.connectionState);
    };
    pc.onicecandidate = (e) => {
      log('rtc', 'iceCandidate:' + (e.candidate ? e.candidate.candidate : 'null'));
    };

    pc.ondatachannel = (ev) => {
      log('rtc', 'ondatachannel');
      this.bindDataChannel(ev.channel);
    };

    return pc;
  }

  private bindDataChannel(dc: RTCDataChannel) {
    this.dc = dc;
    log('rtc', 'bindDataChannel:' + dc.label);
    dc.onopen = () => {
      log('rtc', 'dc open');
      this.startHeartbeat();
      this.events.onOpen?.();
    };
    dc.onclose = () => {
      log('rtc', 'dc close');
      this.stopHeartbeat();
      this.events.onClose?.('dc-close');
    };
    dc.onerror = (e) => {
      log('rtc', 'dc error');
      this.events.onError?.(e as any);
    };
    // Forward incoming data to the consumer without unnecessary type juggling
    dc.onmessage = (m) => {
      const data = m.data;
      log('rtc', 'dc message:' + (typeof data === 'string' ? data : '[binary]'));
      if (data === 'ping') { try { this.dc?.send('pong'); } catch {} return; }
      if (data === 'pong') {
        this.lastPong = Date.now();
        this.rtt = this.lastPong - this.lastPing;
        this.events.onState?.({ ice: this.pc.iceConnectionState, dc: this.dc?.readyState, rtt: this.rtt });
        return;
      }
      this.events.onMessage?.(data);
    };
  }

  async createOffer(): Promise<string> {
    log('rtc', 'createOffer');
    if (this.pc.signalingState === 'closed') {
      // PeerConnection cannot be reused after close; create a new one.
      this.pc = this.initPc();
    }
    this.dc = this.pc.createDataChannel('svm');
    this.bindDataChannel(this.dc);

    const offer = await this.pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
    await this.pc.setLocalDescription(offer);
    await this.waitIceComplete();
    if (!this.pc.localDescription) throw new Error('no localDescription');
    return JSON.stringify(this.pc.localDescription);
  }

  async receiveOfferAndCreateAnswer(remoteOfferJson: string): Promise<string> {
    log('rtc', 'receiveOfferAndCreateAnswer');
    if (this.pc.signalingState === 'closed') {
      this.pc = this.initPc();
    }
    const remote = parseSdp(remoteOfferJson, 'offer');
    await this.pc.setRemoteDescription(remote);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.waitIceComplete();
    if (!this.pc.localDescription) throw new Error('no localDescription');
    return JSON.stringify(this.pc.localDescription);
  }

  async receiveAnswer(remoteAnswerJson: string) {
    log('rtc', 'receiveAnswer');
    if (this.pc.signalingState === 'closed') {
      this.pc = this.initPc();
    }
    const remote = parseSdp(remoteAnswerJson, 'answer');
    await this.pc.setRemoteDescription(remote);
  }

  send(data: string | ArrayBuffer | ArrayBufferView) {
    if (!this.dc || this.dc.readyState !== 'open') {
      log('rtc', 'send failed: dc not open');
      throw new Error('DataChannel not open');
    }
    log('rtc', 'send:' + (typeof data === 'string' ? data : '[binary]'));
    if (typeof data === 'string') {
      this.dc.send(data);
    } else {
      const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
      // Cast to satisfy the overloaded RTCDataChannel.send signature
      this.dc.send(buf as any);
    }
  }

  close() {
    log('rtc', 'close');
    this.dc?.close();
    this.dc = undefined;
    this.pc.close();
    this.stopHeartbeat();
  }

  // Wait for ICE gathering to finish but don't hang forever if it never
  // completes (which can happen if a STUN server is unreachable). The
  // optional timeout is mainly for tests; in production the default value is
  // long enough that candidates usually finish gathering.
  private waitIceComplete(timeoutMs = 5000): Promise<void> {
    if (this.pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.pc.removeEventListener('icegatheringstatechange', checkState);
        this.pc.removeEventListener('icecandidate', checkCandidate);
        resolve();
      };
      const checkState = () => {
        if (this.pc.iceGatheringState === 'complete') done();
      };
      const checkCandidate = (e: RTCPeerConnectionIceEvent) => {
        if (!e.candidate) done();
      };
      const timer = setTimeout(done, timeoutMs);
      this.pc.addEventListener('icegatheringstatechange', checkState);
      this.pc.addEventListener('icecandidate', checkCandidate);
    });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.hbTimer = setInterval(() => {
      try {
        this.lastPing = Date.now();
        this.send('ping');
      } catch {}
      if (Date.now() - this.lastPong > this.heartbeatMs * 2) {
        this.events.onClose?.('timeout');
        this.close();
      }
    }, this.heartbeatMs);
  }

  private stopHeartbeat() {
    if (this.hbTimer) clearInterval(this.hbTimer);
  }

  getStats() { return { rtt: this.rtt }; }
}

function parseSdp(json: string, expectedType: 'offer' | 'answer'): RTCSessionDescriptionInit {
  const obj = JSON.parse(json);
  if (typeof obj !== 'object' || obj.type !== expectedType || typeof obj.sdp !== 'string') {
    throw new Error('invalid sdp');
  }
  return obj;
}
