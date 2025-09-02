import { test, expect } from '@playwright/test';
import http from 'http';
import fs from 'fs';
import QRCode from 'qrcode';

// Generate a QR code containing a channel identifier, have one page display
// it, and a second page decode it to establish a BroadcastChannel. Verify that
// both text and binary ("voice") messages propagate between the paired peers.
test('text and voice messages propagate between QR-paired peers', async ({ browser }) => {
  const channelId = 'chan-' + Math.random().toString(36).slice(2);
  const qrDataUrl = await QRCode.toDataURL(channelId);

  const jsqrPath = require.resolve('jsqr/dist/jsQR.js');
  const jsqrScript = fs.readFileSync(jsqrPath);

  const server = http.createServer((req, res) => {
    if (req.url === '/jsqr.js') {
      res.setHeader('Content-Type', 'text/javascript');
      return res.end(jsqrScript);
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(`<html><body><img id="qr" src="${qrDataUrl}" /></body></html>`);
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address() as any;
  const url = `http://127.0.0.1:${port}`;

  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await pageA.goto(url);
  await pageB.goto(url);

  await pageA.evaluate((id) => {
    (window as any).bc = new BroadcastChannel(id);
  }, channelId);

  await pageB.addScriptTag({ url: `${url}/jsqr.js` });
  const scannedId = await pageB.evaluate(() => {
    const img = document.getElementById('qr') as HTMLImageElement;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = (window as any).jsQR(data, width, height);
    const id = code.data;
    (window as any).bc = new BroadcastChannel(id);
    return id;
  });

  expect(scannedId).toBe(channelId);

  const textPromise = pageB.evaluate(() =>
    new Promise<string>((resolve) => {
      (window as any).bc.onmessage = (e: MessageEvent) => resolve(e.data);
    }),
  );
  await pageA.evaluate(() => (window as any).bc.postMessage('hello'));
  await expect(textPromise).resolves.toBe('hello');

  const voiceData = [1, 2, 3];
  const voicePromise = pageA.evaluate(() =>
    new Promise<Uint8Array>((resolve) => {
      (window as any).bc.onmessage = (e: MessageEvent) => resolve(e.data);
    }),
  );
  await pageB.evaluate((data) => (window as any).bc.postMessage(Uint8Array.from(data)), voiceData);
  const received = await voicePromise;
  const arr = await pageA.evaluate((buf) => Array.from(buf), received);
  expect(arr).toEqual([1, 2, 3]);

  await context.close();
  server.close();
});
