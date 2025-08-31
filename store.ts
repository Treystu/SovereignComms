import { useEffect, useMemo, useState } from 'react';
import { RtcSession } from './RtcSession';
import { MeshRouter, Message } from './Mesh';
import { encrypt, decrypt } from './envelope';

export function useRtcAndMesh() {
  const [useStun, setUseStun] = useState(false);
  const [offerJson, setOfferJson] = useState('');
  const [answerJson, setAnswerJson] = useState('');
  const [status, setStatus] = useState('idle');
  const [lastMsg, setLastMsg] = useState<Message | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const rtc = useMemo(() => new RtcSession({ useStun, onOpen: ()=>push('dc-open'), onClose: r=>push('dc-close:'+r), onError: e=>push('dc-error:'+e), onState: s=>push(`ice:${s.ice}`) }), [useStun]);
  const mesh = useMemo(() => new MeshRouter(crypto.randomUUID()), []);
  const aesKeyPromise = useMemo(() => crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  ), []);

  function push(s:string){ setLog((l)=>[s, ...l].slice(0,200)); }

  useEffect(() => {
    const onMsg = async (raw: any) => {
      try {
        const msg: Message = JSON.parse(raw);
        try {
          const key = await aesKeyPromise;
          msg.payload = await decrypt(key, msg.payload);
        } catch {
          push('rx:decrypt-fail');
        }
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
  async function sendMesh(payload: any){
    const key = await aesKeyPromise;
    const enc = await encrypt(key, payload);
    const msg: Message = { id: crypto.randomUUID(), ttl: 8, from: 'LOCAL', type: 'chat', payload: enc } as any;
    rtc.send(JSON.stringify(msg));
  }

  return { useStun, setUseStun, createOffer, acceptOfferAndCreateAnswer, acceptAnswer, offerJson, answerJson, status, sendMesh, lastMsg, log };
}
