import { log } from './logger';
import { Heartbeat } from './src/heartbeat';

export type RtcEvents = {
  onOpen?: () => void;
  onClose?: (reason?: any) => void;
  onError?: (err: any) => void;
  onMessage?: (data: string | ArrayBuffer) => void;
  onState?: (state: {
    ice: RTCIceConnectionState | 'ws';
    dc?: string;
    rtt?: number;
  }) => void;
};

export type RtcOptions = RtcEvents & {
  /** Optional ICE server configuration */
  iceServers?: RTCIceServer[];
  heartbeatMs?: number;
  signal?: AbortSignal;
};

export class RtcSession {
  public events: RtcEvents;
  private pc: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private hb: Heartbeat;
  private iceServers: RTCIceServer[];
  private abortSignal?: AbortSignal;
  private abortHandler?: () => void;

  constructor(opts: RtcOptions = {}) {
    this.events = opts;
    this.iceServers = opts.iceServers ?? [];
    const interval = opts.heartbeatMs ?? 5000;
    log('rtc', 'RtcSession created iceServers=' + this.iceServers.length);
    this.pc = this.initPc();
    this.hb = new Heartbeat({
      intervalMs: interval,
      send: (msg) => {
        try {
          this.send(msg);
        } catch {}
      },
      onTimeout: () => {
        this.events.onClose?.('timeout');
        this.close();
      },
      onRtt: (rtt) => {
        this.events.onState?.({
          ice: this.pc.iceConnectionState,
          dc: this.dc?.readyState,
          rtt,
        });
      },
    });
    this.abortSignal = opts.signal;
    this.abortHandler = () => {
      this.events.onClose?.('aborted');
      this.close();
    };
    this.abortSignal?.addEventListener('abort', this.abortHandler);
  }

  // Create a new RTCPeerConnection and wire up all of our event handlers.
  // This allows the session to be reused after being closed.
  private initPc(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });

    pc.oniceconnectionstatechange = () => {
      log('rtc', 'iceConnectionState:' + pc.iceConnectionState);
      this.events.onState?.({
        ice: pc.iceConnectionState,
        dc: this.dc?.readyState,
        rtt: this.hb.rtt,
      });
      if (
        pc.iceConnectionState === 'failed' ||
        pc.iceConnectionState === 'disconnected'
      ) {
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
      log(
        'rtc',
        'iceCandidate:' + (e.candidate ? e.candidate.candidate : 'null'),
      );
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
      this.hb.start();
      this.events.onOpen?.();
    };
    dc.onclose = () => {
      log('rtc', 'dc close');
      this.hb.stop();
      this.events.onClose?.('dc-close');
    };
    dc.onerror = (e) => {
      log('rtc', 'dc error');
      this.events.onError?.(e as any);
    };
    // Forward incoming data to the consumer without unnecessary type juggling
    dc.onmessage = (m) => {
      const data = m.data;
      log(
        'rtc',
        'dc message:' + (typeof data === 'string' ? data : '[binary]'),
      );
      if (this.hb.handle(data)) return;
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

    const offer = await this.pc.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
    });
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
    } else if (data instanceof ArrayBuffer) {
      // Send ArrayBuffer directly to avoid extra copies
      this.dc.send(data);
    } else {
      this.dc.send(data as any);
    }
  }

  close() {
    log('rtc', 'close');
    this.abortSignal?.removeEventListener('abort', this.abortHandler!);
    this.dc?.close();
    this.dc = undefined;
    this.pc.close();
    this.hb.stop();
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

  getStats() {
    return {
      rtt: this.hb.rtt,
      ice: this.pc.iceConnectionState,
      dc: this.dc?.readyState,
    };
  }
}

function parseSdp(
  json: string,
  expectedType: 'offer' | 'answer',
): RTCSessionDescriptionInit {
  let obj: any;
  try {
    obj = JSON.parse(json);
  } catch {
    throw new Error('invalid sdp json');
  }
  if (
    typeof obj !== 'object' ||
    typeof obj.sdp !== 'string' ||
    typeof obj.type !== 'string'
  ) {
    throw new Error('invalid sdp fields');
  }
  if (obj.type !== expectedType) {
    throw new Error('invalid sdp type');
  }
  return obj;
}
