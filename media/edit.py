"""Assembles the demo video from media/clips and rex's footage: python edit.py [draft|final].

Each segment is either "full" (a 1920x1080 clip, like a diagram) or "split": rex on the left (his footage,
or a placeholder card with the line to say until it exists), the app in a phone frame on the right.
Captions and the Meta model chip are drawn as images in Helpa's font.
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
CLIPS, FOOTAGE, OUT = f"{HERE}/clips", f"{HERE}/footage", f"{HERE}/out"
WORK = f"{OUT}/work"
FONT = f"{HERE}/fonts/SchibstedGrotesk.ttf"
W, H, FPS = 1920, 1080, 30
DESK, INK, ACCENT, META = (241, 241, 238), (14, 14, 15), (255, 91, 46), (8, 102, 255)
LEFT = (56, 40, 1124, 1000)  # x, y, w, h of rex's panel
PHONE_SCREEN = (1298, 40, 494, 1000)  # x, y, w, h of the app inside the phone frame


def font(size, weight="Bold"):
    face = ImageFont.truetype(FONT, size)
    face.set_variation_by_name(weight)
    return face


def rounded_mask(width, height, radius, path):
    mask = Image.new("L", (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius, fill=255)
    mask.save(path)


def wrap(draw, text, face, width):
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=face) > width and line:
            lines.append(line)
            line = word
        else:
            line = trial
    return lines + [line]


def frame_png(path):
    """The desk, the phone body, and the left panel's shadow; videos go into the holes."""
    image = Image.new("RGB", (W, H), DESK)
    draw = ImageDraw.Draw(image)
    x, y, w, h = LEFT
    draw.rounded_rectangle((x, y + 6, x + w, y + h + 6), 40, fill=(226, 226, 221))
    sx, sy, sw, sh = PHONE_SCREEN
    draw.rounded_rectangle((sx - 16, sy - 16 + 6, sx + sw + 16, sy + sh + 16 + 6), 70, fill=(222, 222, 217))
    draw.rounded_rectangle((sx - 16, sy - 16, sx + sw + 16, sy + sh + 16), 70, fill=(22, 22, 24))
    image.save(path)


def placeholder_png(line, path):
    x, y, w, h = LEFT
    image = Image.new("RGB", (w, h), (34, 34, 37))
    draw = ImageDraw.Draw(image)
    draw.text((60, 60), "REX ON CAMERA", font=font(30, "Bold"), fill=ACCENT)
    face = font(46, "SemiBold")
    for index, text in enumerate(wrap(draw, f"“{line}”", face, w - 120)):
        draw.text((60, 140 + index * 62), text, font=face, fill=(240, 240, 236))
    image.save(path)


def caption_png(text, chip, path):
    """A caption card for the bottom of the left panel, with an optional Meta model chip above it."""
    x, y, w, h = LEFT
    image = Image.new("RGBA", (w, 320), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    face = font(38, "SemiBold")
    lines = wrap(draw, text, face, w - 140) if text else []
    box_height = 36 + 50 * len(lines)
    top = 320 - 34 - box_height
    if lines:
        draw.rounded_rectangle((34, top, w - 34, 320 - 34), 26, fill=(255, 255, 255, 245))
        for index, line in enumerate(lines):
            draw.text((66, top + 18 + index * 50), line, font=face, fill=INK)
    if chip:
        chip_face = font(28, "Bold")
        chip_width = draw.textlength(chip, font=chip_face) + 48
        chip_top = (top if lines else 320 - 34) - 64
        draw.rounded_rectangle((34, chip_top, 34 + chip_width, chip_top + 50), 25, fill=META)
        draw.text((58, chip_top + 9), chip, font=chip_face, fill=(255, 255, 255))
    image.save(path)


def title_png(text, path):
    """A big machine name for the top of the left panel, so a quick cut still reads."""
    face = font(72, "ExtraBold")
    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    width = int(probe.textlength(text, font=face)) + 72
    image = Image.new("RGBA", (width, 118), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, width - 1, 117), 30, fill=(14, 14, 15, 235))
    draw.text((36, 14), text, font=face, fill=(255, 255, 255))
    image.save(path)


