"""Records each diagram scene to clips/diagram-<scene>.mp4 at 1920x1080 (args: scene:seconds ...)."""
import base64, os, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "clips")
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path="/home/rex/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome")
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    cdp = page.context.new_cdp_session(page)
    holder = {"frames": []}
    cdp.on("Page.screencastFrame", lambda frame: (holder["frames"].append((frame["metadata"]["timestamp"], frame["data"])), cdp.send("Page.screencastFrameAck", {"sessionId": frame["sessionId"]})))
    for arg in sys.argv[1:] or ["title:5", "pipeline:10", "loop:8", "agents:9", "end:7"]:
        scene, seconds = arg.split(":")
        page.goto(f"file://{HERE}/index.html?s=blank", wait_until="networkidle")
        page.evaluate("document.fonts.ready")
        holder["frames"] = []
        cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 95, "maxWidth": 1920, "maxHeight": 1080})
        page.goto(f"file://{HERE}/index.html?s={scene}", wait_until="networkidle")
        page.wait_for_timeout(int(float(seconds) * 1000))
        cdp.send("Page.stopScreencast")
        work = tempfile.mkdtemp()
        frames = holder["frames"]
        lines = []
        for index, (stamp, data) in enumerate(frames):
            open(f"{work}/{index:05d}.jpg", "wb").write(base64.b64decode(data))
            duration = frames[index + 1][0] - stamp if index + 1 < len(frames) else 0.5
            lines += [f"file '{work}/{index:05d}.jpg'", f"duration {max(duration, 0.001):.4f}"]
        lines.append(f"file '{work}/{len(frames) - 1:05d}.jpg'")
        open(f"{work}/list.txt", "w").write("\n".join(lines) + "\n")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", f"{work}/list.txt", "-vf", "fps=30,format=yuv420p",
                        "-c:v", "libx264", "-crf", "16", f"{OUT}/diagram-{scene}.mp4"], check=True)
        subprocess.run(["rm", "-rf", work])
        print("diagram", scene, len(frames), "frames", flush=True)
    browser.close()
