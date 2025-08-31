declare module 'jsqr' {
  interface Point { x: number; y: number }
  interface QRCode {
    data: string;
    location: {
      topLeftCorner: Point;
      topRightCorner: Point;
      bottomLeftCorner: Point;
      bottomRightCorner: Point;
    };
  }
  export default function jsQR(
    data: Uint8ClampedArray | number[],
    width: number,
    height: number,
    options?: { inversionAttempts?: string }
  ): QRCode | null;
}
