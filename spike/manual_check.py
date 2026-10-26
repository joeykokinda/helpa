"""Spike: can Muse Wonder read a model sticker, find the real manual, and plan the fix?

usage: uv run manual_check.py sticker.jpg "filter is clogged, dishes come out gritty" [part_photo.jpg ...]
prints the step plan as JSON plus the sources it cited.
"""
import json
import os
import sys
import time

from openai import OpenAI

from sam_check import data_url

client = OpenAI(api_key=os.environ["META_API_KEY"], base_url="https://api.meta.ai/v1")

STEP = {
    "type": "object",
    "additionalProperties": False,
    "required": ["instruction", "target_part", "motion", "check"],
    "properties": {
        "instruction": {"type": "string", "description": "One short spoken sentence."},
        "target_part": {"type": "string", "description": "Short visual noun phrase SAM can segment, e.g. 'cylindrical mesh filter'."},
        "motion": {"type": "string", "enum": ["none", "twist_ccw", "twist_cw", "lift", "pull_out", "push_in", "press", "unscrew", "screw_in", "rinse"]},
        "check": {"type": "string", "description": "What a photo looks like once this step is done."},
    },
}
PLAN = {
    "type": "object",
    "additionalProperties": False,
    "required": ["brand", "model_number", "manual_url", "diagnosis", "tools", "replacement_parts", "safety", "steps"],
    "properties": {
        "brand": {"type": "string"},
        "model_number": {"type": "string"},
        "manual_url": {"type": "string"},
        "diagnosis": {"type": "string"},
        "tools": {"type": "array", "items": {"type": "string"}},
        "replacement_parts": {"type": "array", "items": {"type": "string"}, "description": "OEM part numbers when the manual gives them."},
        "safety": {"type": "array", "items": {"type": "string"}},
        "steps": {"type": "array", "items": STEP},
    },
}

PROMPT = """Read the model sticker. Find this exact appliance's official owner's or service manual on the web.
The user says: {complaint}
Using only that manual, plan the fix for someone who has never done it. Name every target_part as
a plain visual description of what it looks like in the photo, not the manual's jargon."""


def main(sticker, complaint, *part_photos):
    content = [{"type": "input_text", "text": PROMPT.format(complaint=complaint)}]
    content += [{"type": "input_image", "image_url": data_url(path)} for path in (sticker, *part_photos)]
    started = time.perf_counter()
    response = client.responses.create(
        model="muse-wonder-1.0",
        reasoning={"effort": "medium"},
        tools=[{"type": "web_search"}],
        input=[{"type": "message", "role": "user", "content": content}],
        text={"format": {"type": "json_schema", "name": "repair_plan", "schema": PLAN, "strict": True}},
    )
    print(f"{time.perf_counter() - started:.1f}s")
    print(json.dumps(json.loads(response.output_text), indent=2))
    for item in response.output:
        for part in getattr(item, "content", None) or []:
            for note in getattr(part, "annotations", None) or []:
                print("cited:", note.url)


if __name__ == "__main__":
    main(*sys.argv[1:])
