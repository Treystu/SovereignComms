import { useEffect, useMemo, useRef, useState } from 'react';
import { RtcSession } from './RtcSession';
import { WebSocketSession } from './WebSocketSession';
import { MeshRouter, Message } from './Mesh';

export function useRtcAndMesh() {
  const [useStun, setUseStun] = useState(false);
  const [offerJson, setOfferJson] = useState('');
  const [answerJson, setAnswerJson] = useState('');
  const [status, setStatus] = useState('idle');
  const [lastMsg, setLastMsg] = useState<Message | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [rtt, setRtt] = useState(0);
  const [netInfo, setNetInfo] = useState<{ type?: string; effectiveType?: string }>({});
  const pending = useRef<string[]>([]);
  const wsRef = useRef<WebSocketSession | null>(null);
  const wsBackoff = useRef(1000);

  useEffect(() => {
    const conn = (navigator as any).connection;
    if (conn) {
      const update = () => setNetInfo({ type: conn.type, effectiveType: conn.effectiveType });
      update();
      conn.addEventListener('change', update);
      return () => conn.removeEventListener('change', update);
    }
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
    [useStun]
  );
  // Close previous session when options change
  useEffect(() => {
    return () => rtc.close();
  }, [rtc]);
  const mesh = useMemo(() => new MeshRouter(crypto.randomUUID()), []);

  function push(s:string){ setLog((l)=>[s, ...l].slice(0,200)); }

  function sendRaw(data:string){
    try{ rtc.send(data); }
    catch{
      try{ wsRef.current?.send(data); }
      catch{ pending.current.push(data); }
    }
  }

  function flushPending(){
    const items = pending.current.splice(0);
    for(const msg of items) sendRaw(msg);
  }

  function startWsFallback(){
    if(wsRef.current) return;
    const url = (import.meta as any).env?.VITE_WS_URL || 'wss://example.com/ws';
    const ws = new WebSocketSession({
      url,
      heartbeatMs:5000,
      onOpen: ()=>{ push('ws-open'); flushPending(); setStatus('connected'); wsBackoff.current=1000; },
      onClose: ()=>{ push('ws-close'); setStatus('reconnecting'); scheduleWsReconnect(); },
      onError: e=>push('ws-error:'+e),
      onState: s=>{ if(s.rtt!==undefined) setRtt(s.rtt); }
    });
    (ws as any).events.onMessage = (rtc as any).events.onMessage;
    wsRef.current = ws;
  }

  function scheduleWsReconnect(){
    setTimeout(()=>{ wsRef.current = null; startWsFallback(); }, wsBackoff.current);
    wsBackoff.current = Math.min(wsBackoff.current*2, 16000);
  }

  function isValidMessage(m: any): m is Message {
    return m && typeof m.id === 'string' && typeof m.ttl === 'number' &&
      typeof m.from === 'string' && typeof m.type === 'string';
  }

  useEffect(() => {
    const onMsg = (raw: any) => {
      try {
        const msg = JSON.parse(raw);
        if (!isValidMessage(msg)) throw new Error('invalid');
        mesh.ingress(msg);
        setLastMsg(msg);
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
  }, [mesh, rtc]);

  async function createOffer(){
    setStatus('creating-offer');
    try {
      const o = await rtc.createOffer();
      setOfferJson(o);
      setStatus('offer-created');
      return o;
    } catch (e) {
      push('offer-error');
      setStatus('error');
      throw e;
    }
  }

  async function acceptOfferAndCreateAnswer(remoteOffer: string){
    setStatus('accepting-offer');
    try {
      const a = await rtc.receiveOfferAndCreateAnswer(remoteOffer);
      setAnswerJson(a);
      setStatus('answer-created');
      return a;
    } catch (e) {
      push('answer-error');
      setStatus('error');
      throw e;
    }
  }

  async function acceptAnswer(remoteAnswer: string){
    setStatus('accepting-answer');
    try {
      await rtc.receiveAnswer(remoteAnswer);
      setStatus('connected');
    } catch (e) {
      push('accept-error');
      setStatus('error');
      throw e;
    }
  }
  function sendMesh(payload: any){
    const msg: Message = { id: crypto.randomUUID(), ttl: 8, from: 'LOCAL', type: 'chat', payload } as any;
    sendRaw(JSON.stringify(msg));
  }

  return { useStun, setUseStun, createOffer, acceptOfferAndCreateAnswer, acceptAnswer, offerJson, answerJson, status, sendMesh, lastMsg, log, rtt, netInfo };
}
