declare module 'jsqr' {
  interface QRCode {
    data: string;
    location?: unknown;
  }

  interface QRConfig {
    inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth';
  }

  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: QRConfig
  ): QRCode | null;
}
