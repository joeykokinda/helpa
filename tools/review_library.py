"""Muse reviews its own 3D library: renders each animated step, looks at the frames, and fixes what is wrong.

usage: uv run --with playwright --with openai --with pillow tools/review_library.py <library_id> [--dry-run]
expects the app dev server on :3002 (for /preview3d). Rewrites backend/library/<library_id>.json in place
and prints a report of every fix.
"""
import base64
import io
import json
import os
import sys
from pathlib import Path

from openai import OpenAI
from PIL import Image
from playwright.sync_api import sync_playwright

library_dir = Path(__file__).resolve().parent.parent / "backend" / "library"
preview_url = "http://localhost:3002/preview3d"
client = OpenAI(api_key=os.environ["META_API_KEY"], base_url="https://api.meta.ai/v1")
motions = ["none", "twist_ccw", "twist_cw", "lift", "pull_out", "push_in", "press", "unscrew", "screw_in", "rinse"]
max_rounds = 2


def data_url(png: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(png).decode()


class Renderer:
    """Renders library steps through /preview3d, serving the in-memory entry so edits show up immediately."""

    def __init__(self, playwright, entry):
        self.entry = entry
        browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", args=["--enable-unsafe-swiftshader"])
        self.page = browser.new_page(viewport={"width": 390, "height": 560}, device_scale_factor=1.5)
        self.page.route("**/api/library/*", lambda route: route.fulfill(json=self.entry))

    def frames(self, problem: int, step: int, moments=(450, 1750, 3150)) -> bytes:
        """Rest, mid-move and end-pose frames side by side, as one PNG."""
        self.page.goto(f"{preview_url}?id={self.entry['id']}&problem={problem}&step={step}")
        self.page.wait_for_selector(".scene-3d canvas", timeout=60000)
        self.page.wait_for_timeout(600)
        shots, waited = [], 0
        for moment in moments:
            self.page.wait_for_timeout(max(0, moment - waited))
            waited = moment
            shots.append(Image.open(io.BytesIO(self.page.locator(".scene-3d").screenshot())))
        sheet = Image.new("RGB", (sum(shot.width for shot in shots), shots[0].height), "white")
        offset = 0
        for shot in shots:
            sheet.paste(shot, (offset, 0))
            offset += shot.width
        buffer = io.BytesIO()
        sheet.save(buffer, "PNG")
        return buffer.getvalue()


def ask(model: str, effort: str, prompt: str, png: bytes, schema: dict, name: str) -> dict:
    content = [{"type": "input_text", "text": prompt}, {"type": "input_image", "image_url": data_url(png)}]
    for attempt in range(3):
        try:
            response = client.responses.create(
                model=model,
                reasoning={"effort": effort},
                input=[{"type": "message", "role": "user", "content": content}],
                text={"format": {"type": "json_schema", "name": name, "schema": schema, "strict": True}},
            )
            return json.loads(response.output_text)
        except Exception as error:  # empty or malformed replies and dropped connections are retried
            print(f"   retry {name} ({attempt + 1}): {str(error)[:120]}", flush=True)
    raise RuntimeError(f"{name} failed three times")


def review_layout(entry: dict, renderer: Renderer) -> list[str]:
    """Muse compares the whole 3D model with the real appliance and moves, resizes or recolors wrong parts."""
    parts = entry["scene"]["parts"]
    ids = [part["id"] for part in parts]
    vector = {"type": "array", "items": {"type": "number"}}
    schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["fixes"],
        "properties": {
            "fixes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["id", "reason", "position", "size", "rotation", "color"],
                    "properties": {
                        "id": {"type": "string", "enum": ids},
                        "reason": {"type": "string"},
                        "position": vector,
                        "size": vector,
                        "rotation": vector,
                        "color": {"type": "string"},
                    },
                },
            }
        },
    }
    prompt = f"""This is a simplified 3D instruction diagram of a {entry['model_family']} ({entry['brand']} {entry['appliance']}),
rendered from the front-right. The image shows the same view three times.
Coordinates are cm; origin is the center of the appliance's floor, +y up, +z toward the user, +x to the user's right.
Size is [width, height, depth]; cylinders are [diameter, length, diameter] along y before rotation.

Where each part really is, from the manual:
{json.dumps(entry['parts'], indent=1)}

Current 3D parts:
{json.dumps(parts, indent=1)}

Check the diagram against the real appliance and the manual locations above.
Return a fix ONLY for parts that are clearly in the wrong place, the wrong size, the wrong orientation or the wrong
color, giving the full corrected position, size, rotation and color. Return no fixes if the layout is right."""
    result = ask("muse-wonder-1.0", "high", prompt, renderer.frames(0, -1, moments=(300, 400, 500)), schema, "layout")
    notes = []
    by_id = {part["id"]: part for part in parts}
    for fix in result["fixes"]:
        part = by_id[fix["id"]]
        for key in ("position", "size", "rotation"):
            if len(fix[key]) == 3:
                part[key] = fix[key]
        if fix["color"].startswith("#"):
            part["color"] = fix["color"]
        notes.append(f"layout {fix['id']}: {fix['reason']}")
    return notes


