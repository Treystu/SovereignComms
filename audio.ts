const BIT_DURATION = 0.1; // seconds per bit
const FREQ0 = 1200;
const FREQ1 = 1800;
const FREQ_START = 2400;
const FREQ_END = 3000;

function textToBits(text: string): number[] {
  const bytes = new TextEncoder().encode(text);
  const bits: number[] = [];
  for (const b of bytes) {
    for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  }
  return bits;
}

function bitsToText(bits: number[]): string {
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8 && i + j < bits.length; j++) {
      byte = (byte << 1) | bits[i + j];
    }
    bytes.push(byte);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function scheduleTone(
  ctx: AudioContext,
  gain: GainNode,
  freq: number,
  start: number,
  duration: number,
) {
  const osc = ctx.createOscillator();
  osc.frequency.value = freq;
  osc.connect(gain);
  osc.start(start);
  osc.stop(start + duration);
}

export async function playAudioData(text: string) {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const gain = ctx.createGain();
  gain.gain.value = 0.2;
  gain.connect(ctx.destination);
  const bits = textToBits(text);
  let t = ctx.currentTime;
  scheduleTone(ctx, gain, FREQ_START, t, BIT_DURATION * 2);
  t += BIT_DURATION * 2;
  for (const bit of bits) {
    scheduleTone(ctx, gain, bit ? FREQ1 : FREQ0, t, BIT_DURATION);
    t += BIT_DURATION;
  }
  scheduleTone(ctx, gain, FREQ_END, t, BIT_DURATION * 2);
  t += BIT_DURATION * 2;
  await new Promise((r) => setTimeout(r, (t - ctx.currentTime) * 1000));
  await ctx.close();
}

export async function listenForAudioData(
  signal: AbortSignal,
  timeoutMs = 15000,
): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  const data = new Float32Array(analyser.frequencyBinCount);
  const threshold = -60;
  const freqIndex = (freq: number) =>
    Math.round((freq / ctx.sampleRate) * analyser.fftSize);

  return new Promise((resolve, reject) => {
    let bits: number[] = [];
    let interval: any;
    let finished = false;
    function cleanup() {
      finished = true;
      clearInterval(interval);
      signal.removeEventListener('abort', abortHandler);
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
    }

    function abortHandler() {
      cleanup();
      reject(new Error('aborted'));
    }
    const timer = setTimeout(() => {
      if (!finished) {
        cleanup();
        reject(new Error('timeout'));
      }
    }, timeoutMs);

    const waitForStart = () => {
      if (signal.aborted) {
        cleanup();
        reject(new Error('aborted'));
        return;
      }
      analyser.getFloatFrequencyData(data);
      if (data[freqIndex(FREQ_START)] > threshold) {
        // start listening after the start tone duration
        setTimeout(
          () => {
            interval = setInterval(sampleBit, BIT_DURATION * 1000);
          },
          BIT_DURATION * 2 * 1000,
        );
      } else {
        requestAnimationFrame(waitForStart);
      }
    };

    const sampleBit = () => {
      if (signal.aborted) {
        cleanup();
        reject(new Error('aborted'));
        return;
      }
      analyser.getFloatFrequencyData(data);
      const endMag = data[freqIndex(FREQ_END)];
      if (endMag > threshold) {
        clearInterval(interval);
        cleanup();
        resolve(bitsToText(bits));
        return;
      }
      const mag0 = data[freqIndex(FREQ0)];
      const mag1 = data[freqIndex(FREQ1)];
      bits.push(mag1 > mag0 ? 1 : 0);
    };

    signal.addEventListener('abort', abortHandler);
    waitForStart();
  });
}
