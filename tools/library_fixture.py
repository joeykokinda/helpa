"""Writes a replay fixture for a library fix: the events the pipeline sends when it recognises the machine and
uses the ready-made fix, so the free replay demo always matches the library.

usage: python3 tools/library_fixture.py <entry id> <problem id> <fixture name> "<symptom>" [model number on the sticker]
"""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
entry_id, problem_id, name, symptom = sys.argv[1:5]
sticker = sys.argv[5] if len(sys.argv) > 5 else ""
entry = json.loads((root / "backend/library" / f"{entry_id}.json").read_text())
problem = next(problem for problem in entry["problems"] if problem["id"] == problem_id)
catalog = json.loads((root / "backend/rigs" / f"{entry['rig_id']}.json").read_text())
plan = dict(problem["plan"], library_id=entry["id"], library_problem=problem["id"])
if sticker:
    plan["model_number"] = sticker
events = [
    {"type": "identify", "appliance": entry["appliance"], "brand": entry["brand"], "model_number": sticker, "confidence": 0.95, "symptom": symptom},
    {"type": "track", "track": "model", "state": "done", "title": "Found a 3D model", "detail": catalog["name"]},
    {"type": "library", "brand": entry["brand"], "appliance": entry["appliance"], "model_family": entry["model_family"]},
    {"type": "track", "track": "research", "state": "done", "title": "Found a ready fix", "detail": entry["model_family"]},
    {"type": "plan", "plan": plan},
    {"type": "rig", "rig": entry["rig_id"], "step_beats": problem["rig_beats"]},
    {"type": "done"},
]
assert len(problem["rig_beats"]) == len(plan["steps"]), "every step needs its beats"
actions = {part["id"]: part["actions"] for part in catalog["parts"]}
wrong = [beat for step in problem["rig_beats"] for beat in step if beat["action"] not in actions.get(beat["part"], [])]
assert not wrong, f"beats the rig can't play: {wrong}"
(root / "backend/fixtures" / f"{name}.sse").write_text("".join(f"data: {json.dumps(event)}\n\n" for event in events))
print(f"wrote backend/fixtures/{name}.sse: {len(plan['steps'])} steps")
