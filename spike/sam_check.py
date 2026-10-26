"""Spike: does SAM 3.1 find appliance parts in a real photo, and how fast?

usage: uv run sam_check.py photo.jpg "dishwasher filter" "spray arm" ...
writes photo.sam.png with every mask tinted, prints per-prompt latency.
"""
import asyncio
import base64
import mimetypes
import os
import sys
import time

from meta_sam_parser import SegmentationMaskRecord, decode_mask_to_raster, image_segmentation_format, parse_responses_stream
from openai import AsyncOpenAI
from PIL import Image

client = AsyncOpenAI(api_key=os.environ["META_API_KEY"], base_url="https://api.meta.ai/v1")
COLORS = [(255, 64, 64), (64, 200, 255), (255, 200, 0), (120, 255, 120), (220, 100, 255)]


def data_url(path):
    mime = mimetypes.guess_type(path)[0] or "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(open(path, 'rb').read()).decode()}"


async def segment(image_url, prompt):
    stream = await client.responses.create(
        model="sam-3.1",
        input=[{"type": "message", "role": "user", "content": [
            {"type": "input_text", "text": prompt},
            {"type": "input_image", "image_url": image_url},
        ]}],
        stream=True,
    )
    result = await parse_responses_stream(stream, image_segmentation_format()).final_result()
    return [r for r in result.records if isinstance(r, SegmentationMaskRecord)]


def paint(overlay, record, color):
    mask, bounds = record.mask, record.bounds
    raster = Image.frombytes("L", (mask.width, mask.height), bytes(v * 140 for v in decode_mask_to_raster(mask)))
    box = (round(bounds.left), round(bounds.top), round(bounds.right), round(bounds.bottom))
    raster = raster.resize((max(1, box[2] - box[0]), max(1, box[3] - box[1])))
    overlay.paste(Image.new("RGBA", raster.size, color + (255,)), box[:2], raster)


async def main(path, prompts):
    image = Image.open(path).convert("RGBA")
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    image_url = data_url(path)
    for index, prompt in enumerate(prompts):
        started = time.perf_counter()
        records = await segment(image_url, prompt)
        print(f"{prompt!r}: {len(records)} masks in {time.perf_counter() - started:.2f}s")
        for record in records:
            paint(overlay, record, COLORS[index % len(COLORS)])
    out = os.path.splitext(path)[0] + ".sam.png"
    Image.alpha_composite(image, overlay).save(out)
    print("wrote", out)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2:]))
