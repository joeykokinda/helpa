"""End-to-end check of the Helpa app in headless Chromium with a fake camera and mic.

usage: uv run -q --with playwright e2e.py <out_dir> [light|dark]
expects the app on :3001 and the backend on :8095; out_dir holds cam.y4m, voice.wav and check.jpg.
writes numbered screenshots and the raw agent stream (fix-recorded.sse) to out_dir.
"""
import re
import sys
import time

from playwright.sync_api import sync_playwright

out = sys.argv[1]
scheme = sys.argv[2] if len(sys.argv) > 2 else "light"
app_url = "http://localhost:3001"
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
        context = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=False, color_scheme=scheme)
        context.grant_permissions(["camera", "microphone"])
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: message.type == "error" and errors.append(message.text))

        def save_stream(response):
            if response.url.endswith("/api/fix"):
                try:
                    open(f"{out}/fix-recorded.sse", "wb").write(response.body())
                except Exception as error:  # the stream can outlive the page
                    print("could not record stream:", error)

        page.on("requestfinished", lambda request: save_stream(request.response()))

        shot = lambda name: page.screenshot(path=f"{out}/{scheme}-{name}.png")
        started = time.time()
        stamp = lambda label: print(f"{time.time() - started:6.1f}s {label}", flush=True)

        page.goto(app_url)
        page.get_by_role("dialog", name="Welcome to Helpa").wait_for()
        page.wait_for_timeout(1200)
        shot("00-onboarding")
        page.get_by_role("button", name="Skip").click()

        page.wait_for_function("document.querySelector('video')?.videoWidth > 0", timeout=15000)
        page.wait_for_timeout(800)
        shot("01-camera")
        stamp("camera live")

        page.get_by_role("button", name="Snap photo").click()
        page.wait_for_selector(".thumbs img")
        page.get_by_role("button", name="Next").click()
        stamp("photo snapped")

        talk = page.get_by_role("button", name="Hold to talk")
        talk.hover()
        page.mouse.down()
        page.wait_for_timeout(1500)
        shot("02-listening")
        page.wait_for_timeout(5000)
        page.mouse.up()
        page.wait_for_function("document.querySelector('textarea').value.length > 10", timeout=30000)
        stamp("heard: " + page.locator("textarea").input_value())
        shot("03-describe")

        page.get_by_role("button", name="Help me fix it").click()
        page.wait_for_timeout(9000)
        shot("04-working")
        stamp("working")
        page.wait_for_timeout(15000)
        if page.locator(".working").count():
            shot("05-working-later")
        page.wait_for_selector(".plan, .camera", timeout=240000)
        if not page.locator(".plan").count():
            shot("06-error")
            print("agent failed, page errors:", errors or "none")
            sys.exit(1)
        page.wait_for_timeout(1500)
        stamp("plan arrived")
        shot("06-plan")

        page.get_by_role("button", name="Let's start").click()
        page.wait_for_timeout(1200)
        total = int(re.search(r"/(\d+)", page.locator(".progress-count").inner_text()).group(1))
        stamp(f"{total} steps")

        page.locator("input[capture]").set_input_files(f"{out}/check.jpg")
        page.wait_for_selector(".check", timeout=60000)
        stamp("check: " + page.locator(".check").inner_text().replace("\n", " "))
        shot("07-check")

        seen = set()
        for index in range(total):
            if index:
                page.get_by_role("button", name="Next").click()
                page.wait_for_timeout(1200)
            if page.locator(".scene-3d, .scene-skeleton").count() and "3d" not in seen:
                page.wait_for_selector(".scene-3d canvas", timeout=120000)
                page.wait_for_timeout(2500)
                shot(f"08-step{index + 1}-3d")
                seen.add("3d")
                if page.get_by_role("tab", name="Your photo").count():
                    page.get_by_role("tab", name="Your photo").click()
            if page.locator(".visual-card .part-photo").count() and "photo" not in seen:
                page.wait_for_timeout(1500)
                shot(f"09-step{index + 1}-photo")
                seen.add("photo")
            if page.locator(".visual-helpa").count() and "helpa" not in seen:
                shot(f"10-step{index + 1}-helpa")
                seen.add("helpa")
            if page.locator("details.more-help").count() and "details" not in seen:
                page.locator("details.more-help summary").click()
                page.wait_for_timeout(400)
                shot(f"11-step{index + 1}-more-help")
                seen.add("details")
        page.get_by_role("button", name="All done").click()
        page.wait_for_timeout(2500)
        shot("12-done")
        stamp("done")

        print("page errors:", errors or "none")
        browser.close()


main()
