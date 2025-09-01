import { useEffect, useMemo, useRef, useState } from 'react';
import { RtcSession } from './RtcSession';
import { WebSocketSession } from './WebSocketSession';
import { MeshRouter, Message } from './Mesh';
import { log } from './logger';
import {
  generateKeyPair,
  exportPublicKeyJwk,
  importPublicKeyJwk,
  encryptEnvelope,
  decryptEnvelope,
  KeyPair,
} from './envelope';

export interface ChatMessage {
  text: string;
  direction: 'incoming' | 'outgoing';
  timestamp: number;
}

export function useRtcAndMesh() {
  const [useStun, setUseStun] = useState(false);
  const [offerJson, setOfferJson] = useState('');
  const [answerJson, setAnswerJson] = useState('');
  const [status, setStatus] = useState('idle');
  const [lastMsg, setLastMsg] = useState<Message | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [rtt, setRtt] = useState(0);
  const [netInfo, setNetInfo] = useState<{
    type?: string;
    effectiveType?: string;
  }>({});
  const [keys, setKeys] = useState<KeyPair | null>(null);
  const [remotePub, setRemotePub] = useState<CryptoKey | null>(null);

  const pending = useRef<string[]>([]);
  const wsRef = useRef<WebSocketSession | null>(null);
  const wsBackoff = useRef(1000);
  const wsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    generateKeyPair().then(setKeys);
  }, []);

  const rtc = useMemo(
    () =>
      new RtcSession({
        useStun,
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
    [useStun],
  );
  // Close previous session when options change
  useEffect(() => {
    return () => rtc.close();
  }, [rtc]);
  const mesh = useMemo(() => new MeshRouter(crypto.randomUUID()), []);

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
    const jwk = await exportPublicKeyJwk(keys.publicKey);
    const msg: Message = {
      id: crypto.randomUUID(),
      ttl: 0,
      from: 'LOCAL',
      type: 'pubkey',
      payload: jwk,
    } as any;
    sendRaw(JSON.stringify(msg));
  }

  function flushPending() {
    const items = pending.current.splice(0);
    log('debug', 'flushPending:' + items.length);
    for (const msg of items) sendRaw(msg);
  }

  function startWsFallback() {
    if (wsRef.current) {
      log('ws', 'ws already connected');
      return;
    }
    if (wsTimer.current) {
      clearTimeout(wsTimer.current);
      wsTimer.current = null;
    }
    const url = (import.meta as any).env?.VITE_WS_URL || 'wss://example.com/ws';
    log('ws', 'connecting:' + url);
      const ws = new WebSocketSession({
        url,
        heartbeatMs: 5000,
        onOpen: () => {
          log('ws', 'open');
          push('ws-open');
          flushPending();
          setStatus('connected');
          wsBackoff.current = 1000;
        },
        onClose: (r) => {
          log('ws', 'close:' + r);
          push('ws-close');
          setStatus('reconnecting');
          scheduleWsReconnect();
        },
        onError: (e) => {
          const err = typeof e === 'string' ? e : (e as any)?.message || (e as any)?.type || String(e);
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

  function scheduleWsReconnect() {
    log('ws', 'reconnect in ' + wsBackoff.current);
    if (wsTimer.current) clearTimeout(wsTimer.current);
    wsTimer.current = setTimeout(() => {
      wsRef.current = null;
      wsTimer.current = null;
      startWsFallback();
    }, wsBackoff.current);
    wsBackoff.current = Math.min(wsBackoff.current * 2, 16000);
  }

  function addMessage(m: ChatMessage) {
    setMessages((list) => [...list, m]);
  }

  function clearMessages() {
    setMessages([]);
    if (typeof localStorage !== 'undefined')
      localStorage.removeItem('chatMessages');
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
            const pub = await importPublicKeyJwk(msg.payload);
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
            keys.privateKey,
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
  async function sendMesh(payload: any) {
    log('event', 'sendMesh:' + JSON.stringify(payload));
    let body = payload;
    let enc = false;
    if (keys && remotePub) {
      const data = new TextEncoder().encode(JSON.stringify(payload));
      const { iv, ciphertext } = await encryptEnvelope(
        data.buffer,
        keys.privateKey,
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
      type: 'chat',
      payload: body,
      enc,
    } as any;
    sendRaw(JSON.stringify(msg));
  }

  return {
    useStun,
    setUseStun,
    createOffer,
    acceptOfferAndCreateAnswer,
    acceptAnswer,
    offerJson,
    answerJson,
    status,
    sendMesh,
    lastMsg,
    log: logLines,
    messages,
    addMessage,
    clearMessages,
    rtt,
    netInfo,
  };
}
