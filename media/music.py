"""Fits "Digital Clouds" (Mixkit, free under the Mixkit License) to the cut: python music.py

The beat drop lands on the Helpa title card, the body loops on 8-bar phrase lines, and the track's big lift and
real ending carry the last stretch, finishing with the end card. Writes footage/music.mp3, which edit.py ducks
under the voice.
"""
import json, os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
TRACK = f"{HERE}/footage/digital-clouds.mp3"
FIRST_BEAT, BEAT = 0.155, 60 / 129.0  # measured beat grid
def beat(index):
    return FIRST_BEAT + index * BEAT


DROP, LIFT = beat(64), beat(144)
END = 98.4  # where the track's last hit rings out
FADE = 0.9  # crossfade length; each later piece starts this early so its downbeat meets the cut


def main():
    segments = json.load(open(f"{HERE}/timeline.json"))
    # The same cut points edit.py uses: 0.35 s crossfades next to full-screen scenes, 0.2 s between app shots.
    from edit import cut_fade
    starts = [0.0]
    for previous, segment in zip(segments, segments[1:]):
        starts.append(starts[-1] + previous["d"] - cut_fade(previous, segment))
    title = next(index for index, segment in enumerate(segments) if "diagram-title" in segment.get("clip", ""))
    total, title_at = starts[-1] + segments[-1]["d"], starts[title]
    # Splice only inside quiet stretches (the breakdown at beat 136, back into the intro pad), so each loop
    # sounds like the song building again and drops a second time.
    title_at += 0.35  # the title is fully in after its crossfade
    opening = (DROP - title_at, beat(136))
    pieces = [opening, (beat(40) - FADE, beat(136))]
    fill = total - (opening[1] - opening[0]) - (pieces[1][1] - pieces[1][0] - FADE)
    last_start = min((beat(index) for index in range(40, 112, 4)), key=lambda start: abs(END - start - fill))
    pieces.append((last_start - FADE, END))
    inputs, chain = [], []
    for start, stop in pieces:
        inputs += ["-ss", f"{start:.3f}", "-to", f"{stop:.3f}", "-i", TRACK]
    # the lift in the last piece is the loudest part of the track; keep it under the voice
    chain.append(f"[2:a]volume='if(gte(t,{LIFT - last_start + FADE:.2f}),0.75,1)':eval=frame[ending]")
    chain.append(f"[0:a][1:a]acrossfade=d={FADE}:c1=tri:c2=tri[body]")
    chain.append(f"[body][ending]acrossfade=d={FADE}:c1=tri:c2=tri[out]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(chain), "-map", "[out]", "-b:a", "256k",
                    f"{HERE}/footage/music.mp3"], check=True)
    length = sum(stop - start for start, stop in pieces) - FADE * (len(pieces) - 1)
    second_drop = (opening[1] - opening[0]) + DROP - beat(40)
    lift_at = length - (END - LIFT)
    print(f"pieces {[(round(a, 2), round(b, 2)) for a, b in pieces]}, music {length:.2f} of {total:.2f}, drops at {title_at:.2f} and {second_drop:.2f}, lift at {lift_at:.2f}")


main()