def source(spec):
    """'clip.mp4@start-end*speed' -> (path, start, end, speed); end may be empty for the whole clip."""
    name, _, rest = spec.partition("@")
    rest, _, speed = rest.partition("*")
    start, _, end = rest.partition("-")
    path = name if os.path.isabs(name) else next((f"{folder}/{name}" for folder in (FOOTAGE, CLIPS, os.path.expanduser("~/Downloads")) if os.path.exists(f"{folder}/{name}")), f"{FOOTAGE}/{name}")
    return path, float(start or 0), float(end) if end else None, float(speed or 1)


def is_portrait(path):
    """Phone and Ray-Ban Meta footage is usually upright; ffprobe reports the stored size plus a rotation."""
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation",
                            "-of", "json", path], capture_output=True, text=True)
    try:
        stream = json.loads(probe.stdout)["streams"][0]
    except (ValueError, IndexError, KeyError):
        return False
    rotated = any(abs(int(side.get("rotation", 0))) == 90 for side in stream.get("side_data_list", []))
    width, height = (stream["height"], stream["width"]) if rotated else (stream["width"], stream["height"])
    return height > width


def trimmed(spec, duration):
    """An ffmpeg filter chain that trims, speeds up and holds the last frame to fill duration."""
    path, start, end, speed = source(spec)
    stop = f":end={end}" if end else ""
    return path, f"trim=start={start}{stop},setpts=(PTS-STARTPTS)/{speed},fps={FPS},tpad=stop_mode=clone:stop_duration={duration}"


