# Helpa handoff

**Project path:** `~/Projects/helpa` (GitHub: `git@github.com:joeykokinda/helpa.git`, branch `main`, public)
**Live:** https://brach.taild3399f.ts.net (Tailscale Funnel on brach, public)
**Deadline:** Wed Nov 4, 9:00 PM ET. Submit on the CV platform: public repo, 3-minute video, live link, X post link.
**Rubric:** Impact 30%, Meta tooling 25%, Technical depth 20%, Demo 25%. Bonuses: open weights $10K, agentic $5K, creative $5K, viral on X $20K, community vote $10K.

## The pitch

Helpa understands how your machine works and guides your hands through fixing it.

Snap the model sticker or describe the problem → Helpa identifies the exact machine (Whirlpool WED5050LW, 2015 Camry 2.5L) → a 3D model with real joints shows each move → "Show me on my camera" plays the move as a cyan hologram on your real machine → "Your turn": Helpa watches you do it and says done / not done / can't tell → a test run confirms the fix → "Still broken" moves to the next likely cause → the machine is saved in My Home.

## Where we are (all merged on `main`, deployed)

| Area | State |
|---|---|
| Pipeline | Go backend, parallel tracks (identify, research, 3D model, parts, choreograph). Library fixes in about 3 s, researched fixes about 20 s. |
| 3D models | 8 hand-built rigs (dryer, dishwasher, front and top-load washer, range, OTR microwave, disposal, Camry oil change) in a toon style, plus on-demand models Muse builds from a blueprint (13 to 22 s). |
| Exact models | 2015 Toyota Camry 2.5L (0W-20, 4.6 qt, 14 mm plug, cartridge filter 04152-YZZA1); Whirlpool WTW5057LW washer and WED5050LW dryer. |
| Effects | Oil stream into the pan, filter drips, pour into the fill, dryer airflow x-ray, dishwasher drain, lint peel. Defined in catalog JSON, shared by 3D and AR. |
| Live Guide AR | Hologram ghost of the real part (SAM 3.1 lock, gyro and patch tracking, confidence fade), target-lock brackets, tap to anchor when SAM can't find the part, your-turn check (COMPLETED / INCOMPLETE / UNCERTAIN), Model # mode that reads stickers through an internal crop. |
| Diagnosis | Library skips fixes that contradict the complaint; cause chains with Fixed it / Still broken; safety stop screen (no animation) for gas, refrigerant, microwave HV, airbags, live wiring. |
| My Home | Machine cards with status, machine page (3D model, identity, history, care reminders), Ask Helpa follow-up chat, IndexedDB on the phone, no login. |
| Try a sample | 5 sample problems (Muse Image photos) replayed from recorded real runs; free. |
| Safety and cost | Per-IP rate limits, 16 MB upload cap, $15/day Meta budget (`HELPA_DAILY_BUDGET_USD`), then "Helpa is resting" plus a sample. |
| Proof | `docs/EVAL.md`: 50 cases, 49/50 right appliance, 8/8 dangerous cases to a pro, 0 dangerous instructions, 125/149 key steps, 3D on every non-stop case. vs a plain chatbot: same content, 3x less reading (214 vs 598 words), first action on line 2 vs 6. |
| Docs | `README.md` for judges, `docs/VIDEO.md` (shot list, voiceover, 30 s X cut), `docs/X_POST.md`. |
| Round 4 (branch `round-4`, Oct 28) | New look (ink and paper, one signal orange `#ff5b2e`, Schibsted Grotesk, Helpa's own two-tone icon set, caution-tape safety card). Home is the first screen for everyone: Show me / Tell me / **pick it** (a tile per thing, 16 things, 90 fixes; a picked fix runs with no model calls via `fix=entry/problem`). 8 new hand-made recipe models + fixes: sink, toilet, fridge, smoke alarm, outlet and breaker, furnace and thermostat, shower head, door (`tools/build_home_fixes.py` writes models, library entries and beats). AR restyled: frosted-glass hologram, orange motion paths, white label pills, full-bleed camera on phones, twists spin flat, labels dodge a rising ghost; live guide no longer crashes on recipe models. Hands-free voice (next, back, repeat, show me, check). Circle the problem on your photo. Muse Image draws the fix on your photo (`/api/illustrate`, plan card + share card). Muse Spark Open check (`BASETEN_API_KEY`, falls back to Spark). |

## Run and deploy

- **Deploy to brach:** `./scripts/deploy-brach.sh` builds the Go backend and a standalone Next server, ships both, and restarts the user services `helpa` (127.0.0.1:8095) and `helpa-web` (127.0.0.1:3095). Funnel already points at 3095.
- **Local, free:** `cd backend && HELPA_REPLAY=fixtures go run .` then `cd app && npm run dev`.
- **Meta key:** `~/.config/pointfix/env` (laptop) and `~/.config/helpa/env` (brach). Never print or commit it. Rotate after the hackathon (it was pasted in chat).
- **Checks:** `cd backend && go test ./...`, `cd app && npx tsc --noEmit && npx eslint app`.
- **Gotchas:**
  - `next dev` rewrites `app/tsconfig.json`; revert it before committing.
  - Turbopack refuses a symlinked `node_modules` in worktrees; hard-link copy instead.
  - After changing catalogs run `tools/sync_rigs.sh`.
  - After changing the library or rigs, re-record samples with `tools/record_samples.py` and rebuild the backend (samples are embedded).
  - Kill servers by port (`kill $(lsof -t -iTCP:3000 -sTCP:LISTEN)`), never `pkill -f` (it kills its own shell).
  - The old trycloudflare laptop link is dead; brach is the only live link now.

| Jobs (Oct 29) | Every plan is a job (server, per anonymous device id, `HELPA_DATA` folder, default `./data`). Part finder and pro finder are Muse Wonder + `web_search` agents with strict submit schemas (no invented links or phones). The watcher (`watcher.go`) runs every 10 min, has Muse Spark check tracking, and sends Web Push (RFC 8291/8292 on the standard library; VAPID key saved in the data folder; set `HELPA_PUSH_CONTACT=mailto:you@...`). Replay mode: finders return labelled samples from `fixtures/parts.json` and `fixtures/pros.json`, and a delivery plays through in 90 s. Calling a pro is one tap (tel:/sms: with the summary), not an AI phone call. |

| Landing (Oct 29) | `/` is now the landing page (`app/app/page.tsx`, `landing.css`, assets in `public/landing/` taken from the real app with headless Chromium and a fake camera); the app moved to `/app` (manifest `start_url`, service worker and push links updated). QR codes point at `<origin>/app`. Plan screen draws every step as a picture from the 3D model (`Storyboard.tsx`). Tracking number `DEMO` plays a delivery through in 90 s on the live server too, so judges can see the part loop; the watcher now runs every 15 s (model calls are still gated to every few hours per part). |

## What's next, in order

1. **Merge `round-4` into `main` and deploy** (`./scripts/deploy-brach.sh`). Nothing in round 4 has run against the live Meta API yet.
2. **Live-test the new Meta paths with the real key** (allow `api.meta.ai` in the environment network settings and add `META_API_KEY`): the part finder and pro finder on a real job, the tracking check on a real tracking number, a push to a real phone (add to home screen first on iPhone), plus `/api/illustrate` (Muse Image via the Responses API, `input_image` reference, reads the `image_generation_call` result) and, with Baseten credits, `BASETEN_API_KEY=... ` for Muse Spark Open checks (`HELPA_OPEN_WEIGHTS_URL` / `HELPA_OPEN_WEIGHTS_MODEL` override the endpoint and model). Both fail soft.
3. **Real-phone test of Live Guide** (still the biggest unknown): the new full-bleed camera, frosted hologram on a white dryer, hands-free on iPhone Safari (`webkitSpeechRecognition`) and Android Chrome.
4. **Video and X post:** show pick-it (toilet keeps running in one tap), circle-it, the Muse Image drawing, hands-free "next" with wet hands, and the AR lint screen. Update `docs/VIDEO.md` shot list.
5. **Spanish is parked.** 2,000 library strings were translated but not wired in; restart from scratch if wanted.
6. Polish: retake README screenshots (new look), real AR clips, the smoke alarm overview camera looks at the ceiling from above (steps are fine).
7. Unverified car facts: filter element 04152-YZZA1 vs YZZA6; 4.6 vs 4.8 qt.

## Decisions to keep

- Host on brach, never Railway. Light mode default, holograms only inside the AR camera view. No automatic flashlight. The user's camera zoom is theirs; Helpa crops internally. Savings only when honest (none when a step says call a pro). No x402. Don't name a competitor chatbot in the video. Keep the house mascot, talking less.

See `TODO.md` for the full checklist.
