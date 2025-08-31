# Sovereign Voice Mesh — v0 (Flattened)

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

## Architecture

- `RtcSession.ts` – handles WebRTC data channel setup and messaging between peers.
- `Mesh.ts` – provides an in-memory relay that forwards and deduplicates messages with TTL control.
- `VoicePanel.tsx` – React component for managing local speech-to-text sessions and displaying transcripts.
- `sw.js` – service worker implementing a network-first cache to keep the app functional offline.

## Netlify
Uses `netlify.toml` to run `npm run build` and publish `dist`.
