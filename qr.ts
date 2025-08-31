import QRCode from 'qrcode';
import jsQR from 'jsqr';

export async function renderQR(canvas: HTMLCanvasElement, text: string) {
  await QRCode.toCanvas(canvas, text, { errorCorrectionLevel: 'M', margin: 1, scale: 4 });
}

export async function startVideo(el: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  el.srcObject = stream;
  await el.play();
  return stream;
}

export async function scanQRFromVideo(video: HTMLVideoElement, signal: AbortSignal): Promise<string> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (signal.aborted) return reject(new Error('aborted'));
      if (video.readyState >= 2) {
        const width = Math.floor(video.videoWidth / 2);
        const height = Math.floor(video.videoHeight / 2);
        canvas.width = width; canvas.height = height;
        ctx.drawImage(video, 0, 0, width, height);
        const img = ctx.getImageData(0, 0, width, height);
        const code = jsQR(img.data, img.width, img.height);
        if (code && code.data) { resolve(code.data); return; }
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}
