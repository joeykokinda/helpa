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

## What's next, in order

1. **Real-phone test of Live Guide** (biggest unknown). Seeker over USB (`adb reverse`) and iPhone Safari: lock times, hologram anchoring while moving, gyro direction, fps, the iOS motion permission prompt.
2. **Round 4 (not started; both agents were cut off before saving anything):**
   - `creative`: "draw the issue" (Muse Image or a hand-drawn canvas annotation on your own photo; doubles as the X share image) and video with audio (8 s clip, transcribe plus sound features).
   - `spanish`: Spanish UI, steps and voice (pre-translated library), plus an accessibility pass (labels, 44px targets, contrast, reduced motion, aria-live).
   - The empty branches and worktrees `creative` and `spanish` exist at `05aa483`; start them fresh.
3. **Open-weights bonus ($10K):** Glimmer or Spark Open for check-my-work on Baseten or Modal. Needs rex to confirm credits.
4. **Polish:** retake the README My Home screenshot (shows the old WED6150PW); real AR clips for the README (`docs/media/live-lint.mp4`, `live-oil.mp4`, `sticker.mp4`); dishwasher x-ray water reads as a flat panel; the 3D car body is still a generic sedan.
5. **Unverified facts to check on the real car:** filter element 04152-YZZA1 vs YZZA6; 4.6 vs 4.8 qt.
6. **Film and ship (rex):** follow `docs/VIDEO.md` on the real dryer and the Camry, run a blind test with someone who hasn't seen the app, post on X (`docs/X_POST.md`), submit the repo, video, live link and X link.

## Decisions to keep

- Host on brach, never Railway. Light mode default, holograms only inside the AR camera view. No automatic flashlight. The user's camera zoom is theirs; Helpa crops internally. Savings only when honest (none when a step says call a pro). No x402. Don't name a competitor chatbot in the video. Keep the house mascot, talking less.

See `TODO.md` for the full checklist.
