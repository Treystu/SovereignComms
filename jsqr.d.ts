declare module 'jsqr' {
  export interface QRCode {
    data: string;
    binaryData: Uint8ClampedArray;
  }
  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: { inversionAttempts?: 'original' | 'invert' | 'attemptBoth' }
  ): QRCode | null;
}
