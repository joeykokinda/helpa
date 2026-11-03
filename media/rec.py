"""Drives the live app in a phone-sized browser and records clips at device resolution (780x1688).

Steps: goto:/app  tap:Button text  text:Exact text  upload:file.jpg  type:selector::words  click:selector  plan:choice  wait:ms
       waittext:Text  scroll:Text  snap:name  rec:clipname  stop  js:expr  swipe:up|down
"""
import base64, os, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "https://helpa.pyras.org")
HERE = os.path.dirname(os.path.abspath(__file__)) + "/"
PHOTOS = HERE + "photos/"
CLIPS = HERE + "clips/"
PROFILE = os.environ.get("PROFILE", HERE + ".profile")
EXE = "/home/rex/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"


def write_clip(name, frames):
    if len(frames) < 2:
        return
    work = tempfile.mkdtemp()
    lines = []
    for index, (stamp, data) in enumerate(frames):
        path = f"{work}/{index:05d}.jpg"
        open(path, "wb").write(base64.b64decode(data))
        duration = frames[index + 1][0] - stamp if index + 1 < len(frames) else 0.5
        lines += [f"file '{path}'", f"duration {max(duration, 0.001):.4f}"]
    lines.append(f"file '{work}/{len(frames) - 1:05d}.jpg'")
    open(f"{work}/list.txt", "w").write("\n".join(lines) + "\n")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", f"{work}/list.txt",
                    "-vf", "fps=30,scale=780:1688:force_original_aspect_ratio=decrease,pad=780:1688:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p",
                    "-c:v", "libx264", "-crf", "16", "-preset", "slow", CLIPS + name + ".mp4"], check=True)
    subprocess.run(["rm", "-rf", work])
    print(f"clip {name} {frames[-1][0] - frames[0][0]:.1f}s", flush=True)


PHONE = os.environ.get("PHONE") == "1"
recorder = {"process": None}


def phone_start(name):
    subprocess.run(["adb", "shell", "rm", "-f", f"/sdcard/{name}.mp4"])
    recorder["process"] = subprocess.Popen(["adb", "shell", "screenrecord", "--size", "720x1602", "--bit-rate", "16000000", f"/sdcard/{name}.mp4"])
    recorder["name"] = name


def phone_stop():
    if recorder["process"]:
        subprocess.run(["adb", "shell", "pkill", "-INT", "screenrecord"])
        recorder["process"].wait(timeout=20)
        subprocess.run(["sleep", "1.5"])
        subprocess.run(["adb", "pull", f"/sdcard/{recorder['name']}.mp4", CLIPS + recorder["name"] + "-phone.mp4"], stdout=subprocess.DEVNULL)
        print("phone clip", recorder["name"], flush=True)
    recorder["process"] = None


