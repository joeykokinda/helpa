# Submission: Meta Global AI Developer Hackathon

Due **Wed Nov 4, 9:00 PM ET** on the Cerebral Valley platform. Late = not considered. Everything below is ready to
paste. Pick the field that matches what the form asks; trim to its character limit if it has one.

---

## Project name

Helpa

## Tagline (one line)

Point your phone at a broken machine. Helpa shows your hands the fix on a 3D model of your exact one.

Shorter, if the box is tiny: **Fix what's broken, with a 3D twin of your exact machine.**

## Track

Indie Developer (solo)

## Problem statement

**Push the Frontier.** Helpa gives a phone a physical-world capability: understanding how a specific machine is put
together and guiding a person's hands through changing it, then checking the result.

(If the form only fits one sentence or rex prefers it: **Build for Your World** also fits. It's a problem every
renter and homeowner has firsthand.)

## Short description (about 50 words)

Helpa fixes the things in your home. Snap the sticker, say what's wrong, or pick it from a list. Muse Spark reads your
exact model, Muse Wonder researches its manual, and every step plays on a 3D twin of your machine. Snap a photo and it
checks your work. Beyond DIY? Agents find the part or a fair-priced pro.

## Long description

My dryer stopped drying. A repair visit is $150 just to show up, and a chatbot gave me twelve paragraphs I had to
translate into "which part, which way, how hard." Most home repairs are a five-minute job once you can see what to do.
The hard part is seeing it.

Helpa is a phone app (no install, no account) that understands how your machine works and guides your hands through
fixing it.

1. **Show it, tell it, or pick it.** Photo of the machine or its sticker, your voice, or one tap from 16 things and
   75 ready fixes.
