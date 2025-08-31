export type RtcEvents = {
  onOpen?: () => void;
  onClose?: (reason?: any) => void;
  onError?: (err: any) => void;
  onMessage?: (data: string | ArrayBuffer) => void;
  onState?: (state: { ice: RTCIceConnectionState; dc?: string }) => void;
};

export type RtcOptions = RtcEvents & {
  useStun?: boolean; // default false for offline-respecting
};

export class RtcSession {
  public events: RtcEvents;
  private pc: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private messageCallbacks = new Set<(data: string | ArrayBuffer) => void>();

  constructor(opts: RtcOptions = {}) {
    const iceServers = opts.useStun ? [{ urls: 'stun:stun.l.google.com:19302' }] : [];
    this.pc = new RTCPeerConnection({ iceServers });
    this.events = opts;

    this.pc.oniceconnectionstatechange = () => {
      this.events.onState?.({ ice: this.pc.iceConnectionState, dc: this.dc?.readyState });
      if (this.pc.iceConnectionState === 'failed' || this.pc.iceConnectionState === 'disconnected') {
        this.events.onClose?.(this.pc.iceConnectionState);
      }
    };

    this.pc.ondatachannel = (ev) => {
      this.bindDataChannel(ev.channel);
    };
  }

  onMessage(fn: (data: string | ArrayBuffer) => void): () => void {
    this.messageCallbacks.add(fn);
    return () => this.messageCallbacks.delete(fn);
  }

  private bindDataChannel(dc: RTCDataChannel) {
    this.dc = dc;
    dc.onopen = () => this.events.onOpen?.();
    dc.onclose = () => this.events.onClose?.('dc-close');
    dc.onerror = (e) => this.events.onError?.(e as any);
    dc.onmessage = (m) => {
      const data = typeof m.data === 'string' ? m.data : m.data;
      this.events.onMessage?.(data);
      this.messageCallbacks.forEach((fn) => fn(data));
    };
  }

  async createOffer(): Promise<string> {
    this.dc = this.pc.createDataChannel('svm');
    this.bindDataChannel(this.dc);

    const offer = await this.pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
    await this.pc.setLocalDescription(offer);
    await this.waitIceComplete();
    return JSON.stringify(this.pc.localDescription);
  }

  async receiveOfferAndCreateAnswer(remoteOfferJson: string): Promise<string> {
    const remote = JSON.parse(remoteOfferJson);
    await this.pc.setRemoteDescription(remote);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.waitIceComplete();
    return JSON.stringify(this.pc.localDescription);
  }

  async receiveAnswer(remoteAnswerJson: string) {
    const remote = JSON.parse(remoteAnswerJson);
    await this.pc.setRemoteDescription(remote);
  }

  send(data: string | ArrayBuffer) {
    if (!this.dc || this.dc.readyState !== 'open') {
      throw new Error('DataChannel not open');
    }
    if (typeof data === 'string') {
      this.dc.send(data);
    } else {
      this.dc.send(data);
    }
  }

  close() {
    this.dc?.close();
    this.pc.close();
  }

  private waitIceComplete(): Promise<void> {
    if (this.pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (this.pc.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      };
      this.pc.addEventListener('icegatheringstatechange', check);
    });
  }
}