with sync_playwright() as playwright:
  if PHONE:
    browser = playwright.chromium.connect_over_cdp("http://localhost:9333")
    context = browser.contexts[0]
    page = next((candidate for candidate in context.pages if "helpa" in candidate.url), None) or context.new_page()
    page.bring_to_front()
    cdp = context.new_cdp_session(page)
    page.evaluate("try{localStorage.setItem('helpa-onboarded','1')}catch(e){}")
  else:
    context = playwright.chromium.launch_persistent_context(PROFILE, executable_path=EXE, headless=True, no_viewport=True,
        args=["--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=gl-egl", "--force-device-scale-factor=2", "--window-size=600,1000",
              "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
              *([f"--use-file-for-fake-video-capture={os.environ['CAMERA']}"] if os.environ.get("CAMERA") else [])],
        permissions=["camera", "microphone", "geolocation"], geolocation={"latitude": 40.4259, "longitude": -86.9081})
    context.add_init_script("try{localStorage.setItem('helpa-onboarded','1')}catch(e){}")
    page = context.pages[0] if context.pages else context.new_page()
    cdp = context.new_cdp_session(page)
    cdp.send("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 0, "mobile": True})
    cdp.send("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
    cdp.send("Network.setUserAgentOverride", {"userAgent": UA})
  if True:
    clip = {"name": None, "frames": []}

    def on_frame(frame):
        if clip["name"]:
            clip["frames"].append((frame["metadata"]["timestamp"], frame["data"]))
        cdp.send("Page.screencastFrameAck", {"sessionId": frame["sessionId"]})

    if not PHONE:
        cdp.on("Page.screencastFrame", on_frame)
        cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 92})

    def button(name):
        return page.locator("button:visible", has_text=name).first

    def stop():
        if PHONE:
            phone_stop(); clip.update(name=None); return
        if clip["name"]:
            page.wait_for_timeout(300)
            write_clip(clip["name"], clip["frames"])
        clip.update(name=None, frames=[])

    for step in sys.argv[1:]:
        kind, _, arg = step.partition(":")
        try:
            if kind == "goto": page.goto(BASE + arg, wait_until="networkidle")
            elif kind == "tap": button(arg).click(timeout=20000)
            elif kind == "text": page.get_by_text(arg, exact=True).first.click(timeout=20000)
            elif kind == "upload" and PHONE:
                node = cdp.send("DOM.querySelector", {"nodeId": cdp.send("DOM.getDocument", {})["root"]["nodeId"], "selector": "input[type=file]"})
                cdp.send("DOM.setFileInputFiles", {"nodeId": node["nodeId"], "files": ["/sdcard/Download/" + arg]})
            elif kind == "upload": page.locator("input[type=file]").first.set_input_files(PHOTOS + arg)
            elif kind == "type":
                selector, _, words = arg.partition("::")
                page.locator(selector).first.click(); page.keyboard.type(words, delay=40)
            elif kind == "wait": page.wait_for_timeout(int(arg))
            elif kind == "waittext": page.get_by_text(arg).first.wait_for(timeout=240000)
            elif kind == "scroll": page.get_by_text(arg).first.scroll_into_view_if_needed(); page.evaluate("window.scrollBy({top:-140})")
            elif kind == "swipe": page.mouse.wheel(0, 500 if arg == "up" else -500)
            elif kind == "smooth":  # smooth:pixels, a slow scroll that reads well on video
                page.mouse.move(195, 420)
                for _ in range(20):
                    page.mouse.wheel(0, int(arg) / 20); page.wait_for_timeout(35)
                page.wait_for_timeout(500)
            elif kind == "click": page.locator(arg).first.click(timeout=20000)
            elif kind == "plan":  # plan:N  wait for the plan, answering each question with choice N (default 0)
                pick = int(arg or 0)
                for _ in range(480):
                    if page.get_by_text("Let's start").count() and page.get_by_text("Let's start").first.is_visible(): break
                    chips = page.locator(".question-chip:visible")
                    if chips.count():
                        page.wait_for_timeout(1400)
                        print("asked:", page.locator(".question-chips").first.get_attribute("aria-label"), "->", chips.nth(min(pick, chips.count() - 1)).inner_text(), flush=True)
                        chips.nth(min(pick, chips.count() - 1)).click(); page.wait_for_timeout(800)
                    page.wait_for_timeout(500)
                else:
                    raise RuntimeError("no plan")
            elif kind == "through":  # tap Next, pausing arg ms on each step, until All done shows
                for _ in range(12):
                    if button("All done").count(): break
                    page.wait_for_timeout(int(arg or 2500)); button("Next").click(timeout=20000)
                page.wait_for_timeout(int(arg or 2500))
            elif kind == "gone":  # wait until text disappears
                import time; start = time.time()
                page.get_by_text(arg).first.wait_for(state="detached", timeout=180000)
                print(f"gone {arg!r} after {time.time() - start:.0f}s", flush=True)
            elif kind == "js": print("JS", page.evaluate(arg), flush=True)
            elif kind == "snap": page.screenshot(path=CLIPS + arg + ".png"); print("snap", arg, flush=True)
            elif kind == "rec":
                stop(); clip["name"] = arg
                if PHONE: phone_start(arg)
            elif kind == "stop": stop()
        except Exception as error:
            print("FAILED", step, str(error).splitlines()[0][:200], flush=True)
            page.screenshot(path=CLIPS + "fail.png")
            break
    stop()
    if not PHONE:
        context.close()
