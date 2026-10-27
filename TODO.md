# Helpa: road to a winner

Deadline: **Wed Nov 4, 9:00 PM ET** (submit on the CV platform: public repo, 3-minute video, live link, X post link).

Rubric: Impact 30% · Meta tooling 25% · Technical depth 20% · Demo 25%. Bonus targets: Best Agentic ($5K), Open Weights ($10K), Creative ($5K), Viral on X ($20K), Community Vote ($10K).

Legend: 🤖 agent running · 🛠 Claude · 🙋 rex

## Thesis and pitch
Spatially grounded guidance beats conversational AI. **Helpa understands how your machine works and guides your hands through fixing it:** exact model → interactive 3D twin → reasons about what's wrong → shows the move on the twin and on your live camera → catches your mistakes → confirms the fix actually worked.
- [ ] 🙋 Submit under **Push the Frontier** (physical-world understanding through human hands); the consumer app is the demonstration.
- Know the competition: iFixit FixBot (camera ID, voice, repair library). Our edge is the 3D motion on your exact machine, live part highlighting, and verification.

## Trust and reasoning (the 10/10 layer)
- [ ] 🛠 **Verified vs illustrative**: motions backed by the manual or a hand-built rig are stated with confidence; generated-model motions without documentation are labeled ("check your manual for the release direction") and never stated as fact. Badge in the UI.
- [ ] 🛠 **Diagnosis that branches**: hypotheses, then a test, then what you observe, then the next branch ("hums or silent?"). Animate each hypothesis in a **3D cutaway that explains why** the fix works.
- [ ] 🛠 **Outcome check, not just step check**: every plan ends with a test run ("run Rinse Only, does the water go down?"); a failure branches to the next hypothesis.
- [ ] 🛠 **Mistake catching as the hero moment**: wrong part, wrong orientation, wrong order → a specific correction while you work.
- [ ] 🛠 **My Home**: save each machine (model, manual, parts, fix history, maintenance reminders); next time Helpa already knows it.
- [ ] 🛠 Adapt to the person: first-timer vs experienced, Spanish, hands busy → voice.

## In progress
- [ ] 🤖 Isometric toon look: outlines, cel shading, grid floor, ortho camera, dashed motion paths, overshoot easing, clean-up sparkles. Applies to every model.
- [ ] 🤖 On-demand models: recipe format + renderer, per-category blueprints, reference recipes, `generateModel` (Muse builds a model from photo + identity).
- [ ] 🤖 Parallel pipeline: fast identify, then model / research / measure in parallel, then choreograph. Helpa asks clarifying questions with tap answers. No-visual fallback.
- [ ] 🤖 New hand-built models: garbage disposal (hex-key jam, reset button) and car oil change (drain plug, filter, dipstick, fill cap).

## Your exact model, not a generic one (the core pitch)
- [ ] 🙋 Photos of the model stickers on your washer, dryer, dishwasher; your car's year / make / model / engine (or VIN).
- [ ] 🛠 Read the identity from the sticker or VIN, then research that model's manual and **exploded parts diagram** (real part positions, sizes, part numbers).
- [ ] 🛠 Adjustable settings on hand-built models (hinge side, lint screen location, console layout, filter location, finish/colors), filled from research and matched against the user's photo by Muse.
- [ ] 🛠 Verify rex's actual car, washer, dryer, dishwasher by hand against the real units for the demo.
- [ ] 🛠 Show the model number on screen ("Whirlpool WED5010LW") so the viewer sees it's *their* machine.

## Live Guide: the end game (real-time, visual, not just voice or text)
- [ ] 🛠 **Guided capture**: Helpa knows where the model sticker or VIN lives for each category and shows it. The mini 3D model highlights the spot ("open the door, it's on the rim"), the live camera looks for it, SAM 3.1 finds the label, and Spark reads the model number. Typing it in is the fallback.
- [ ] 🛠 **Live step mode**: the camera stays on while you work; frames stream about once a second. SAM 3.1 tracks the part on live video and draws the glow plus an arrow right on the feed (AR overlay); the 3D model plays in a corner; Helpa speaks the next move.
- [ ] 🛠 **Auto-check**: Helpa watches you do the step and notices when it's done ("got it, the screen's out"), then advances with no button needed. It warns you when you grab the wrong part.
- [ ] 🛠 Anchored AR on Android (WebXR hit-test and anchors) so arrows stick to the real machine as you move.
- [ ] 🛠 **Ray-Ban Meta glasses** (Wearables Device Access Toolkit → phone): POV video into the same live loop, Helpa's voice in your ear, hands free. Android wrapper app. A stretch goal, but a huge video moment.

