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

  constructor(opts: RtcOptions = {}) {
    const iceServers = opts.useStun ? [{ urls: 'stun:stun.l.google.com:19302' }] : [];
    this.pc = new RTCPeerConnection({ iceServers });
    this.events = opts;
    this.heartbeatMs = opts.heartbeatMs ?? 5000;

    this.pc.oniceconnectionstatechange = () => {
      this.events.onState?.({ ice: this.pc.iceConnectionState, dc: this.dc?.readyState, rtt: this.rtt });
      if (this.pc.iceConnectionState === 'failed' || this.pc.iceConnectionState === 'disconnected') {
        this.events.onClose?.(this.pc.iceConnectionState);
      }
    };

    this.pc.ondatachannel = (ev) => {
      this.bindDataChannel(ev.channel);
    };
  }

  private bindDataChannel(dc: RTCDataChannel) {
    this.dc = dc;
    dc.onopen = () => {
      this.startHeartbeat();
      this.events.onOpen?.();
    };
    dc.onclose = () => {
      this.stopHeartbeat();
      this.events.onClose?.('dc-close');
    };
    dc.onerror = (e) => this.events.onError?.(e as any);
    // Forward incoming data to the consumer without unnecessary type juggling
    dc.onmessage = (m) => {
      const data = m.data;
      if (data === 'ping') {
        try { this.dc?.send('pong'); } catch {}
        return;
      }
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
    this.dc = this.pc.createDataChannel('svm');
    this.bindDataChannel(this.dc);

    const offer = await this.pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
    await this.pc.setLocalDescription(offer);
    await this.waitIceComplete();
    if (!this.pc.localDescription) throw new Error('no localDescription');
    return JSON.stringify(this.pc.localDescription);
  }

  async receiveOfferAndCreateAnswer(remoteOfferJson: string): Promise<string> {
    const remote = parseSdp(remoteOfferJson, 'offer');
    await this.pc.setRemoteDescription(remote);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.waitIceComplete();
    if (!this.pc.localDescription) throw new Error('no localDescription');
    return JSON.stringify(this.pc.localDescription);
  }

  async receiveAnswer(remoteAnswerJson: string) {
    const remote = parseSdp(remoteAnswerJson, 'answer');
    await this.pc.setRemoteDescription(remote);
  }

  send(data: string | ArrayBuffer | ArrayBufferView) {
    if (!this.dc || this.dc.readyState !== 'open') {
      throw new Error('DataChannel not open');
    }
    if (typeof data === 'string') {
      this.dc.send(data);
    } else {
      const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
      // TS lib doesn't accept ArrayBufferLike here yet
      this.dc.send(buf as any);
    }
  }

  close() {
    this.dc?.close();
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
