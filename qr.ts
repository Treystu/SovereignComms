import QRCode from 'qrcode';
import jsQR from 'jsqr';

export async function renderQR(canvas: HTMLCanvasElement, text: string) {
  await QRCode.toCanvas(canvas, text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 4,
  });
}

export async function startVideo(el: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
  });
  // Ensure the element is configured for mobile browsers before playing
  el.srcObject = stream;
  el.setAttribute('playsinline', 'true');
  el.muted = true;
  await el.play();
  return stream;
}

export async function scanQRFromVideo(
  video: HTMLVideoElement,
  signal: AbortSignal,
  timeoutMs = 15000,
): Promise<string> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timeout'));
    }, timeoutMs);
    let raf = 0;
    const cleanup = () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
    const tick = () => {
      if (signal.aborted) {
        cleanup();
        return reject(new Error('aborted'));
      }
      if (video.readyState >= 2) {
        let width = video.videoWidth;
        let height = video.videoHeight;
        const maxDim = 1024;
        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height);
          width = Math.floor(width * scale);
          height = Math.floor(height * scale);
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(video, 0, 0, width, height);
        const img = ctx.getImageData(0, 0, width, height);
        const code = jsQR(img.data, img.width, img.height);
        if (code && code.data) {
          if (code.data.length > 2048) {
            cleanup();
            return reject(new Error('QR too large'));
          }
          cleanup();
          resolve(code.data);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    signal.addEventListener(
      'abort',
      () => {
        cleanup();
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}
