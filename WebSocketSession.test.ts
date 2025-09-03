import { describe, it, expect, vi } from 'vitest';
import { WebSocketSession } from './WebSocketSession';

class MockWS {
  public static OPEN = 1;
  public readyState = MockWS.OPEN;
  public bufferedAmount = 0;
  public sent: any[] = [];
  onopen?: () => void;
  onclose?: (e: any) => void;
  onerror?: (e: any) => void;
  onmessage?: (e: any) => void;
  constructor(public url: string) {}
  send(data: any) {
    this.sent.push(data);
  }
  close() {}
}

(globalThis as any).WebSocket = MockWS;

describe('WebSocketSession buffering', () => {
  it('queues when bufferedAmount high and drains on flush', () => {
    vi.useFakeTimers();
    const onDrain = vi.fn();
    const s = new WebSocketSession({
      url: 'ws://test',
      onDrain,
      maxBufferedAmount: 1,
      heartbeatMs: 10000,
    });
    // @ts-ignore access private
    const ws = (s as any).ws as MockWS;
    ws.onopen?.();
    ws.bufferedAmount = 2; // above threshold
    s.send('a');
    expect(ws.sent).toHaveLength(0);
    // @ts-ignore access private
    expect((s as any).outbox.length).toBe(1);
    ws.bufferedAmount = 0; // buffer drained
    vi.advanceTimersByTime(60); // allow flush interval
    expect(ws.sent).toEqual(['a']);
    expect(onDrain).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
