import { useEffect, useMemo, useState } from 'react';
import { RtcSession } from './RtcSession';
import { MeshRouter, Message } from './Mesh';

export function useRtcAndMesh() {
  const [useStun, setUseStun] = useState(false);
  const [ttl, setTtl] = useState(8);
  const [maxMessageSize, setMaxMessageSize] = useState(1024);
  const [offerJson, setOfferJson] = useState('');
  const [answerJson, setAnswerJson] = useState('');
  const [status, setStatus] = useState('idle');
  const [lastMsg, setLastMsg] = useState<Message | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const rtc = useMemo(
    () =>
      new RtcSession({
        useStun,
        onOpen: () => push('dc-open'),
        onClose: r => push('dc-close:' + r),
        onError: e => push('dc-error:' + e),
        onState: s => push(`ice:${s.ice}`),
      }),
    [useStun],
  );
  const mesh = useMemo(
    () => new MeshRouter(crypto.randomUUID(), ttl, maxMessageSize),
    [ttl, maxMessageSize],
  );

  function push(s:string){ setLog((l)=>[s, ...l].slice(0,200)); }

  useEffect(() => {
    const onMsg = (raw: any) => {
      try {
        const msg: Message = JSON.parse(raw);
        mesh.ingress(msg);
        setLastMsg(msg);
      } catch {
        push('rx:non-json');
      }
    };
    (rtc as any).events.onMessage = onMsg; // bind
    return () => { (rtc as any).events.onMessage = undefined; };
  }, [mesh, rtc]);

  function createOffer(){
    return rtc.createOffer().then((o)=>{ setOfferJson(o); setStatus('offer-created'); return o;});
  }
  function acceptOfferAndCreateAnswer(remoteOffer: string){
    return rtc.receiveOfferAndCreateAnswer(remoteOffer).then((a)=>{ setAnswerJson(a); setStatus('answer-created'); return a;});
  }
  function acceptAnswer(remoteAnswer: string){
    return rtc.receiveAnswer(remoteAnswer).then(()=> setStatus('connected'));
  }
  function sendMesh(payload: any){
    const msg: Message = { id: crypto.randomUUID(), ttl, from: 'LOCAL', type: 'chat', payload } as any;
    const json = JSON.stringify(msg);
    if (json.length > maxMessageSize) { alert('Message too large'); return; }
    rtc.send(json);
  }

  return { useStun, setUseStun, ttl, setTtl, maxMessageSize, setMaxMessageSize, createOffer, acceptOfferAndCreateAnswer, acceptAnswer, offerJson, answerJson, status, sendMesh, lastMsg, log };
}
