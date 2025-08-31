import { useMemo, useRef, useState } from 'react';
import { RtcSession } from './RtcSession';
import { MeshRouter, Message } from './Mesh';

export function useRtcAndMesh() {
  const [useStun, setUseStun] = useState(false);
  const [offerJson, setOfferJson] = useState('');
  const [answerJson, setAnswerJson] = useState('');
  const [status, setStatus] = useState('idle');
  const [lastMsg, setLastMsg] = useState<Message | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [peers, setPeers] = useState<string[]>([]);

  const mesh = useMemo(() => new MeshRouter(crypto.randomUUID()), []);
  const sessionsRef = useRef<Map<string, RtcSession>>(new Map());
  const pendingRtcRef = useRef<RtcSession | null>(null);

  function push(s: string) {
    setLog((l) => [s, ...l].slice(0, 200));
  }

  function createRtc(): RtcSession {
    let peerId: string | null = null;
    let rtc: RtcSession;
    rtc = new RtcSession({
      useStun,
      onOpen: () => {
        push('dc-open');
        const hello: Message = {
          id: crypto.randomUUID(),
          ttl: 1,
          from: mesh.selfId,
          type: 'hello',
          payload: {}
        } as any;
        try { rtc.send(JSON.stringify(hello)); } catch {}
      },
      onClose: (reason) => {
        push('dc-close:' + reason);
        if (peerId) {
          mesh.disconnectPeer(peerId);
          sessionsRef.current.delete(peerId);
          setPeers(Array.from(sessionsRef.current.keys()));
        }
      },
      onError: (e) => push('dc-error:' + e),
      onState: (s) => push(`ice:${s.ice}`),
      onMessage: (raw) => {
        try {
          const msg: Message = JSON.parse(raw as string);
          if (!peerId) {
            peerId = msg.from;
            sessionsRef.current.set(peerId, rtc);
            setPeers(Array.from(sessionsRef.current.keys()));
            mesh.connectPeer(peerId, (m) => rtc.send(JSON.stringify(m)));
          }
          mesh.ingress(msg);
          setLastMsg(msg);
        } catch {
          push('rx:non-json');
        }
      }
    });
    return rtc;
  }

  function createOffer() {
    const rtc = createRtc();
    pendingRtcRef.current = rtc;
    return rtc.createOffer().then((o) => {
      setOfferJson(o);
      setStatus('offer-created');
      return o;
    });
  }

  function acceptOfferAndCreateAnswer(remoteOffer: string) {
    const rtc = createRtc();
    pendingRtcRef.current = rtc;
    return rtc.receiveOfferAndCreateAnswer(remoteOffer).then((a) => {
      setAnswerJson(a);
      setStatus('answer-created');
      return a;
    });
  }

  function acceptAnswer(remoteAnswer: string) {
    const rtc = pendingRtcRef.current;
    return rtc
      ?.receiveAnswer(remoteAnswer)
      .then(() => setStatus('connected'));
  }

  function sendMesh(payload: any, targets?: string[]) {
    const msg: Message = {
      id: crypto.randomUUID(),
      ttl: 8,
      from: mesh.selfId,
      type: 'chat',
      payload
    } as any;
    const ids = targets && targets.length ? targets : Array.from(sessionsRef.current.keys());
    for (const id of ids) {
      const rtc = sessionsRef.current.get(id);
      try {
        rtc?.send(JSON.stringify(msg));
      } catch {}
    }
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
    peers
  };
}
