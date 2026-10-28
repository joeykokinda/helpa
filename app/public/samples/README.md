# Sample photos

The "Try a sample" photos were generated for Helpa with Meta's `muse-image-1.0` (POST /v1/images/generations) during the hackathon, so there are no third-party license terms. They show common problems: a dishwasher leaving grit, a garbage disposal under the sink, a dryer with damp clothes, a sedan's engine bay, a top-load washer with standing water.

Each `<id>.webp` (1280 px) goes through the real pipeline in `tools/record_samples.py`, and the recorded run is saved to `backend/samples/<id>.sse`. The app sends `sample=<id>` with the photo, and the backend replays that run at a lifelike pace for free. Re-record after the library or rigs change. `<id>-thumb.webp` is the card image.
