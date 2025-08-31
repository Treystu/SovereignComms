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

## Whisper WASM models
Whisper model binaries are not bundled in this repo.
Download the desired `.bin` files (for example, `ggml-base.en.bin`) from the
[whisper.cpp releases](https://huggingface.co/ggerganov/whisper.cpp/tree/main)
or another trusted source.

Host the models yourself under a `/models` directory so they can be fetched at
runtime, e.g. `https://your.domain/models/ggml-base.en.bin`. The app expects
the models to live at `/models/*` in production.

Model files are sizable: the tiny model is ~35 MB, the base model is ~75 MB
and larger models can exceed 300 MB. Ensure your hosting platform supports
serving large static files and consider a CDN or object storage if needed.

## Netlify
Uses `netlify.toml` to run `npm run build` and publish `dist`.