def render(index, segment):
    duration = segment["d"]
    out = f"{WORK}/{index:02d}.mp4"
    inputs, filters = [], []

    paths = []

    def use(path, loop=False):
        paths.append(path)
        inputs.extend(["-loop", "1", "-framerate", str(FPS), "-t", str(duration), "-i", path] if loop else ["-i", path])
        return len(paths) - 1

    if segment.get("shot") and os.path.exists(source(segment["shot"])[0]):
        if segment["kind"] == "full":
            segment = dict(segment, clip=segment["shot"], portrait=False)
        if segment.get("shot_voice"):  # his own voice saying it into the phone replaces the stand-in
            segment = dict(segment, voice=segment["shot"], voice_at=0)
    if segment["kind"] == "full":
        path, chain = trimmed(segment["clip"], duration)
        video = use(path)
        if segment.get("portrait") or is_portrait(path):  # a phone-shot portrait clip: sharp in the middle over a blurred copy of itself
            filters.append(f"[{video}:v]{chain},split[back][front]")
            filters.append(f"[back]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},gblur=sigma=40,eq=brightness=-0.06[blurred]")
            filters.append(f"[front]scale=-2:{H},setsar=1[sharp]")
            filters.append("[blurred][sharp]overlay=(W-w)/2:0,setsar=1[base]")
        else:
            filters.append(f"[{video}:v]{chain},scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1[base]")
        last = "base"
        if segment.get("caption"):  # a full-screen shot of rex's footage carries its caption bottom center
            caption = f"{WORK}/caption-{index:02d}.png"
            caption_png(segment["caption"], segment.get("chip", ""), caption)
            card = use(caption, loop=True)
            filters.append(f"[{card}:v]format=rgba,fade=in:st=0.15:d=0.3:alpha=1[card]")
            filters.append(f"[{last}][card]overlay={(W - LEFT[2]) // 2}:{H - 340}[withcard]")
            last = "withcard"
    else:
        frame = use(f"{WORK}/frame.png", loop=True)
        x, y, w, h = LEFT
        left = segment.get("shot") if segment.get("shot") and os.path.exists(source(segment["shot"])[0]) else segment.get("left")
        if left and not os.path.exists(source(left)[0]):
            left = None
        if left:
            path, chain = trimmed(left, duration)
            left_input = use(path)
            # left_y picks how high to crop tall footage: 0 keeps the top, 0.5 the middle (glasses POV keeps feet out of frame)
            focus = segment.get("left_y", 0.5)
            filters.append(f"[{left_input}:v]{chain},scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}:(iw-{w})/2:(ih-{h})*{focus},setsar=1,format=rgba[leftraw]")
        else:
            placeholder = f"{WORK}/placeholder-{index:02d}.png"
            placeholder_png(segment.get("say", ""), placeholder)
            left_input = use(placeholder, loop=True)
            filters.append(f"[{left_input}:v]format=rgba[leftraw]")
        left_mask = use(f"{WORK}/mask-left.png", loop=True)
        filters.append(f"[leftraw][{left_mask}:v]alphamerge[left]")
        filters.append(f"[{frame}:v][left]overlay={x}:{y}[withleft]")
        last = "withleft"
        sx, sy, sw, sh = PHONE_SCREEN
        if segment.get("app"):
            path, chain = trimmed(segment["app"], duration)
            app = use(path)
            zoom = segment.get("zoom")  # [focus x, focus y, final scale]: a slow push-in on that spot of the screen
            if zoom:
                fx, fy, scale = zoom
                grow = f"(1+({scale}-1)*min(t/{duration},1))"
                filters.append(f"[{app}:v]{chain},scale={sw}:{sh}:force_original_aspect_ratio=increase,crop={sw}:{sh},"
                               f"scale=w='trunc({sw}*{grow}/2)*2':h='trunc({sh}*{grow}/2)*2':eval=frame,"
                               f"crop={sw}:{sh}:x='min(max((iw-{sw})*{fx},0),iw-{sw})':y='min(max((ih-{sh})*{fy},0),ih-{sh})',setsar=1,format=rgba[appraw]")
            else:
                filters.append(f"[{app}:v]{chain},scale={sw}:{sh}:force_original_aspect_ratio=increase,crop={sw}:{sh},setsar=1,format=rgba[appraw]")
        else:
            app = use(f"{WORK}/mascot-screen.png", loop=True)
            filters.append(f"[{app}:v]format=rgba[appraw]")
        screen_mask = use(f"{WORK}/mask-screen.png", loop=True)
        filters.append(f"[appraw][{screen_mask}:v]alphamerge[screen]")
        filters.append(f"[{last}][screen]overlay={sx}:{sy}[withapp]")
        last = "withapp"
        if segment.get("caption") or segment.get("chip"):
            caption = f"{WORK}/caption-{index:02d}.png"
            caption_png(segment.get("caption", ""), segment.get("chip", ""), caption)
            card = use(caption, loop=True)
            filters.append(f"[{card}:v]format=rgba,fade=in:st=0.15:d=0.3:alpha=1[card]")
            filters.append(f"[{last}][card]overlay={x}:{y + h - 320}[withcard]")
            last = "withcard"
    if segment.get("title"):
        title = f"{WORK}/title-{index:02d}.png"
        title_png(segment["title"], title)
        card = use(title, loop=True)
        filters.append(f"[{card}:v]format=rgba,fade=in:st=0.1:d=0.25:alpha=1[titlecard]")
        filters.append(f"[{last}][titlecard]overlay={LEFT[0] + 34}:{LEFT[1] + 34}[withtitle]")
        last = "withtitle"
    filters.append(f"[{last}]trim=duration={duration},fps={FPS},format=yuv420p[out]")
    silence = len(paths)
    inputs.extend(["-f", "lavfi", "-t", str(duration), "-i", "anullsrc=r=48000:cl=stereo"])
    paths.append("silence")
    mix = [f"[{silence}:a]"]
    shot = segment.get("shot")
    if shot and segment.get("talk") and os.path.exists(source(shot)[0]) and not segment.get("voice"):
        segment = dict(segment, voice=shot)  # a talking-to-camera take carries its own voice
    if segment.get("voice") and not os.path.exists(source(segment["voice"])[0]):
        segment = {key: value for key, value in segment.items() if key != "voice"}
    if segment.get("voice"):  # 'file@start-end': rex's line, placed at the start of the segment
        path, start, end, _ = source(segment["voice"])
        voice = use(path)
        stop = f":end={end}" if end else ""
        delay = int(float(segment.get("voice_at", 0)) * 1000)
        filters.append(f"[{voice}:a]atrim=start={start}{stop},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,"
                       f"afade=t=in:d=0.04,loudnorm=I=-16:TP=-1.5,adelay={delay}|{delay}[voice]")
        mix.append("[voice]")
    elif segment.get("left") and segment.get("left_audio"):
        path, start, end, _ = source(segment["left"])
        ambient = use(path)
        stop = f":end={end}" if end else ""
        filters.append(f"[{ambient}:a]atrim=start={start}{stop},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=0.5[ambient]")
        mix.append("[ambient]")
    if segment["kind"] == "full":
        whoosh = use(f"{WORK}/whoosh.wav")
        mix.append(f"[{whoosh}:a]")
    filters.append(f"{''.join(mix)}amix=inputs={len(mix)}:duration=first:normalize=0[aout]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs,
                    "-filter_complex", ";".join(filters), "-map", "[out]", "-map", "[aout]",
                    "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-c:a", "aac", "-b:a", "192k", "-t", str(duration), out], check=True)
    return out


