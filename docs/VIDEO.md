# Helpa: the 3-minute video

**Format:** 1920x1080. Most of it is a split screen: **you on the left** (talking to camera, or your hands on the real machine), **the live app on the right** in a phone frame. The three "how it works" moments are full-screen animated diagrams. Every app shot is the real app at https://helpa.pyras.org/app making real Meta calls with photos of your own machines (`media/photos/`).

**The one thing judges should remember:** Helpa reads *your exact machine*, shows you the move on a 3D twin of it, checks your work, and when it's beyond you, gets the right pro or part at a fair price.

**Rubric map:** Impact (the hook and the close: anyone, any home, no skills), Meta tooling (each model is named on screen when it does something visible), Technical depth (parallel agents, brand-aware 3D twin, a diagnosis that branches), Demo (all live, your machines).

## Timeline

`L` is the left panel, `R` is the right panel. Clip names are files in `media/clips/`.

| Time | Left | Right / full screen | What you say |
|---|---|---|---|
| 0:00–0:07 | **You** at the dryer, pull out a damp towel | full: your dryer walkaround (`IMG_6365`) | "My dryer ran a full hour and my clothes came out soaking wet. I have never opened a dryer in my life." |
| 0:07–0:14 | **You** to camera | | "A repair visit is a hundred and fifty bucks before they touch anything. A chatbot gives you twelve paragraphs. So I built Helpa." |
| 0:14–0:18 | full: `diagram-title` | | (no line, let it breathe) |
| 0:18–0:34 | **B-roll:** you photograph the dryer sticker with the phone | R: `10-capture` (sped up through the wait) | "I snap the sticker and say what's wrong. Muse Spark reads it: Frigidaire FFRE4120SW2. And it asks me one question that actually changes the fix: is it getting warm inside?" |
| 0:34–0:46 | full: `diagram-pipeline` | | "Then five Meta models go at once. Muse Wonder searches the web for my manual and the cause. Spark builds a 3D twin. SAM 3.1 finds the parts on my photo. Muse Image draws the fix right on it." |
| 0:46–1:02 | **You** to camera | R: `11-plan-scroll` then `12-steps` | "One line on why. Then every step plays on a 3D model of my exact dryer. On a Frigidaire the lint screen is in the door, not on top like a Whirlpool, so that's where it shows me." |
| 1:02–1:12 | **B-roll:** you at the open dryer, phone in hand | R: `13-ask` | "Not sure which way it comes out? I just ask. It knows my dryer and this exact step." |
| 1:12–1:24 | **B-roll:** you pull the lint screen and snap it | R: `14-check` | "Then I snap what I did. And it's honest: pull it out and hold it up to the light, so I can see it's clean." |
| 1:24–1:36 | full: `diagram-loop` | | "Still damp? It rules out the lint screen and goes after the next cause. And when the fix is behind 240 volts, it stops me. This one's for a pro." |
| 1:36–2:02 | **You** to camera | R: `17-pro`, `18-findpros`, `19-contact`, `20-accept`, `21-prosaid` | "It finds the best-reviewed shops near me and what this should cost, with sources. It writes the message: my model, what's wrong, what I already tried. With my permission it reaches out, checks the quote against the fair price, and books it. After the visit I just tell it what the tech said, and the job updates." |
| 2:02–2:20 | **B-roll:** you snap the washer, microwave and stove | R: `30-washer-capture`, `30-microwave-capture`, `30-range-capture` (fast) | "And it's not a dryer app. My washer, my microwave, my stove. It reads each one. The microwave, it won't let me open: there's a high-voltage capacitor in there." |
| 2:20–2:34 | **You** to camera | R: `40-car`, `41-part` | "Needs a part? It finds the exact one for my model at real stores, tracks it, and when it shows up, walks me through putting it in. Works on my car too." |
| 2:34–2:44 | full: `diagram-agents` | | "These are agents doing the boring parts of owning a home, and My Home remembers every machine I own." |
| 2:44–2:52 | **You** to camera | | "Everything you saw, I built during this hackathon. It's live right now." |
| 2:52–3:00 | full: `diagram-end` | | "Helpa. Fix what's broken, even if you know nothing. Try it at helpa dot pyras dot org." |

## What you record

