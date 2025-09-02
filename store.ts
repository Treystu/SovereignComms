import { useEffect, useMemo, useRef, useState } from 'react';
import { RtcSession } from './RtcSession';
import { WebSocketSession } from './WebSocketSession';
import { MeshRouter, Message, IndexedDbSeenAdapter } from './Mesh';
import { log } from './logger';
import {
  generateKeyPair,
  exportPublicKeyJwk,
  importPublicKeyJwk,
  encryptEnvelope,
  decryptEnvelope,
  KeyPair,
  sign,
  verify,
  fingerprintPublicKey,
} from './envelope';

export async function verifyAndImportPubKey(payload: {
  key: JsonWebKey;
  sig: number[];
  sigKey: JsonWebKey;
}): Promise<CryptoKey> {
  const ecdsaPub = await importPublicKeyJwk(payload.sigKey, 'ECDSA');
  const data = new TextEncoder().encode(JSON.stringify(payload.key));
  const valid = await verify(
    data.buffer,
    new Uint8Array(payload.sig).buffer,
    ecdsaPub,
  );
  if (!valid) throw new Error('invalid signature');
  return importPublicKeyJwk(payload.key, 'ECDH');
}

export interface ChatMessage {
  text: string;
  direction: 'incoming' | 'outgoing';
  timestamp: number;
}

