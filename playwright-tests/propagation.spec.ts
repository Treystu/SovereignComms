import { test, expect } from '@playwright/test';
import http from 'http';

// Use a pairing token (simulating QR scan) to share a BroadcastChannel
// between two isolated browser contexts and verify text and binary messages
// propagate between them.
test.skip('text and voice messages propagate between peers', async ({ browser }) => {
  const server = http.createServer((_, res) => {
    res.end('<html><body>test</body></html>');
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address() as any;
  const url = `http://127.0.0.1:${port}`;

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await pageA.goto(url);
  await pageB.goto(url);

  // Simulate QR pairing by generating a random channel name on pageA
  const channelId = await pageA.evaluate(() => {
    const id = 'chan-' + Math.random().toString(36).slice(2);
    (window as any).bc = new BroadcastChannel(id);
    return id;
  });
  await pageB.evaluate((id) => {
    (window as any).bc = new BroadcastChannel(id);
  }, channelId);

  // Text message propagation from A -> B
  const textPromise = pageB.evaluate(() =>
    new Promise<string>((resolve) => {
      (window as any).bc.onmessage = (e: MessageEvent) => resolve(e.data);
    }),
  );
  await pageA.evaluate(() => (window as any).bc.postMessage('hello'));
  await expect(textPromise).resolves.toBe('hello');

  // Binary "voice" message propagation from B -> A
  const voiceData = new Uint8Array([1, 2, 3]).buffer;
  const voicePromise = pageA.evaluate(() =>
    new Promise<ArrayBuffer>((resolve) => {
      (window as any).bc.onmessage = (e: MessageEvent) => resolve(e.data);
    }),
  );
  await pageB.evaluate((data) => (window as any).bc.postMessage(data), voiceData);
  const received = await voicePromise;
  const arr = await pageA.evaluate((buf) => Array.from(new Uint8Array(buf)), received);
  expect(arr).toEqual([1, 2, 3]);

  await contextA.close();
  await contextB.close();
  server.close();
});
