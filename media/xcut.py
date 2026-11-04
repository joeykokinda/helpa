"""The 30-second vertical cut for X (1080x1920): python xcut.py -> out/helpa-x.mp4

Rex's on-camera hook, then the app full height with his Ray-Ban POV as a picture-in-picture, the phone fan, and the
end card. Same footage, voice lines and music as the main cut.
"""
import os, subprocess
from PIL import Image, ImageDraw
from edit import DESK, INK, META, OUT, font, rounded_mask, source, wrap

W, H, FPS = 1080, 1920, 30
WORK = f"{OUT}/xwork"
STAB = "g7998-stab.mp4"

# (kind, seconds, spec): talk = his take with captions [(at, text)]; app = app clip full height, POV in the corner,
# a voice line and a caption; scene = a 1920x1080 scene over a blurred copy of itself.
SHOTS = [
    ("talk", 3.75, dict(shot="IMG_6387.MOV@15.3-19.05", captions=[(0, "My dryer runs a full hour and my clothes come out soaking wet.")])),
    ("talk", 7.3, dict(shot="IMG_6400.MOV@10.7-18.0", captions=[(0, "Then we have ChatGPT, but ChatGPT just writes me a whole essay."),
                                                                (3.7, "So how is this supposed to help me?"), (5.6, "That's why I built Helpa.")])),
    ("app", 3.0, dict(app="10-capture.mp4@0.8-5*1.4", pov="video-7998_singular_display.mov@4.6-10*1.8", voice="V1.wav",
                      caption="I snap the sticker and tell it what's wrong.", chip="Muse Spark reads my exact dryer")),
    ("app", 3.4, dict(app="12-steps.mp4@7.75-13.6*1.7", pov=f"{STAB}@12-20*2.3", caption="Every step, on a 3D model of my dryer.", chip="3D twin")),
    ("app", 7.8, dict(app="14-check.mp4@0-18.2*2.33", pov=f"{STAB}@23.5-41*2.25", voice="V9.wav",
                      caption="Then I show it what I did. And it caught me. I wasn't done yet.", chip="Muse Spark checks my photo")),
    ("vscene", 4.0, dict(clip="diagram-fan-v.mp4@0.3-4.3", voice="V17.wav")),
    ("vscene", 5.4, dict(clip="diagram-end-v.mp4@0-6*1.1", voice="V18.wav")),
]