def main():
    os.makedirs(WORK, exist_ok=True)
    frame_png(f"{WORK}/frame.png")
    rounded_mask(LEFT[2], LEFT[3], 40, f"{WORK}/mask-left.png")
    rounded_mask(PHONE_SCREEN[2], PHONE_SCREEN[3], 54, f"{WORK}/mask-screen.png")
    mascot = Image.new("RGB", PHONE_SCREEN[2:], (255, 255, 255))
    mascot.save(f"{WORK}/mascot-screen.png")
    # A soft whoosh: filtered noise swelling in and out, for the cut into a full-screen scene.
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anoisesrc=d=0.7:c=pink:r=48000:a=0.5",
                    "-af", "highpass=f=400,lowpass=f=3500,afade=t=in:d=0.35:curve=qsin,afade=t=out:st=0.35:d=0.35:curve=qsin,volume=0.35,aformat=channel_layouts=stereo",
                    f"{WORK}/whoosh.wav"], check=True)
    timeline = json.load(open(f"{HERE}/timeline.json"))
    only = sys.argv[1:] and [int(arg) for arg in sys.argv[1:] if arg.isdigit()]
    parts = []
    for index, segment in enumerate(timeline):
        if only and index not in only:
            parts.append(f"{WORK}/{index:02d}.mp4")
            continue
        parts.append(render(index, segment))
        print(f"segment {index:02d} {segment['d']}s {segment.get('caption', segment.get('clip', ''))[:60]}", flush=True)
    # Crossfade every cut: 0.35 s into and out of full-screen scenes, a quick 0.2 s between app shots.
    inputs, video_chain, audio_chain = [], [], []
    for part in parts:
        inputs += ["-i", part]
    offset, previous_video, previous_audio = 0.0, "0:v", "0:a"
    for index in range(1, len(parts)):
        fade = 0.35 if "full" in (timeline[index]["kind"], timeline[index - 1]["kind"]) else 0.2
        offset += timeline[index - 1]["d"] - fade
        video_chain.append(f"[{previous_video}][{index}:v]xfade=transition=fade:duration={fade}:offset={offset:.3f}[v{index}]")
        audio_chain.append(f"[{previous_audio}][{index}:a]acrossfade=d={fade}[a{index}]")
        previous_video, previous_audio = f"v{index}", f"a{index}"
    total = offset + timeline[-1]["d"]
    music = f"{FOOTAGE}/music.mp3"
    if os.path.exists(music):
        # The music sits low and ducks further under rex's voice.
        inputs += ["-stream_loop", "-1", "-i", music]
        audio_chain.append(f"[{len(parts)}:a]atrim=duration={total:.3f},volume=0.22,afade=t=in:d=1.5,afade=t=out:st={total - 3:.3f}:d=3[music]")
        audio_chain.append(f"[{previous_audio}]asplit[speech][key]")
        audio_chain.append("[music][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[ducked]")
        audio_chain.append("[speech][ducked]amix=inputs=2:duration=first:normalize=0[mixed]")
        previous_audio = "mixed"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(video_chain + audio_chain),
                    "-map", f"[{previous_video}]", "-map", f"[{previous_audio}]", "-c:v", "libx264", "-crf", "17", "-preset", "slow",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", f"{OUT}/helpa-demo.mp4"], check=True)
    print(f"wrote out/helpa-demo.mp4, {total:.1f}s")


if __name__ == "__main__":
    main()