export function useRtcAndMesh() {
  const [useStun, setUseStun] = useState(false);
  const [stunUrl, setStunUrl] = useState('');
  const [turnUrl, setTurnUrl] = useState('');
  const [offerJson, setOfferJson] = useState('');
  const [answerJson, setAnswerJson] = useState('');
  const [status, setStatus] = useState('idle');
  const [lastMsg, setLastMsg] = useState<Message | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [rtt, setRtt] = useState(0);
  const [rtcStats, setRtcStats] = useState<{
    rtt?: number;
    ice?: string;
    dc?: string;
  }>({});
  const [wsStats, setWsStats] = useState<{
    rtt?: number;
    ice?: string;
    dc?: string;
  }>({});
  const [netInfo, setNetInfo] = useState<{
    type?: string;
    effectiveType?: string;
  }>({});
  const [keys, setKeys] = useState<KeyPair | null>(null);
  const [remotePub, setRemotePub] = useState<CryptoKey | null>(null);
  const [localFp, setLocalFp] = useState<string>('');
  const [remoteFp, setRemoteFp] = useState<string>('');

  const pending = useRef<string[]>([]);
  const wsRef = useRef<WebSocketSession | null>(null);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      const s = localStorage.getItem('useStun');
      if (s) setUseStun(s === 'true');
      const su = localStorage.getItem('stunUrl');
      if (su) setStunUrl(su);
      const tu = localStorage.getItem('turnUrl');
      if (tu) setTurnUrl(tu);
    } catch {}
  }, []);
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('useStun', String(useStun));
      localStorage.setItem('stunUrl', stunUrl);
      localStorage.setItem('turnUrl', turnUrl);
    } catch {}
  }, [useStun, stunUrl, turnUrl]);

  useEffect(() => {
    const conn = (navigator as any).connection;
    if (conn) {
      const update = () =>
        setNetInfo({ type: conn.type, effectiveType: conn.effectiveType });
      update();
      conn.addEventListener('change', update);
      return () => conn.removeEventListener('change', update);
    }
  }, []);

  async function loadKeys(): Promise<KeyPair | null> {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem('keys');
      if (!raw) return null;
      const data = JSON.parse(raw);
      const ecdhPub = await importPublicKeyJwk(data.ecdh.pub, 'ECDH');
      const ecdhPriv = await crypto.subtle.importKey(
        'jwk',
        data.ecdh.priv,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey', 'deriveBits'],
      );
      const ecdsaPub = await importPublicKeyJwk(data.ecdsa.pub, 'ECDSA');
      const ecdsaPriv = await crypto.subtle.importKey(
        'jwk',
        data.ecdsa.priv,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign'],
      );
      return {
        ecdh: { publicKey: ecdhPub, privateKey: ecdhPriv },
        ecdsa: { publicKey: ecdsaPub, privateKey: ecdsaPriv },
      } as KeyPair;
    } catch {
      return null;
    }
  }

  async function saveKeys(k: KeyPair) {
    if (typeof localStorage === 'undefined') return;
    try {
      const ecdhPub = await exportPublicKeyJwk(k.ecdh.publicKey);
      const ecdhPriv = await crypto.subtle.exportKey('jwk', k.ecdh.privateKey);
      const ecdsaPub = await exportPublicKeyJwk(k.ecdsa.publicKey);
      const ecdsaPriv = await crypto.subtle.exportKey(
        'jwk',
        k.ecdsa.privateKey,
      );
      const payload = {
        ecdh: { pub: ecdhPub, priv: ecdhPriv },
        ecdsa: { pub: ecdsaPub, priv: ecdsaPriv },
      };
      localStorage.setItem('keys', JSON.stringify(payload));
    } catch {}
  }

  useEffect(() => {
    (async () => {
      const loaded = await loadKeys();
      if (loaded) {
        setKeys(loaded);
      } else {
        const kp = await generateKeyPair();
        setKeys(kp);
        await saveKeys(kp);
      }
    })();
  }, []);

  useEffect(() => {
    if (keys) fingerprintPublicKey(keys.ecdh.publicKey).then(setLocalFp);
  }, [keys]);

  useEffect(() => {
    if (remotePub)
      fingerprintPublicKey(remotePub).then((fp) => setRemoteFp(fp));
  }, [remotePub]);

  useEffect(
    () => () => {
      wsRef.current?.close();
    },
    [],
  );

  const iceServers = useMemo(() => {
    const servers: RTCIceServer[] = [];
    if (useStun && stunUrl) servers.push({ urls: stunUrl });
    if (useStun && turnUrl) servers.push({ urls: turnUrl });
    return servers;
  }, [useStun, stunUrl, turnUrl]);

  const rtc = useMemo(
    () =>
      new RtcSession({
        iceServers,
        heartbeatMs: 5000,
        onOpen: () => {
          push('dc-open');
          flushPending();
          setStatus('connected');
          sendKey();
        },
        onClose: (r) => {
          push('dc-close:' + r);
          setStatus('reconnecting');
          startWsFallback();
        },
        onError: (e) => push('dc-error:' + e),
        onState: (s) => {
          push(`ice:${s.ice}`);
          if (s.rtt !== undefined) setRtt(s.rtt);
        },
      }),
    [iceServers],
  );
  // Close previous session when options change
  useEffect(() => {
    return () => rtc.close();
  }, [rtc]);
  const mesh = useMemo(
    () =>
      new MeshRouter(
        crypto.randomUUID(),
        typeof indexedDB !== 'undefined'
          ? new IndexedDbSeenAdapter()
          : undefined,
      ),
    [],
  );

  function push(s: string) {
    log('event', s);
    setLogLines((l) => [s, ...l].slice(0, 200));
  }

  function sendRtc(data: string): boolean {
    try {
      rtc.send(data);
      return true;
    } catch {
      return false;
    }
  }

  function sendWs(data: string): boolean {
    try {
      if (!wsRef.current) return false;
      wsRef.current.send(data);
      return true;
    } catch {
      return false;
    }
  }

  function queuePending(data: string): boolean {
    pending.current.push(data);
    return true;
  }

  function sendRaw(data: string) {
    log('debug', 'sendRaw:' + data);
    if (sendRtc(data)) return;
    log('warn', 'rtc send failed, trying ws');
    if (sendWs(data)) return;
    log('warn', 'ws send failed, queueing');
    queuePending(data);
  }

  async function sendKey() {
    if (!keys) return;
    const jwk = await exportPublicKeyJwk(keys.ecdh.publicKey);
    const data = new TextEncoder().encode(JSON.stringify(jwk));
    const sigBuf = await sign(data.buffer, keys.ecdsa.privateKey);
    const sig = Array.from(new Uint8Array(sigBuf));
    const sigKey = await exportPublicKeyJwk(keys.ecdsa.publicKey);
    const msg: Message = {
      id: crypto.randomUUID(),
      ttl: 0,
      from: 'LOCAL',
      type: 'pubkey',
      payload: { key: jwk, sig, sigKey },
    } as any;
    sendRaw(JSON.stringify(msg));
  }

  useEffect(() => {
    if (keys && status === 'connected') {
      sendKey();
    }
  }, [keys, status]);

  function flushPending() {
    const items = pending.current.splice(0);
    log('debug', 'flushPending:' + items.length);
    for (const msg of items) sendRaw(msg);
  }

  function startWsFallback() {
    if (wsRef.current) {
      log('ws', 'closing existing ws');
      wsRef.current.close();
      wsRef.current = null;
    }
    const url = (import.meta as any).env?.VITE_WS_URL || 'wss://example.com/ws';
    log('ws', 'connecting:' + url);
    const ws = new WebSocketSession({
      url,
      heartbeatMs: 5000,
      reconnect: true,
      reconnectMinDelayMs: 1000,
      reconnectMaxDelayMs: 16000,
      onOpen: () => {
        log('ws', 'open');
        push('ws-open');
        flushPending();
        setStatus('connected');
      },
      onClose: (r) => {
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        log('ws', 'close:' + r);
        push('ws-close');
        setStatus('reconnecting');
      },
      onError: (e) => {
        const err =
          typeof e === 'string'
            ? e
            : (e as any)?.message || (e as any)?.type || String(e);
        log('ws', 'error:' + err);
        push('ws-error:' + err);
      },
      onState: (s) => {
        log('ws', 'state:' + JSON.stringify(s));
        if (s.rtt !== undefined) setRtt(s.rtt);
      },
    });
    (ws as any).events.onMessage = (rtc as any).events.onMessage;
    wsRef.current = ws;
  }

  useEffect(() => {
    const id = setInterval(() => {
      setRtcStats(rtc.getStats());
      setWsStats(wsRef.current?.getStats() || {});
    }, 1000);
    return () => clearInterval(id);
  }, [rtc]);

  function addMessage(m: ChatMessage) {
    setMessages((list) => [...list, m]);
  }

  function clearMessages() {
    setMessages([]);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('chatMessages');
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        log('error', 'Failed to clear saved messages: ' + err);
      }
    }
  }

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      const saved = localStorage.getItem('chatMessages');
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('chatMessages', JSON.stringify(messages));
    } catch {}
  }, [messages]);

  function isValidMessage(m: any): m is Message {
    return (
      m &&
      typeof m.id === 'string' &&
      typeof m.ttl === 'number' &&
      typeof m.from === 'string' &&
      typeof m.type === 'string'
    );
  }

  useEffect(() => {
    const onMsg = async (raw: any) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'pubkey') {
          try {
            const pub = await verifyAndImportPubKey(msg.payload);
            setRemotePub(pub);
          } catch {}
          return;
        }
        if (!isValidMessage(msg)) throw new Error('invalid');
        if (msg.enc && keys && remotePub) {
          const iv = new Uint8Array(msg.payload.iv);
          const ct = new Uint8Array(msg.payload.ciphertext).buffer;
          const data = await decryptEnvelope(
            { iv, ciphertext: ct },
            keys.ecdh.privateKey,
            remotePub,
          );
          msg.payload = JSON.parse(
            new TextDecoder().decode(new Uint8Array(data)),
          );
        }
        mesh.ingress(msg);
        setLastMsg(msg);
        if (msg.type === 'chat' && typeof msg.payload?.text === 'string') {
          addMessage({
            text: msg.payload.text,
            direction: 'incoming',
            timestamp: Date.now(),
          });
        }
      } catch {
        push('rx:invalid-msg');
      }
    };
    (rtc as any).events.onMessage = onMsg; // bind
    if (wsRef.current) (wsRef.current as any).events.onMessage = onMsg;
    return () => {
      (rtc as any).events.onMessage = undefined;
      if (wsRef.current) (wsRef.current as any).events.onMessage = undefined;
    };
  }, [mesh, rtc, keys, remotePub]);

  async function createOffer() {
    log('rtc', 'createOffer');
    setStatus('creating-offer');
    try {
      const o = await rtc.createOffer();
      setOfferJson(o);
      setStatus('offer-created');
      return o;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      log('error', 'createOffer failed:' + err);
      push('offer-error');
      setStatus('error');
      throw e;
    }
  }

  async function acceptOfferAndCreateAnswer(remoteOffer: string) {
    log('rtc', 'acceptOffer');
    setStatus('accepting-offer');
    try {
      const a = await rtc.receiveOfferAndCreateAnswer(remoteOffer);
      setAnswerJson(a);
      setStatus('answer-created');
      return a;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      log('error', 'acceptOffer failed:' + err);
      push('answer-error');
      setStatus('error');
      throw e;
    }
  }

  async function acceptAnswer(remoteAnswer: string) {
    log('rtc', 'acceptAnswer');
    setStatus('accepting-answer');
    try {
      await rtc.receiveAnswer(remoteAnswer);
      setStatus('connected');
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      log('error', 'acceptAnswer failed:' + err);
      push('accept-error');
      setStatus('error');
      throw e;
    }
  }
  async function sendMesh(payload: any, type: string = 'chat') {
    log('event', 'sendMesh:' + JSON.stringify(payload));
    let body = payload;
    let enc = false;
    if (keys && remotePub) {
      const data = new TextEncoder().encode(JSON.stringify(payload));
      const { iv, ciphertext } = await encryptEnvelope(
        data.buffer,
        keys.ecdh.privateKey,
        remotePub,
      );
      body = {
        iv: Array.from(iv),
        ciphertext: Array.from(new Uint8Array(ciphertext)),
      };
      enc = true;
    }
    const msg: Message = {
      id: crypto.randomUUID(),
      ttl: 8,
      from: 'LOCAL',
      type,
      payload: body,
      enc,
    } as any;
    sendRaw(JSON.stringify(msg));
  }

  async function sendFile(
    file: File,
    onProgress?: (sent: number, total: number) => void,
  ) {
    const chunkSize = 16 * 1024; // 16KB chunks
    const total = Math.ceil(file.size / chunkSize);
    for (let i = 0; i < total; i++) {
      const slice = file.slice(
        i * chunkSize,
        Math.min(file.size, (i + 1) * chunkSize),
      );
      const buf = await slice.arrayBuffer();
      const payload = {
        name: file.name,
        type: file.type,
        size: file.size,
        chunk: i,
        total,
        data: Array.from(new Uint8Array(buf)),
      };
      await sendMesh(payload, 'file');
      onProgress?.(i + 1, total);
    }
  }

  return {
    useStun,
    setUseStun,
    stunUrl,
    setStunUrl,
    turnUrl,
    setTurnUrl,
    createOffer,
    acceptOfferAndCreateAnswer,
    acceptAnswer,
    offerJson,
    answerJson,
    status,
    sendMesh,
    sendFile,
    lastMsg,
    log: logLines,
    messages,
    addMessage,
    clearMessages,
    rtt,
    rtcStats,
    wsStats,
    netInfo,
    startWsFallback,
    localFingerprint: localFp,
    remoteFingerprint: remoteFp,
  };
}
