import { useEffect, useMemo, useState } from 'react';
import { RtcSession } from './RtcSession';
import { MeshRouter, Message } from './Mesh';

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
  const [log, setLog] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const rtc = useMemo(() => new RtcSession({ useStun, onOpen: ()=>push('dc-open'), onClose: r=>push('dc-close:'+r), onError: e=>push('dc-error:'+e), onState: s=>push(`ice:${s.ice}`) }), [useStun]);
  // Close previous session when options change
  useEffect(() => { return () => rtc.close(); }, [rtc]);
  const mesh = useMemo(() => new MeshRouter(crypto.randomUUID()), []);

  function push(s:string){ setLog((l)=>[s, ...l].slice(0,200)); }

  function addMessage(m: ChatMessage) {
    setMessages((list) => [...list, m]);
  }

  function clearMessages() {
    setMessages([]);
    if (typeof localStorage !== 'undefined') localStorage.removeItem('chatMessages');
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
        if (msg.type === 'chat' && typeof msg.payload?.text === 'string') {
          addMessage({ text: msg.payload.text, direction: 'incoming', timestamp: Date.now() });
        }
      } catch {
        push('rx:invalid-msg');
      }
    };
    (rtc as any).events.onMessage = onMsg; // bind
    return () => { (rtc as any).events.onMessage = undefined; };
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
    rtc.send(JSON.stringify(msg));
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
    log,
    messages,
    addMessage,
    clearMessages,
  };
}
