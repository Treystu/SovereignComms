# Sovereign Voice Mesh — v0.0.19 (Flattened)

All files are in the repo root for phone-friendly GitHub upload. Netlify-ready.

## Dev

```bash
npm i
npm run dev
```

## Build

```bash
npm run build
```

## Configuration

- STUN/TURN servers can be set from the in-app **Diagnostics** page. The URLs
  are saved to local storage and used when establishing new WebRTC sessions.
- The WebSocket fallback server is configured via the `VITE_WS_URL`
  environment variable.

## Versioning

Every pull request must bump the `version` field in `package.json`. CI runs
`check-version-bump.mjs` to ensure the version changed compared to the previous
commit.

## Architecture

- `RtcSession.ts` – handles WebRTC data channel setup and messaging between peers.
- `Mesh.ts` – provides an in-memory relay that forwards and deduplicates messages with TTL control.
- `WebSocketSession.ts` – fallback transport with heartbeat and reconnection when WebRTC fails.
- `envelope.ts` – cryptographic utilities for ECDH/AES-GCM and ECDSA signatures.
- `Diagnostics.tsx` – displays network information and service-worker status.
- `VoicePanel.tsx` – React component for managing local speech-to-text sessions and displaying transcripts.
- `sw.js` – service worker implementing a network-first cache to keep the app functional offline.
- `AudioPairing.tsx` – alternative peer handshake using audible tones when a camera isn't available.

## Security

- React escapes message content when rendering to prevent cross-site scripting (XSS). Messages are stored and transmitted as raw text.

## Whisper WASM models

Whisper model binaries are not bundled in this repo. Download the desired `.bin` files (for example, `ggml-base.en.bin`) from the [whisper.cpp releases](https://huggingface.co/ggerganov/whisper.cpp/tree/main) or another trusted source.

Host the models yourself under a `/models` directory so they can be fetched at runtime, e.g. `https://your.domain/models/ggml-base.en.bin`. The app expects the models to live at `/models/*` in production.

Model files are sizable: the tiny model is ~35 MB, the base model is ~75 MB and larger models can exceed 300 MB. Ensure your hosting platform supports large file downloads.

## Netlify

Uses `netlify.toml` to run `npm run build` and publish `dist`.
