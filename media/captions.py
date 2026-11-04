"""Writes out/helpa-demo.srt from timeline.json: every spoken line, timed to the cut. python captions.py"""
import json, os, subprocess
from edit import HERE, OUT, cut_fade, source


def duration(path):
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True)
    return float(probe.stdout)


def stamp(seconds):
    millis = round(seconds * 1000)
    return f"{millis // 3600000:02d}:{millis // 60000 % 60:02d}:{millis // 1000 % 60:02d},{millis % 1000:03d}"


timeline = json.load(open(f"{HERE}/timeline.json"))
start, cues, chapters = 0.0, [], []
for index, segment in enumerate(timeline):
    if index:
        start += timeline[index - 1]["d"] - cut_fade(timeline[index - 1], segment)
    if segment.get("chapter"):
        chapters.append(f"{int(start) // 60}:{int(start) % 60:02d} {segment['chapter']}")
    if segment.get("captions"):
        lines = segment["captions"]
        for number, (at, line) in enumerate(lines):
            until = lines[number + 1][0] if number + 1 < len(lines) else segment["d"]
            cues.append((start + at, start + until, line))
        continue
    text = segment.get("srt") or segment.get("caption")
    if not text:
        continue
    begin, end = start, start + segment["d"]
    if segment.get("voice") and os.path.exists(source(segment["voice"])[0]) and not segment.get("talk"):
        begin = start + float(segment.get("voice_at", 0))
        end = min(end, begin + duration(source(segment["voice"])[0]) + 0.2)
    cues.append((begin, end, text.strip("“”")))
with open(f"{OUT}/helpa-demo.srt", "w") as out:
    for number, (begin, end, text) in enumerate(cues, 1):
        out.write(f"{number}\n{stamp(begin)} --> {stamp(end)}\n{text}\n\n")
open(f"{OUT}/chapters.txt", "w").write("\n".join(chapters) + "\n")
print(f"wrote out/helpa-demo.srt, {len(cues)} cues, and out/chapters.txt")
print("\n".join(chapters))
