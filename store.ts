import { useEffect, useMemo, useState } from 'react';
import { RtcSession } from './RtcSession';
import { MeshRouter, Message } from './Mesh';

export function useRtcAndMesh() {
  const [useStun, setUseStun] = useState(false);
  const [offerJson, setOfferJson] = useState('');
  const [answerJson, setAnswerJson] = useState('');
  const [status, setStatus] = useState('idle');
  const [lastMsg, setLastMsg] = useState<Message | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const rtc = useMemo(() => new RtcSession({ useStun, onOpen: ()=>push('dc-open'), onClose: r=>push('dc-close:'+r), onError: e=>push('dc-error:'+e), onState: s=>push(`ice:${s.ice}`) }), [useStun]);
  const mesh = useMemo(() => new MeshRouter(crypto.randomUUID()), []);

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
    const off = rtc.onMessage(onMsg);
    return off;
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
    const msg: Message = { id: crypto.randomUUID(), ttl: 8, from: 'LOCAL', type: 'chat', payload } as any;
    rtc.send(JSON.stringify(msg));
  }

  return { useStun, setUseStun, createOffer, acceptOfferAndCreateAnswer, acceptAnswer, offerJson, answerJson, status, sendMesh, lastMsg, log };
}
