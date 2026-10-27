# Helpa

A friendly little house that helps you fix things at home. Snap a photo of a broken appliance (or just describe it), and Helpa finds the exact manual, works out the fix, and walks you through it step by step on an animated 3D model of your appliance, reading each step out loud and checking your work from a photo.

Built for the Meta Global AI Developer Hackathon (Oct 27 – Nov 4, 2026). All code in this repository was written during the hackathon.

## How it works

- **Muse Wonder** runs the repair agent: identifies the appliance, searches for the official manual, plans beginner-friendly steps.
- **SAM 3.1** highlights the exact parts on your own photos.
- **Muse Spark** maps each step onto the 3D model's real parts and judges "check my work" photos.
- **Muse Voice Transcribe** lets you describe the problem out loud.
- Built-in 3D appliance models with real joints (dryer, dishwasher, washers, range, microwave, and more), plus on-demand models for anything else.

## Layout

- `app/` — Next.js PWA (the phone app, 3D step player, Helpa character)
- `backend/` — Go API: agent loop, appliance library, choreographer, replay mode
- `tools/` — library review and catalog sync scripts
- `spike/` — early experiments and end-to-end tests

## Run it

```sh
# backend (needs a Meta Model API key; or HELPA_REPLAY=fixtures for a free offline replay)
cd backend && META_API_KEY=... go run .

# app
cd app && pnpm install && pnpm dev
```
