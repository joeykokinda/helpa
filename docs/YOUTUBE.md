# YouTube upload: Helpa demo

Files, all in `media/out/`:

| File | What it's for |
|---|---|
| `helpa-demo.mp4` | The video. 1920x1080, 30 fps, under 3:00. |
| `thumbnail.png` | Custom thumbnail, 1280x720. |
| `helpa-demo.srt` | English captions, timed to the cut. Upload it so YouTube doesn't auto-caption "Helpa" as "Helper". |
| `chapters.txt` | Chapter stamps, already pasted into the description below. Regenerate with `python captions.py` if the cut changes. |

## Title

**Helpa: I fixed my dryer knowing nothing (Meta AI hackathon demo)**

Shorter options:
- Helpa: point your phone at anything broken
- I built an app that shows you how to fix your appliances in 3D

## Description

```
My dryer ran a full hour and my clothes came out soaking wet. A repair guy wants $150 just to show up, and ChatGPT gave me an essay. So I built Helpa.

Snap the sticker and say what's wrong. Helpa reads your exact machine, plays the fix step by step on a 3D model of it, checks your work from a photo, and when it's beyond you, finds a pro at a fair price and writes the message for you.

Try it free on your phone: https://helpa.pyras.org
Code (open source): https://github.com/joeykokinda/helpa

Built solo, from scratch, during the Meta Global AI Developer Hackathon (Oct 26 to Nov 4), on Meta's models:
- Muse Spark 1.3: reads the sticker, plans the fix, maps every step onto the 3D model, checks your photo
- Muse Wonder + web search: digs up the manual and the likely cause, finds pros and fair prices
- SAM 3.1: finds the parts in your photo
- Muse Image: draws the fix right on your photo
- Muse Voice Transcribe: hands-free, just talk to it
POV shots filmed on Meta Ray-Ban Display glasses.

CHAPTERS_GO_HERE

Music: "Digital Clouds" by Alejandro Magaña (A. M.), Mixkit.

#MetaAI #hackathon #buildinpublic
```

Replace `CHAPTERS_GO_HERE` with the contents of `media/out/chapters.txt` (the first line must be `0:00`, or YouTube ignores the chapters).

## Settings

- **Visibility:** Public, so it counts for views and the X post can link it. Unlisted also works for the submission if you'd rather, but check it plays in an incognito window either way.
- **Audience:** No, it's not made for kids.
- **Altered or synthetic content:** No. Everything on screen is real footage and real app recordings.
- **Category:** Science & Technology.
- **Tags:** helpa, meta ai, muse spark, sam 3.1, appliance repair, fix it yourself, ai app, hackathon, ray-ban meta, dryer repair
- **Subtitles:** Upload file, With timing, `helpa-demo.srt`, English.
- **Thumbnail:** Upload `thumbnail.png`.
- **Comments:** On. Pin a comment with the try link.
- **End screen:** add a "link" element only if your channel is verified for external links; otherwise skip it, the URL is on the end card.

## Pinned comment

```
Try it on your phone, free, no account: https://helpa.pyras.org
Point it at anything broken. Tell me what it gets wrong 👇
```

## After uploading

1. Open the video logged out (incognito) and check it plays, the captions show, and the chapters appear on the progress bar.
2. Paste the YouTube link into the submission form (`docs/SUBMISSION.md`).
3. Post on X with the 30-second cut as native video, YouTube link in the first reply (`docs/X_POST.md`).