def caption(text, chip, path, width=W - 120):
    image = Image.new("RGBA", (W, 420), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    face = font(50, "Bold")
    lines = wrap(draw, text, face, width - 100)
    box = 40 + 64 * len(lines)
    top = 420 - box
    draw.rounded_rectangle((60, top, W - 60, 420), 34, fill=(255, 255, 255, 248))
    for index, line in enumerate(lines):
        draw.text((W // 2, top + 22 + index * 64), line, font=face, fill=INK, anchor="mt")
    if chip:
        chip_face = font(34, "Bold")
        chip_width = draw.textlength(chip, font=chip_face) + 56
        draw.rounded_rectangle(((W - chip_width) // 2, top - 80, (W + chip_width) // 2, top - 20), 30, fill=META)
        draw.text((W // 2, top - 50), chip, font=chip_face, fill=(255, 255, 255), anchor="mm")
    image.save(path)


def chain(spec, seconds):
    path, start, end, speed = source(spec)
    stop = f":end={end}" if end else ""
    return path, f"trim=start={start}{stop},setpts=(PTS-STARTPTS)/{speed},fps={FPS},tpad=stop_mode=clone:stop_duration={seconds}"


def render(index, kind, seconds, spec):
    out = f"{WORK}/{index:02d}.mp4"
    inputs, filters = [], []

    def count(items):
        return sum(1 for item in items if item == "-i")

    def add(path, loop=False):
        inputs.extend((["-loop", "1"] if loop else []) + ["-i", path])
        return count(inputs) - 1

    if kind == "talk":
        path, video = chain(spec["shot"], seconds)
        clip = add(path)
        filters.append(f"[{clip}:v]{video},scale=-2:{H},crop={W}:{H},setsar=1[base]")
        last = "base"
        for number, (at, text) in enumerate(spec["captions"]):
            until = spec["captions"][number + 1][0] if number + 1 < len(spec["captions"]) else seconds
            card_path = f"{WORK}/cap-{index}-{number}.png"
            caption(text, "", card_path)
            card = add(card_path, loop=True)
            filters.append(f"[{last}][{card}:v]overlay=0:{H - 420 - 240}:enable='between(t,{at},{until})'[c{number}]")
            last = f"c{number}"
        voice_spec = spec["shot"]
    elif kind == "app":
        background = add(f"{WORK}/desk.png", loop=True)
        path, video = chain(spec["app"], seconds)
        app = add(path)
        filters.append(f"[{app}:v]{video},scale=-2:{H - 120},setsar=1,format=rgba[appraw]")
        mask = add(f"{WORK}/mask-app.png", loop=True)
        filters.append(f"[appraw][{mask}:v]alphamerge[appcut]")
        filters.append(f"[{background}:v][appcut]overlay=(W-w)/2:60[withapp]")
        path, video = chain(spec["pov"], seconds)
        pov = add(path)
        filters.append(f"[{pov}:v]{video},scale=380:-2,crop=380:500:0:(ih-500)*0.55,setsar=1,format=rgba[povraw]")
        pov_mask = add(f"{WORK}/mask-pov.png", loop=True)
        filters.append(f"[povraw][{pov_mask}:v]alphamerge[povcut]")
        filters.append(f"[withapp][povcut]overlay={W - 380 - 36}:120[withpov]")
        card_path = f"{WORK}/cap-{index}.png"
        caption(spec["caption"], spec.get("chip", ""), card_path)
        card = add(card_path, loop=True)
        filters.append(f"[withpov][{card}:v]overlay=0:{H - 420 - 90}[base]")
        last = "base"
        voice_spec = spec.get("voice")
    elif kind == "vscene":  # a scene laid out vertically already
        path, video = chain(spec["clip"], seconds)
        clip = add(path)
        filters.append(f"[{clip}:v]{video},scale={W}:{H},setsar=1[base]")
        last = "base"
        voice_spec = spec.get("voice")
    else:
        path, video = chain(spec["clip"], seconds)
        clip = add(path)
        filters.append(f"[{clip}:v]{video},split[back][front]")
        filters.append(f"[back]scale=-2:{H},crop={W}:{H},gblur=sigma=50,eq=brightness=-0.04[blurred]")
        filters.append(f"[front]scale={W}:-2,setsar=1[sharp]")
        filters.append("[blurred][sharp]overlay=0:(H-h)/2[base]")
        last = "base"
        voice_spec = spec.get("voice")
    filters.append(f"[{last}]trim=duration={seconds},fps={FPS},format=yuv420p[out]")
    silence = count(inputs)
    inputs.extend(["-f", "lavfi", "-t", str(seconds), "-i", "anullsrc=r=48000:cl=stereo"])
    mix = [f"[{silence}:a]"]
    if voice_spec:
        path, start, end, _ = source(voice_spec)
        voice = add(path)
        stop = f":end={end}" if end else ""
        delay = 0 if kind == "talk" else 150
        filters.append(f"[{voice}:a]atrim=start={start}{stop},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,"
                       f"highpass=f=85,loudnorm=I=-16:TP=-1.5,adelay={delay}|{delay}[voice]")
        mix.append("[voice]")
    filters.append(f"{''.join(mix)}amix=inputs={len(mix)}:duration=first:normalize=0[aout]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(filters), "-map", "[out]", "-map", "[aout]",
                    "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-c:a", "aac", "-b:a", "192k", "-t", str(seconds), out], check=True)
    return out


def main():
    os.makedirs(WORK, exist_ok=True)
    Image.new("RGB", (W, H), DESK).save(f"{WORK}/desk.png")
    app_height = H - 120
    app_width = round(780 * app_height / 1688 / 2) * 2
    rounded_mask(app_width, app_height, 70, f"{WORK}/mask-app.png")
    rounded_mask(380, 500, 36, f"{WORK}/mask-pov.png")
    parts = [f"{WORK}/{index:02d}.mp4" if os.environ.get("REUSE") else render(index, *shot) for index, shot in enumerate(SHOTS)]
    total = sum(seconds for _, seconds, _ in SHOTS)
    talk_end = SHOTS[0][1] + SHOTS[1][1]
    music_start = 29.92 - talk_end  # the drop lands as the app appears
    inputs = []
    for part in parts:
        inputs += ["-i", part]
    concat = "".join(f"[{index}:v]setsar=1,format=yuv420p[n{index}];" for index in range(len(parts)))
    concat += "".join(f"[n{index}][{index}:a]" for index in range(len(parts))) + f"concat=n={len(parts)}:v=1:a=1[v][speech]"
    inputs += ["-ss", f"{music_start:.3f}", "-i", f"{HERE}/footage/digital-clouds.mp3"]
    music = len(parts)
    audio = (f"[{music}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration={total:.3f},volume=0.24,afade=t=out:st={total - 1.5:.3f}:d=1.5[music];"
             "[speech]asplit[speech1][key];[music][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[ducked];"
             "[speech1][ducked]amix=inputs=2:duration=first:normalize=0[mixed]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", concat + ";" + audio, "-map", "[v]", "-map", "[mixed]",
                    "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
                    "-movflags", "+faststart", f"{OUT}/helpa-x.mp4"], check=True)
    print(f"wrote out/helpa-x.mp4, {total:.1f}s")


HERE = os.path.dirname(os.path.abspath(__file__))
main()
