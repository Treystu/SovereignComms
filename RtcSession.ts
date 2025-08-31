export type RtcEvents = {
  onOpen?: () => void;
  onClose?: (reason?: any) => void;
  onError?: (err: any) => void;
  onMessage?: (data: string | ArrayBuffer) => void;
  onState?: (state: { ice: RTCIceConnectionState; dc?: string }) => void;
};

export type RtcOptions = RtcEvents & {
  useStun?: boolean; // default false for offline-respecting
  /** optional pre-shared key that both peers must include */
  psk?: string;
  /** optional signature that both peers must include */
  signature?: string;
};

export class RtcSession {
  public events: RtcEvents;
  private pc: RTCPeerConnection;
  private dc?: RTCDataChannel;
  private creds: { psk?: string; signature?: string };

  constructor(opts: RtcOptions = {}) {
    const iceServers = opts.useStun ? [{ urls: 'stun:stun.l.google.com:19302' }] : [];
    this.pc = new RTCPeerConnection({ iceServers });
    this.events = opts;
    this.creds = { psk: opts.psk, signature: opts.signature };

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

  private bindDataChannel(dc: RTCDataChannel) {
    this.dc = dc;
    dc.onopen = () => this.events.onOpen?.();
    dc.onclose = () => this.events.onClose?.('dc-close');
    dc.onerror = (e) => this.events.onError?.(e as any);
    // Forward incoming data to the consumer without unnecessary type juggling
    dc.onmessage = (m) => this.events.onMessage?.(m.data);
  }

  private addCredentials(desc: RTCSessionDescriptionInit) {
    if (!desc.sdp) return;
    if (this.creds.psk) desc.sdp += `\r\na=psk:${this.creds.psk}`;
    if (this.creds.signature) desc.sdp += `\r\na=sig:${this.creds.signature}`;
  }

  private extractCredentials(desc: RTCSessionDescriptionInit) {
    const pskMatch = desc.sdp?.match(/^a=psk:(.*)$/m);
    const sigMatch = desc.sdp?.match(/^a=sig:(.*)$/m);
    // strip credentials so they aren't set on the actual connection
    desc.sdp = desc.sdp?.replace(/^a=psk:.*\r?\n?/m, '').replace(/^a=sig:.*\r?\n?/m, '');
    return { psk: pskMatch?.[1], signature: sigMatch?.[1] };
  }

  private verifyRemote(desc: RTCSessionDescriptionInit) {
    const creds = this.extractCredentials(desc);
    if (this.creds.psk && creds.psk !== this.creds.psk) {
      throw new Error('Invalid pre-shared key');
    }
    if (this.creds.signature && creds.signature !== this.creds.signature) {
      throw new Error('Invalid signature');
    }
  }

  async createOffer(): Promise<string> {
    this.dc = this.pc.createDataChannel('svm');
    this.bindDataChannel(this.dc);

    const offer = await this.pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
    this.addCredentials(offer);
    await this.pc.setLocalDescription(offer);
    await this.waitIceComplete();
    return JSON.stringify(this.pc.localDescription);
  }

  async receiveOfferAndCreateAnswer(remoteOfferJson: string): Promise<string> {
    const remote: RTCSessionDescriptionInit = JSON.parse(remoteOfferJson);
    this.verifyRemote(remote);
    await this.pc.setRemoteDescription(remote);
    const answer = await this.pc.createAnswer();
    this.addCredentials(answer);
    await this.pc.setLocalDescription(answer);
    await this.waitIceComplete();
    return JSON.stringify(this.pc.localDescription);
  }

  async receiveAnswer(remoteAnswerJson: string) {
    const remote: RTCSessionDescriptionInit = JSON.parse(remoteAnswerJson);
    this.verifyRemote(remote);
    await this.pc.setRemoteDescription(remote);
  }

  send(data: string | ArrayBuffer) {
    if (!this.dc || this.dc.readyState !== 'open') {
      throw new Error('DataChannel not open');
    }
    // RTCDataChannel#send accepts both string and ArrayBuffer directly
    this.dc.send(data);
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