Shoot everything **landscape, 1080p or 4K, 30 or 60 fps**, on the iPhone back camera. Put the phone on something steady for the talking parts. In every talking shot, **stand in the left half of the frame**: the right half gets covered by the app.

### A. Talking to camera (about 6 takes)

Same spot each time, the dryer behind you if it fits. Say each line 2 or 3 times; I'll pick the best and cut the silences.

1. "My dryer ran a full hour and my clothes came out soaking wet. I have never opened a dryer in my life." (holding the damp towel)
2. "A repair visit is a hundred and fifty bucks before they touch anything. A chatbot gives you twelve paragraphs. So I built Helpa."
3. "One line on why. Then every step plays on a 3D model of my exact dryer. On a Frigidaire the lint screen is in the door, not on top like a Whirlpool, so that's where it shows me."
4. "It finds the best-reviewed shops near me and what this should cost, with sources. It writes the message: my model, what's wrong, what I already tried. With my permission it reaches out, checks the quote against the fair price, and books it. After the visit I just tell it what the tech said, and the job updates."
5. "Needs a part? It finds the exact one for my model at real stores, tracks it, and when it shows up, walks me through putting it in. Works on my car too."
6. "Everything you saw, I built during this hackathon. It's live right now."

### B. Voiceover (one take, quiet room)

The lines for the full-screen diagrams and the B-roll, read straight through. Phone close to your mouth.

- "I snap the sticker and say what's wrong. Muse Spark reads it: Frigidaire FFRE4120SW2. And it asks me one question that actually changes the fix: is it getting warm inside?"
- "Then five Meta models go at once. Muse Wonder searches the web for my manual and the cause. Spark builds a 3D twin. SAM 3.1 finds the parts on my photo. Muse Image draws the fix right on it."
- "Not sure which way it comes out? I just ask. It knows my dryer and this exact step."
- "Then I snap what I did. And it's honest: pull it out and hold it up to the light, so I can see it's clean."
- "Still damp? It rules out the lint screen and goes after the next cause. And when the fix is behind 240 volts, it stops me. This one's for a pro."
- "And it's not a dryer app. My washer, my microwave, my stove. It reads each one. The microwave, it won't let me open: there's a high-voltage capacitor in there."
- "These are agents doing the boring parts of owning a home, and My Home remembers every machine I own."
- "Helpa. Fix what's broken, even if you know nothing. Try it at helpa dot pyras dot org."

### C. B-roll with the phone in your hand (a second phone or a friend films)

Film over your shoulder so the real machine and the phone are both in frame. Helpa open on the phone, on the camera screen.

1. Point the phone at the dryer sticker and tap the shutter.
2. Open the dryer door, phone in hand, look at it like you're reading a step.
3. Pull the lint screen straight up out of the door opening, peel the lint off, hold it up to the light, snap it with the phone.
4. Snap the washer, then the microwave sticker, then the stove. About 2 seconds each.
5. (Optional) A damp towel coming out of the dryer, close up.

Send me the files (drop them in `~/Downloads`) and I'll cut them in.

## The 30-second X cut

| Time | Shot | Caption |
|---|---|---|
| 0:00–0:03 | Damp towel out of the dryer | "My dryer stopped drying." |
| 0:03–0:08 | `10-capture`: snap the sticker, "Frigidaire FFRE4120SW2" | "So my app read the sticker…" |
| 0:08–0:13 | `12-steps`: lint screen slides up out of the door in 3D | "…and showed me the fix on a 3D twin of MY dryer." |
| 0:13–0:17 | `14-check` | "Then checked my work." |
| 0:17–0:24 | `18-findpros` + `20-accept` | "Too hard? It finds a pro at a fair price." |
| 0:24–0:27 | `30-microwave-capture` safety stop | "And knows when to stop." |
| 0:27–0:30 | `diagram-end` | "Helpa. Built on Meta's Muse + SAM 3.1." |

Post copy and the reply thread are in `docs/X_POST.md`.

## How the edit is built

`media/rec.py` drives the live app and records clips at phone resolution. `media/diagrams/` holds the animated diagrams (`render.py` records them). `media/edit.py` assembles the timeline above into `media/out/helpa-demo.mp4`; until your footage arrives, the left panel shows a placeholder card with the line to say, so the timing can be checked.
