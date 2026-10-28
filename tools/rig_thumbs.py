"""Renders the My Home card picture for every built-in rig (its resting model) to app/public/rigs/<id>.webp.
Re-run after a rig's look changes. Needs the app running (next dev) on the given port.
Usage: uv run -q --with playwright --with pillow tools/rig_thumbs.py [port]"""
import io, json, pathlib, sys
from PIL import Image
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parent.parent
port = sys.argv[1] if len(sys.argv) > 1 else "3000"
out = root / "app/public/rigs"
out.mkdir(parents=True, exist_ok=True)
# Big models need the camera pulled back to fit the card (mouse-wheel steps on the orbit controls).
zoom_out = {"car_oil_change": 14, "microwave_otr": 4}
# Models the resting camera frames badly use the first sample step instead, where the camera finds the part.
from_step = {"microwave_otr"}
rigs = [json.loads(path.read_text())["id"] for path in sorted((root / "app/app/components/rig/catalogs").glob("*.json"))]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", args=["--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=gl-egl"])
    page = browser.new_page(viewport={"width": 420, "height": 760}, device_scale_factor=1.5)
    page.add_init_script("document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'nextjs-portal, .scene-controls, .rig-caption, .rig-beat-dots, .scene-pin, .scene-pin-leader { display: none !important }'; document.head.append(s) })")
    for rig in rigs:
        page.goto(f"http://localhost:{port}/rigpreview?rig={rig}" + ("&step=0" if rig in from_step else "&idle"))
        page.wait_for_selector(".rig-scene canvas", timeout=90000)
        page.wait_for_timeout(2500)
        box = page.locator(".rig-scene").bounding_box()
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        for _ in range(zoom_out.get(rig, 0)):
            page.mouse.wheel(0, 300)
            page.wait_for_timeout(150)
        page.wait_for_timeout(800)
        shot = Image.open(io.BytesIO(page.screenshot(clip=page.locator(".rig-scene").bounding_box())))
        width, height = shot.size
        # The cards are 4:3; keep the middle of the scene.
        crop_height = min(height, width * 3 // 4)
        top = (height - crop_height) // 2
        shot.crop((0, top, width, top + crop_height)).resize((480, 360)).save(out / f"{rig}.webp", quality=82)
        print(rig)
    browser.close()