## Wow moments for Meta tooling
- [ ] 🛠 SAM 3.1 **live video tracking**: point the camera, the part glows and follows as you move ("where is it?").
- [ ] 🛠 Muse builds a 3D model of your appliance from one photo (on-demand recipes) — show it assembling.
- [ ] 🛠 Show the self-check: Muse watching its own 3D animation and fixing it (review loop).
- [ ] 🛠 **Glimmer / Spark Open** runs "check my work" on Baseten or Modal (open-weight bonus). 🙋 confirm Baseten/Modal credits.
- [ ] 🛠 **Muse Image "draw the issue"**: your own photo with the problem drawn on it (creative bonus).
- [ ] 🛠 Video upload with audio (record a clip, Helpa hears the noise and sees the machine).
- [ ] 🛠 Realtime voice conversation (Voice Transcribe streaming) for hands-free.

## Holds up live
- [ ] 🛠 Permanent public URL (brach + Tailscale Funnel or Vercel); retire the laptop tunnel. 🙋 run the Funnel command.
- [ ] 🛠 **"Try a sample" mode** with preloaded photos (gritty dishwasher, humming disposal, wet clothes dryer, car) so judges get the full experience in 30 seconds without a broken appliance.
- [ ] 🛠 Loading and error states that never show a blank screen; graceful no-visual fallback.
- [ ] 🛠 Performance pass on a mid-range Android (Seeker): 30+ fps in 3D, fast first paint.

## Proof it works
- [ ] 🙋🛠 **Blind test**: someone outside the team, an unprepared fault, recorded start to finish.
- [ ] 🙋🛠 **Helpa vs a regular chatbot** with the same manual: completion rate, time to fix, confidence. That number goes in the video.
- [ ] 🛠 Evaluation set: 50 real repair problems through the pipeline, scored on exact model ID, procedure correctness, part localization, step-check precision (no false "done"), real repair success, time to first actionable step, and how often a person had to step in. Include hard cases and unsafe ones. Publish the numbers in README and video.
- [ ] 🙋 3–5 real people try it (mom, roommates): capture quotes and real fixes.
- [ ] 🛠 Spanish (voice + steps) for families and grandparents.
- [ ] 🛠 Safety: gas, mains wiring, refrigerant → "call a pro" every time; covered in the evaluation set.

## UI polish
- [ ] 🛠 Full polish pass on every screen after the new 3D style lands (tutorial, camera, working, plan, step, check, done).
- [ ] 🛠 Agent fan-out visible on the working screen (parallel tracks ticking off).
- [ ] 🛠 Check-my-work and done screens: celebration moments.
- [ ] 🛠 App icon, splash, PWA install prompt, share card for X.

## Video (3 minutes) and launch
- [ ] 🛠 **90-second hero demo** (one fix, done deep): standing water → sticker read and one question → 3D cutaway of the clog and why → camera highlights the real filter, the twin shows the twist → **you grab the wrong part and Helpa catches it** → clean, reinstall, watched → **test run drains** → saved to My Home. Then the car (exact model), the blind test, the chatbot comparison.
- [ ] 🛠 Shot list + script: broken things (wet shirt from the dryer, car) → a regular chatbot's wall of text, confusion → Helpa: sticker snap, "I know this one!", 3D of *your* machine, do the fix for real, check, confetti → car with your exact engine → wildcard on-demand model → behind the scenes (parallel agents, self-check) → Meta models on screen + "built during the hackathon".
- [ ] 🙋 Film with real appliances and real people.
- [ ] 🛠 Edit plan, captions, on-screen labels for each Meta model.
- [ ] 🛠 README: what was built during the hackathon, architecture, Meta models used, evaluation results, how to run.
- [ ] 🙋 Post on X (30-second cut) and submit the post link; community vote push.
- [ ] 🙋 Submit on the CV platform: repo, video, live link, team list.
- [ ] 🙋 Rotate the Meta API key after the hackathon (it was pasted in chat).

## Parked (only if time allows)
- Device Connect: read live error codes from smart appliances (local network, Bluetooth, vendor cloud, reverse-engineered protocols written by Muse Code).
- More hand-built models: toilet, sink P-trap and faucet, fridge, range hood, water heater, HVAC filter.
