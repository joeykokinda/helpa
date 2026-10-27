"""End-to-end check of the Helpa app in headless Chromium with a fake camera and mic.

usage: uv run --with playwright e2e.py <out_dir>
expects the app on :3000 and the backend on :8095; writes numbered screenshots to out_dir.
"""
import sys
import time

from playwright.sync_api import sync_playwright

out = sys.argv[1]
fake_camera = f"{out}/cam.y4m"
fake_mic = f"{out}/voice.wav"


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path="/usr/bin/chromium",
            args=[
                "--use-fake-ui-for-media-stream",
                "--use-fake-device-for-media-stream",
                f"--use-file-for-fake-video-capture={fake_camera}",
                f"--use-file-for-fake-audio-capture={fake_mic}",
                "--autoplay-policy=no-user-gesture-required",
                "--enable-unsafe-swiftshader",
            ],
        )
        context = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=False)
        context.grant_permissions(["camera", "microphone"])
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: message.type == "error" and errors.append(message.text))

        shot = lambda name: page.screenshot(path=f"{out}/{name}.png", full_page=True)
        started = time.time()
        stamp = lambda label: print(f"{time.time() - started:6.1f}s {label}", flush=True)

        page.goto("http://localhost:3000")
        page.wait_for_function("document.querySelector('video')?.videoWidth > 0", timeout=15000)
        shot("01-start")
        stamp("camera live")

        page.get_by_role("button", name="Snap photo").click()
        page.wait_for_selector(".thumbnails img")
        stamp("photo snapped")

        talk = page.get_by_role("button", name="Hold to talk")
        talk.hover()
        page.mouse.down()
        page.wait_for_timeout(6500)
        page.mouse.up()
        page.wait_for_function("document.querySelector('textarea').value.length > 10", timeout=30000)
        stamp("heard: " + page.locator("textarea").input_value())
        shot("02-ready")

        page.get_by_role("button", name="Help me fix it").click()
        page.wait_for_timeout(9000)
        shot("03-working")
        stamp("working")
        page.wait_for_selector("text=What's going on", timeout=240000)
        stamp("plan arrived")
        shot("04-plan")

        page.get_by_role("button", name="Let's do it").click()
        page.wait_for_selector(".scene-3d canvas", timeout=120000)
        page.wait_for_timeout(2500)
        stamp("3D model shown")
        shot("05-step1-3d")

        steps = page.locator(".step-dot").count()
        stamp(f"{steps} steps")
        page.get_by_role("tab", name="Your photo").click()
        page.wait_for_timeout(1500)
        shot("06-step1-photo")
        page.get_by_role("tab", name="3D guide").click()

        page.locator("input[capture]").set_input_files(f"{out}/check.jpg")
        page.wait_for_selector(".check", timeout=60000)
        stamp("check: " + page.locator(".check").inner_text())
        shot("07-check")

        for index in range(1, steps):
            page.get_by_role("button", name="Done, next step").click()
            page.wait_for_timeout(1800)
            if index == 1:
                shot("08-step2-3d")
        page.get_by_role("button", name="All done").click()
        page.wait_for_timeout(1500)
        shot("09-done")
        stamp("done")

        print("page errors:", errors or "none")
        browser.close()


main()