def review_step(entry: dict, problem_index: int, step_index: int, renderer: Renderer) -> list[str]:
    """Muse watches one step's animation and corrects the parts, motion, direction or distance."""
    problem = entry["problems"][problem_index]
    step = problem["plan"]["steps"][step_index]
    animations = problem["step_animations"]
    current = next((animation for animation in animations if animation["step"] == step_index), None)
    if current is None:
        return []
    ids = [part["id"] for part in entry["scene"]["parts"]]
    schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["correct", "issues", "fixed"],
        "properties": {
            "correct": {"type": "boolean"},
            "issues": {"type": "string"},
            "fixed": {
                "type": "object",
                "additionalProperties": False,
                "required": ["part_ids", "motion", "axis", "distance", "caption"],
                "properties": {
                    "part_ids": {"type": "array", "items": {"type": "string", "enum": ids}},
                    "motion": {"type": "string", "enum": motions},
                    "axis": {"type": "string", "enum": ["x", "y", "z"]},
                    "distance": {"type": "number"},
                    "caption": {"type": "string"},
                },
            },
        },
    }
    notes = []
    for round_number in range(max_rounds):
        prompt = f"""You are checking a 3D repair animation for a total beginner, for a {entry['model_family']}.
The image shows three moments side by side: before the move, mid-move, and the end pose. The orange part is the
one the user acts on (a faint orange outline shows where it ends up), the orange arrow shows the direction, and
the black pill names the part. Other parts are pale, and outer cabinets are see-through glass.

Step the user hears: "{step['instruction']}"
Extra help: {json.dumps(step.get('details', []))}
Where parts really are, from the manual: {json.dumps(entry['parts'])}
Current animation: {json.dumps(current)}
Motions: twist_ccw/twist_cw spin around the part's vertical axis; lift moves up; pull_out moves along the axis
(+z is toward the user, +y up, +x the user's right); push_in moves back in; press pushes in briefly; unscrew spins
and moves along the axis; rinse wiggles; none just highlights. distance is in cm.

Would a beginner watching this understand exactly WHICH part to touch and WHICH WAY to move it, and does it match
how this appliance really works? Set correct to true only if the right part is highlighted and the motion and
direction match reality. Otherwise explain the issues and give the fixed animation (first part_id is the part that
moves; caption is at most 6 words). If correct, repeat the current animation as fixed."""
        verdict = ask("muse-spark-1.3", "medium", prompt, renderer.frames(problem_index, step_index), schema, "step_review")
        if verdict["correct"] or not verdict["fixed"]["part_ids"]:
            if round_number == 0:
                notes.append(f"ok   {problem['id']}#{step_index}")
            break
        fixed = {"step": step_index, **verdict["fixed"]}
        notes.append(f"FIX  {problem['id']}#{step_index}: {verdict['issues']} -> {fixed['motion']} {fixed['axis']} {fixed['part_ids'][:2]}")
        animations[animations.index(current)] = fixed
        current = fixed
    return notes


def main():
    library_id = sys.argv[1]
    dry_run = "--dry-run" in sys.argv
    path = library_dir / f"{library_id}.json"
    entry = json.loads(path.read_text())
    report = []
    with sync_playwright() as playwright:
        renderer = Renderer(playwright, entry)
        report += review_layout(entry, renderer)
        for problem_index, problem in enumerate(entry["problems"]):
            for step_index, step in enumerate(problem["plan"]["steps"]):
                if step.get("show_3d"):
                    report += review_step(entry, problem_index, step_index, renderer)
    if not dry_run:
        path.write_text(json.dumps(entry, indent=2))
    print(f"== {library_id}: {sum(line.startswith('FIX') for line in report)} step fixes, "
          f"{sum(line.startswith('layout') for line in report)} layout fixes")
    print("\n".join(report))


main()