2. **Your exact machine.** Muse Spark reads the brand and model off the sticker ("Whirlpool WED5050LW", "2015 Toyota
   Camry 2.5L") and asks a tap-to-answer question when the fix depends on it.
3. **Five agents at once.** Muse Wonder searches the web for the manual and the likely cause. Spark picks or builds a
   3D model with real joints. SAM 3.1 finds the parts on your photo. Muse Image redraws your photo with the fix drawn
   on. They stream to the phone as they land.
4. **The fix in 3D.** Every step plays on the twin: the lint screen slides out, the filter twists then lifts, oil
   streams into the pan. Big buttons, every step read aloud, say "next" with wet hands.
5. **Checks your work.** Snap what you did. Helpa answers done, not done (with a specific correction), or "can't
   tell, try another angle." The animation finishing never counts as you finishing.
6. **Branches when it's still broken.** Every plan ends with a test. Still broken? It rules out that cause by name
   and goes after the next one.
7. **Agents finish the job.** Needs a part? Muse Wonder finds the exact part number for your model with buy links,
   then a background agent watches the tracking and pushes you when it arrives, with the install guide ready. Needs a
   pro? It finds the best-reviewed local shops, what the job should cost, and writes the message with your model,
   the likely cause and what you already ruled out.
8. **Safe by default.** Gas, mains wiring, refrigerant, airbags: it stops and sends you to a pro, every time.
9. **My Home.** Every machine you fix is saved with its model, history and care reminders, and you can ask follow-up
   questions about it.

Tested on 50 real repair problems: right appliance 49/50, all 8 dangerous cases sent to a pro with zero dangerous
instructions, 83% of expected key steps covered, a 3D model in every case. Against a plain chatbot: the same steps
with 3x less to read, and the first physical action on line 2 instead of line 6.

## How it works (technical)

- **Phone PWA** (Next.js, React, react-three-fiber) talks to a **Go agent backend** over server-sent events.
- **Parallel pipeline:** a fast Muse Spark identify, then research (Muse Wonder + hosted web search), the 3D model,
  and part finding (SAM 3.1) run at the same time; Spark then choreographs the plan's steps onto the model's joints.
  Library fixes land in about 4 s, researched ones in about 20 s.
- **One animation language:** 8 hand-built rigs and 8 recipe models, each a catalog of parts, joints, actions and
  effects. For anything else, Spark writes a declarative 3D recipe (17 shapes, 31 materials, joints) from a
  per-category blueprint, validated and repaired before it renders.
- **Muse checked its own work:** a review loop had Muse render and watch its own 3D animations and fix the wrong ones.
- **Jobs that keep running:** part finder and pro finder are Muse Wonder agents with strict submit schemas (no
  invented links or phone numbers). A watcher has Muse Spark check tracking and sends Web Push, implemented on the Go
  standard library (RFC 8291/8292).
- **Holds up live:** per-visitor rate limits, a daily Meta spend cap that falls back to recorded real runs instead of
  failing, a free offline replay mode, and a 50-case eval harness (`tools/eval/`).

## Meta models used, and exactly how

| Model | How Helpa uses it |
|---|---|
| **Muse Spark** (`muse-spark-1.3`) | Identifies the machine and reads model stickers and VINs; asks the clarifying question; maps plan steps onto 3D joints; writes on-demand 3D recipes; judges "check what I did" photos (COMPLETED / INCOMPLETE / UNCERTAIN); powers Ask Helpa; checks parcel tracking for the part watcher |
| **Muse Wonder** (`muse-wonder-1.0`) | The research agent: finds the manual, diagnoses, writes beginner steps, calls tools (web search, segment parts, submit plan). Also the part finder, pro finder and fair-price agents. It researched the appliance library and reviewed its own 3D animations |
| **SAM 3.1** | Finds and highlights each step's part on your own photo; finds the model sticker so Spark reads a tight crop |
| **Muse Image** (`muse-image-1.0`) | Redraws your own photo as a repair diagram (part circled, move drawn on) for the plan and the share card; generated the sample photos |
| **Muse Voice Transcribe** | Describe the problem, ask Helpa, or tell it what the pro said, out loud |
| **Muse Spark Open** (`muse-spark-open-1026`, Baseten) | Wired in to run "check what I did" on the open-weight model first, with Muse Spark as fallback. **Only claim this if the Baseten key is live on the server (see the checklist)** |

## What was built during the hackathon

Everything. Kickoff was Mon Oct 26, 12:00 PM ET; the first commit is Oct 26, 4:13 PM ET, and all 171 commits come
after it. No earlier codebase, template or product. The README has a day-by-day table
(https://github.com/joeykokinda/helpa#what-was-built-during-the-hackathon). Outside code is limited to open-source
libraries (Next.js, React, three.js, react-three-fiber, Go standard library) and the Schibsted Grotesk font (OFL).
The sample photos were generated with Muse Image during the event.

Paste this if there's a "new work" box:

> Built from scratch during the event, solo. First commit Oct 26 4:13 PM ET, after the noon kickoff; the full history
> is public. Every feature in the video (sticker reading, 3D twins, photo checks, branching diagnosis, part and pro
> agents, My Home) was written between Oct 26 and Nov 4.

## Tech stack

Go (standard library HTTP, SSE, Web Push), Next.js 16, React 19, three.js / react-three-fiber, TypeScript, IndexedDB,
PWA. Meta Model API (Muse Spark, Muse Wonder, SAM 3.1, Muse Image, Muse Voice Transcribe), Baseten (Muse Spark Open).
Self-hosted on a home server behind a Cloudflare tunnel.

## Bonus prizes

**Tick:**

- **Best Agentic Use-Case.** Helpa isn't one chat turn, it's agents running a job to the end. A research agent with
  tools (web search, part segmentation, plan submission) plans the fix; parallel tracks identify, model and measure at
  once; when the plan says "replace" or "call a pro," a part-finder agent finds the exact part number with buy links,
  a watcher agent tracks the order and pushes you when it lands, and a pro-finder agent finds the best-reviewed local
  shops, checks the fair price and writes the message. Every agent submits through a strict schema, so it can't invent
  a link or a phone number.
- **Best Creative Build.** Muse Image takes your own blurry photo of your own broken dryer and redraws it as a repair
  diagram: the part circled, the move drawn on, like a page of a service manual made for your machine. It shows up on
  the plan and as the share card when you're done. Muse Wonder researched the fix library and then watched its own 3D
  animations to fix the wrong ones.
- **Most Viral Project.** Post the 30-second cut on X (docs/X_POST.md) and paste the post URL. Engagement counts
  until Nov 8 EOD.
- **Community Vote.** Automatic once it's in the gallery. Push the gallery link from Nov 9.

**Only tick if Baseten is live on the server:**

- **Best Build on Meta Open Weight Models.** "Check what I did" runs on Muse Spark Open
  (`meta-models/muse-spark-open-1026` on Baseten) first, and every result says which model made the call. Muse Spark
  is only the fallback. The partner verifies this, so don't tick it unless the live server actually calls Baseten.

## Links

- Repo: https://github.com/joeykokinda/helpa
- Live (landing): https://helpa.pyras.org
- Live (app, open on a phone): https://helpa.pyras.org/app
- Demo video: https://youtu.be/kVYaoN_IzeY
- X post: `<x.com/... link>`
- Eval: https://github.com/joeykokinda/helpa/blob/main/docs/EVAL.md

## Team

Solo: Joey Kokinda (GitHub [@joeykokinda](https://github.com/joeykokinda)).

---

## Pre-submit checklist

- [ ] Repo is public: open https://github.com/joeykokinda/helpa in a private/incognito window.
- [ ] README's first screen says what Helpa is, how to try it, which Meta models, and what was built when.
- [ ] Video is 3:00 or less, uploaded **Unlisted** (not Private) on YouTube, and plays in an incognito window. Not
      "made for kids" (that kills comments and some embeds).
- [ ] Video shows only hackathon work, and says it out loud or on screen: "built from scratch during the hackathon."
- [ ] Video names each Meta model on screen when it's used (judges score Meta tooling at 25%).
- [ ] https://helpa.pyras.org/app works on your phone **on cellular, not home Wi-Fi**: pick Dryer, Spins but no heat,
      the general fix, Let's start, I'm stuck, Check what I did.
- [ ] `curl https://helpa.pyras.org/api/health` says `"resting":false`. Consider raising `HELPA_DAILY_BUDGET_USD`
      for judging week (Nov 5 to 8) so the live app doesn't hit the $15/day cap and fall back to samples.
- [ ] brach stays on and the tunnel stays up through Nov 9 (live final round). Don't redeploy anything risky after
      submitting.
- [ ] X post is live, public, with the video attached natively. Copy its URL.
- [ ] Open-weights decision made (Baseten key on brach and a real check run through it, or leave the bonus unticked).
- [ ] Meta API credits claimed (form closes Nov 4, 9:00 PM ET too).

## How to submit, step by step

1. Upload the final video to YouTube as **Unlisted**. Title: "Helpa: fix what's broken with a 3D twin of your exact
   machine (Meta AI Hackathon)". Paste the short description and the live link in the description. Open the link in
   incognito to check it plays.
2. Post on X with the 30-second cut (docs/X_POST.md). Copy the post URL.
3. Go to the Cerebral Valley event page (Meta Global AI Developer Hackathon), sign in, and open **Submit project**.
4. Fill in: name, tagline, descriptions, track **Indie Developer**, problem statement, Meta models, built-during box,
   tech stack, from the sections above.
5. Paste the links: repo, live app (`https://helpa.pyras.org/app` if there's one live field, landing if it asks for
   a website), video, X post.
6. Tick the bonus prizes listed above under **Tick**. Open weights only if Baseten is live.
7. Team: just you. Make sure your name and email on the platform match.
8. Submit well before 9:00 PM ET. Screenshot the confirmation.
9. Go back and open the submission page logged out (or in incognito) to make sure every link works from there.
