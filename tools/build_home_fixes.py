#!/usr/bin/env python3
"""Hand-made models and ready fixes for everyday home problems that have no built-in rig.

Writes, for each thing below:
  backend/models/<model>.json                      the recipe model (shapes and moving parts)
  app/app/components/rig/recipes/examples/<model>.json   the same recipe, for /recipepreview
  backend/library/<entry>.json                     the library entry: its fixes, steps and 3D beats

Run from the repo root: python3 tools/build_home_fixes.py   (then rebuild the backend; models are embedded)
Coordinates are metres, origin on the floor, +y up, +z toward the viewer. Rotations are degrees.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent


# ---------- recipe helpers ----------

def node(id, parent, shape, size, pos, rot=(0, 0, 0), mat="plastic", color="", points=(), text="", repeat=()):
    return {"id": id, "parent": parent, "shape": shape, "size": list(size), "position": list(pos), "rotation": list(rot),
            "material": mat, "color": color, "points": [list(p) for p in points], "text": text, "repeat": list(repeat)}


def group(id, parent, pos, rot=(0, 0, 0)):
    return node(id, parent, "group", [], pos, rot)


def part(node_id, label, joint="none", axis=(0, 1, 0), amount=0, actions=("look",), aliases=(), lift=0, pivot=(0, 0, 0), view=(0.5, 0.6, 1), rest=0):
    return {"node": node_id, "label": label, "aliases": list(aliases), "joint": joint, "axis": list(axis), "amount": amount,
            "lift": lift, "pivot": list(pivot), "actions": list(actions), "view": list(view), "rest": rest}


def room(width=1.4, depth=0.9, wall_height=1.5, wall="#ece8e1", floor="#d6d0c6", wall_z=-0.36):
    return [
        node("wall", "", "box", [width, wall_height, 0.02], [0, wall_height / 2, wall_z], mat="white_enamel", color=wall),
        node("floor_tiles", "", "box", [width, 0.006, depth], [0, 0.003, wall_z + depth / 2], mat="ceramic", color=floor),
    ]


# ---------- library helpers ----------

def step(instruction, target, check, details=(), motion="none", beats=()):
    """One plan step plus the 3D beats that show it: beats are (part, action, caption)."""
    return {"instruction": instruction, "target_part": target, "check": check, "details": list(details), "motion": motion,
            "beats": [{"part": part_id, "action": action, "caption": caption} for part_id, action, caption in beats]}


def problem(id, title, symptoms, diagnosis, steps, cause, safety=(), tools=(), parts=(), next=""):
    return {"id": id, "title": title, "symptoms": list(symptoms), "diagnosis": diagnosis, "steps": steps, "cause": cause,
            "safety": list(safety), "tools": list(tools), "replacement_parts": list(parts), "next": next}


def entry(id, appliance, category, icon, model, sticker, problems, contradicts=()):
    out = {"id": id, "appliance": appliance, "brand": "", "model_family": f"Works on most {appliance}s", "model_numbers": [],
           "sticker_location": sticker, "manual_urls": [], "parts": [], "problems": [], "recipe": model,
           "category": category, "icon": icon, "contradicts": list(contradicts)}
    for item in problems:
        plan = {"brand": "", "model_number": "", "appliance": appliance, "manual_url": "", "diagnosis": item["diagnosis"],
                "tools": item["tools"], "replacement_parts": item["replacement_parts"], "safety": item["safety"],
                "steps": [{"instruction": s["instruction"], "details": s["details"], "target_part": s["target_part"], "photo": -1,
                           "motion": s["motion"], "show_3d": bool(s["beats"]), "check": s["check"]} for s in item["steps"]],
                "library_id": "", "library_problem": ""}
        problem_out = {"id": item["id"], "title": item["title"], "symptoms": item["symptoms"], "plan": plan,
                       "rig_beats": [s["beats"] for s in item["steps"]], "cause": item["cause"]}
        if item["next"]:
            problem_out["next"] = item["next"]
        out["problems"].append(problem_out)
    return out


MODELS = {}
ENTRIES = []


# =====================================================================
# Bathroom sink: faucet aerator, pop-up stopper, P-trap, shutoff valves
# =====================================================================

CHROME = "chrome"
PVC = "#f2f2ee"

sink_nodes = room(width=1.3, wall_z=-0.32) + [
    # Vanity cabinet, open at the front so the trap shows when the doors swing out.
    group("vanity", "", [0, 0, 0]),
    node("cabinet_left", "vanity", "box", [0.02, 0.76, 0.5], [-0.31, 0.42, -0.06], mat="wood", color="#e6dccb"),
    node("cabinet_right", "vanity", "box", [0.02, 0.76, 0.5], [0.31, 0.42, -0.06], mat="wood", color="#e6dccb"),
    node("cabinet_back", "vanity", "box", [0.6, 0.76, 0.02], [0, 0.42, -0.30], mat="wood", color="#d9cfbd"),
    node("cabinet_floor", "vanity", "box", [0.6, 0.02, 0.48], [0, 0.07, -0.06], mat="wood", color="#d9cfbd"),
    node("toe_kick", "vanity", "box", [0.64, 0.06, 0.02], [0, 0.03, 0.15], mat="wood", color="#cbbfa9"),
    node("counter", "vanity", "panel", [0.68, 0.54, 0.035], [0, 0.82, -0.05], rot=(-90, 0, 0), mat="ceramic", color="#f4f2ee",
         points=[[0, 0.03, 0.165]]),
    node("backsplash", "vanity", "box", [0.68, 0.1, 0.015], [0, 0.88, -0.31], mat="ceramic", color="#f4f2ee"),
    node("basin", "vanity", "lathe", [0, 1.25, 1], [0, 0.835, -0.08], mat="ceramic", color="#fbfaf7",
         points=[[0.02, -0.16], [0.07, -0.155], [0.12, -0.12], [0.15, -0.06], [0.165, -0.01], [0.168, 0]]),
    node("drain_ring", "vanity", "torus", [0.042, 0.008], [0, 0.677, -0.08], rot=(90, 0, 0), mat=CHROME),
    # The pop-up stopper sits in the drain; hair wraps the rod under it.
    group("pop_up_stopper", "vanity", [0, 0.682, -0.08]),
    node("stopper_cap", "pop_up_stopper", "cylinder", [0.036, 0.012], [0, 0, 0], mat=CHROME),
    node("stopper_rod", "pop_up_stopper", "cylinder", [0.008, 0.07], [0, -0.04, 0], mat=CHROME),
    group("stopper_hair", "pop_up_stopper", [0, -0.05, 0]),
    node("hair_wad", "stopper_hair", "clump", [0.035, 0.05, 0.03], [0, 0, 0], mat="hair", color="#5b4636"),
    node("lift_rod", "vanity", "cylinder", [0.008, 0.07], [0, 0.89, -0.25], mat=CHROME),
    node("lift_rod_knob", "vanity", "sphere", [0.014], [0, 0.93, -0.25], mat=CHROME),
    # Faucet on the deck behind the basin.
    group("faucet", "vanity", [0, 0.838, -0.24]),
    node("faucet_base", "faucet", "cylinder", [0.06, 0.02, 0.07], [0, 0.01, 0], mat=CHROME),
    node("faucet_body", "faucet", "cylinder", [0.042, 0.12], [0, 0.08, 0], mat=CHROME),
    node("spout", "faucet", "hose", [0.026], [0, 0, 0], mat=CHROME, points=[[0, 0.11, 0], [0, 0.15, 0.04], [0, 0.145, 0.1], [0, 0.12, 0.13]]),
    group("aerator", "faucet", [0, 0.105, 0.13]),
    node("aerator_body", "aerator", "cylinder", [0.026, 0.022], [0, 0, 0], mat=CHROME),
    node("aerator_screen", "aerator", "cylinder", [0.02, 0.002], [0, -0.012, 0], mat="screen_mesh"),
    group("aerator_scale", "aerator", [0, -0.016, 0]),
    node("scale_bits", "aerator_scale", "clump", [0.02, 0.008, 0.02], [0, 0, 0], mat="mineral_scale"),
    group("faucet_handle", "faucet", [0, 0.145, -0.005]),
    node("handle_lever", "faucet_handle", "capsule", [0.016, 0.1], [0, 0.0, 0.035], rot=(80, 0, 0), mat=CHROME),
    # Under the sink: tailpiece, a white plastic P-trap with two slip nuts, the trap arm into the wall.
    node("tailpiece", "vanity", "cylinder", [0.034, 0.17], [0, 0.585, -0.08], mat=CHROME),
    node("trap_arm", "vanity", "hose", [0.04], [0, 0, 0], mat="white_plastic", color=PVC,
         points=[[0.12, 0.47, -0.08], [0.12, 0.47, -0.2], [0.12, 0.47, -0.31]]),
    node("wall_escutcheon", "vanity", "cylinder", [0.08, 0.008], [0.12, 0.47, -0.3], rot=(90, 0, 0), mat=CHROME),
    group("p_trap", "vanity", [0, 0, 0]),
    node("trap_bend", "p_trap", "hose", [0.042], [0, 0, 0], mat="white_plastic", color=PVC,
         points=[[0, 0.5, -0.08], [0, 0.42, -0.08], [0.02, 0.375, -0.08], [0.06, 0.36, -0.08], [0.1, 0.375, -0.08], [0.12, 0.42, -0.08], [0.12, 0.47, -0.08]]),
    group("trap_gunk", "p_trap", [0.06, 0.375, -0.08]),
    node("gunk_wad", "trap_gunk", "clump", [0.05, 0.03, 0.035], [0, 0, 0], mat="grime", color="#4b4332"),
    group("slip_nut_left", "vanity", [0, 0.5, -0.08]),
    node("nut_left", "slip_nut_left", "cylinder", [0.056, 0.028], [0, 0, 0], mat="white_plastic", color="#e8e8e2"),
    group("slip_nut_right", "vanity", [0.12, 0.47, -0.08]),
    node("nut_right", "slip_nut_right", "cylinder", [0.056, 0.028], [0, 0, 0], rot=(0, 0, 0), mat="white_plastic", color="#e8e8e2"),
    # Shutoff valves with supply lines up to the faucet.
    group("shutoff_hot", "vanity", [-0.16, 0.32, -0.285]),
    node("hot_valve", "shutoff_hot", "cylinder", [0.03, 0.05], [0, 0, 0.02], rot=(90, 0, 0), mat=CHROME),
    node("hot_handle", "shutoff_hot", "rounded_box", [0.05, 0.02, 0.012], [0, 0, 0.05], mat="chrome"),
    group("shutoff_cold", "vanity", [0.16, 0.32, -0.285]),
    node("cold_valve", "shutoff_cold", "cylinder", [0.03, 0.05], [0, 0, 0.02], rot=(90, 0, 0), mat=CHROME),
    node("cold_handle", "shutoff_cold", "rounded_box", [0.05, 0.02, 0.012], [0, 0, 0.05], mat="chrome"),
    node("supply_hot", "vanity", "hose", [0.012], [0, 0, 0], mat="foil", points=[[-0.16, 0.34, -0.26], [-0.14, 0.55, -0.25], [-0.04, 0.78, -0.24]]),
    node("supply_cold", "vanity", "hose", [0.012], [0, 0, 0], mat="foil", points=[[0.16, 0.34, -0.26], [0.14, 0.55, -0.25], [0.04, 0.78, -0.24]]),
    # A bucket to catch the trap water; it starts out in front of the cabinet.
    group("bucket", "", [0.04, 0.0, -0.02]),
    node("bucket_body", "bucket", "lathe", [0, 1, 1], [0, 0, 0], mat="plastic", color="#3d7bd9",
         points=[[0.09, 0], [0.095, 0.005], [0.115, 0.2], [0.12, 0.205]]),
    # Cabinet doors, hinged on their outer edges.
    group("door_left", "vanity", [-0.15, 0.43, 0.2]),
    node("door_left_panel", "door_left", "rounded_box", [0.29, 0.68, 0.02], [0, 0, 0], mat="wood", color="#efe7da"),
    node("door_left_knob", "door_left", "sphere", [0.022], [0.11, 0.25, 0.018], mat="brass"),
    group("door_right", "vanity", [0.15, 0.43, 0.2]),
    node("door_right_panel", "door_right", "rounded_box", [0.29, 0.68, 0.02], [0, 0, 0], mat="wood", color="#efe7da"),
    node("door_right_knob", "door_right", "sphere", [0.022], [-0.11, 0.25, 0.018], mat="brass"),
]

sink_parts = [
    part("door_left", "Cabinet door", "hinge", [0, 1, 0], -105, ["open", "close", "look"], ["left cabinet door"], pivot=[-0.145, 0, 0], view=[0.2, 0.5, 1]),
    part("door_right", "Cabinet door", "hinge", [0, 1, 0], 105, ["open", "close", "look"], ["right cabinet door"], pivot=[0.145, 0, 0], view=[0.2, 0.5, 1]),
    part("aerator", "Aerator", "twist", [0, 1, 0], -300, ["unlock", "remove", "insert", "lock", "look"], ["faucet tip", "aerator screen", "end of the faucet"], lift=-0.05, view=[0.4, 0.5, 1]),
    part("aerator_scale", "Mineral buildup", "debris", [0.3, -1, 0.5], 0.15, ["clean", "look"], ["scale", "grit"]),
    part("faucet_handle", "Faucet handle", "hinge", [1, 0, 0], 30, ["open", "close", "look"], ["handle", "tap"], view=[0.4, 0.7, 1]),
    part("pop_up_stopper", "Drain stopper", "slide", [0, 1, 0], 0.13, ["remove", "insert", "open", "close", "look"], ["stopper", "pop-up", "plug"], view=[0.2, 1, 0.7]),
    part("stopper_hair", "Hair clog", "debris", [1, 0.6, 0.6], 0.25, ["clean", "look"], ["hair", "gunk"]),
    part("lift_rod", "Stopper rod", "press", [0, -1, 0], 0.02, ["press", "look"], ["lift rod", "pull rod"]),
    part("p_trap", "P-trap", "slide", [0, -1, 0.5], 0.14, ["remove", "insert", "look"], ["trap", "U-bend", "curved pipe"], view=[0.3, 0.2, 1]),
    part("trap_gunk", "Trap clog", "debris", [0.5, -0.4, 1], 0.3, ["clean", "look"], ["gunk", "clog"]),
    part("slip_nut_left", "Slip nut", "turn", [0, 1, 0], 180, ["turn", "open", "close", "look"], ["left nut", "big plastic nut"], view=[0.3, 0.3, 1]),
    part("slip_nut_right", "Slip nut", "turn", [0, 1, 0], 180, ["turn", "open", "close", "look"], ["right nut"], view=[0.3, 0.3, 1]),
    part("shutoff_hot", "Hot shutoff valve", "turn", [0, 0, 1], 90, ["open", "close", "look"], ["hot valve"], rest=1, view=[0.3, 0.3, 1]),
    part("shutoff_cold", "Cold shutoff valve", "turn", [0, 0, 1], 90, ["open", "close", "look"], ["cold valve"], rest=1, view=[0.3, 0.3, 1]),
    part("bucket", "Bucket", "slide", [0, 0, 1], 0.45, ["insert", "remove", "look"], ["pail", "bowl"], rest=1),
    part("basin", "Sink basin", "none", [0, 1, 0], 0, ["look", "clean"], ["sink", "bowl"]),
]

MODELS["bathroom_sink"] = {"name": "Bathroom sink and vanity", "nodes": sink_nodes, "parts": sink_parts}

OPEN_CABINET = [("door_left", "open", "Open the left door"), ("door_right", "open", "Open the right door")]
CLOSE_CABINET = [("door_left", "close", "Close the left door"), ("door_right", "close", "Close the right door")]

ENTRIES.append(entry(
    "bathroom-sink", "bathroom sink", "Sink", "sink", "bathroom_sink",
    "No sticker needed. Faucet brands are stamped on the base or the handle.",
    [
        problem(
            "slow_drain", "Drains slowly",
            ["The sink drains really slowly", "Water sits in the sink", "The bathroom sink is clogged", "It gurgles and drains slow"],
            "Hair and soap wrap around the drain stopper's rod right under the drain, and that is what slows almost every bathroom sink. Pulling the stopper and cleaning it fixes most of them in five minutes, no tools.",
            [
                step("Pull the drain stopper straight up", "drain stopper", "The stopper is out of the drain in your hand.",
                     ["Push the stopper down first, then pull.", "If it won't come, turn it a quarter turn and pull again."], "lift",
                     [("pop_up_stopper", "remove", "Lift the stopper out")]),
                step("Pull the hair off the stopper", "hair clog on the stopper", "The stopper and its rod are clean.",
                     ["Use a paper towel, it's gross but quick.", "Look down the drain with a flashlight for more."], "none",
                     [("stopper_hair", "clean", "Pull the hair off")]),
                step("Run hot water for one minute", "faucet", "Water goes straight down the open drain.",
                     ["Hot tap water rinses the soap out.", "Never use boiling water on plastic pipes."], "none",
                     [("faucet_handle", "open", "Turn on the hot water"), ("basin", "look", "Watch it drain"), ("faucet_handle", "close", "Turn the water off")]),
                step("Drop the stopper back in", "drain stopper", "The stopper sits in the drain and moves up and down with the rod.",
                     ["Some stoppers have a slot: turn it so the rod catches."], "push_in",
                     [("pop_up_stopper", "insert", "Put the stopper back")]),
                step("Test: run the water for 30 seconds", "sink basin", "No water stays in the bowl.",
                     ["Pull the stopper rod up so the drain is open."], "none",
                     [("faucet_handle", "open", "Run the water"), ("basin", "look", "No puddle"), ("faucet_handle", "close", "Water off")]),
            ],
            "hair on the drain stopper", tools=["Paper towels", "Flashlight"], next="trap_clog",
            safety=["Skip chemical drain cleaner; it burns skin and eats old pipes.", "If you already poured cleaner in, wear gloves and eye protection."]),
        problem(
            "trap_clog", "Still slow after cleaning the stopper",
            ["Still slow after cleaning the stopper"],
            "With the stopper clean, the clog is further down in the U-shaped P-trap under the sink, where gunk settles. It comes off by hand with two big plastic nuts, so you can empty it into a bucket.",
            [
                step("Open the cabinet and clear it out", "cabinet doors", "You can see the white U-shaped pipe.",
                     ["Move everything out from under the sink."], "none", OPEN_CABINET + [("p_trap", "look", "This is the P-trap")]),
                step("Put a bucket under the U-bend", "bucket", "The bucket sits right under the U-bend.",
                     ["Water will pour out when it comes off."], "push_in", [("bucket", "insert", "Bucket under the trap")]),
                step("Unscrew both big nuts by hand", "slip nuts", "Both nuts are loose and slide along the pipe.",
                     ["Turn them toward you, counterclockwise from above.", "Use pliers with a towel only if they're stuck."], "unscrew",
                     [("slip_nut_left", "open", "Loosen this nut"), ("slip_nut_right", "open", "Loosen this one too")]),
                step("Pull the U-bend down and empty it", "P-trap", "The U-bend is off and empty.",
                     ["Tip it into the bucket.", "Expect a bad smell; that's normal."], "pull_out",
                     [("p_trap", "remove", "Pull the U-bend down"), ("trap_gunk", "clean", "Clear out the gunk")]),
                step("Put the U-bend back and hand-tighten the nuts", "P-trap", "Both nuts are snug and the trap doesn't wiggle.",
                     ["Check the thin washers are still inside the nuts.", "Hand-tight is enough; too tight cracks them."], "screw_in",
                     [("p_trap", "insert", "Push the U-bend up"), ("slip_nut_left", "close", "Tighten this nut"), ("slip_nut_right", "close", "And this one")]),
                step("Run water and look for drips", "slip nuts", "Water drains fast and no drips fall into the bucket.",
                     ["A drip means a nut needs a quarter turn more."], "none",
                     [("faucet_handle", "open", "Run the water"), ("p_trap", "look", "Watch for drips"), ("faucet_handle", "close", "Water off")] + CLOSE_CABINET),
            ],
            "a clog in the P-trap", tools=["Bucket", "Old towel", "Rubber gloves"],
            safety=["If you used chemical drain cleaner, wear gloves and goggles: the trap water is caustic."]),
        problem(
            "weak_faucet", "Weak water from the faucet",
            ["Water barely comes out of the faucet", "The faucet stream is weak", "Low water pressure at the sink", "The water sprays sideways"],
            "Little bits of minerals and grit collect in the aerator, the screen at the tip of the faucet, and choke the stream. Unscrewing it and rinsing it out brings the pressure back.",
            [
                step("Close the drain so nothing falls in", "drain stopper", "The stopper is down.",
                     ["The aerator has small parts; a towel over the drain works too."], "none",
                     [("pop_up_stopper", "look", "Close the drain first")]),
                step("Unscrew the faucet tip by hand", "aerator", "The aerator is off in your hand.",
                     ["Turn it to the right, looking down from above.", "If it's stuck, wrap a cloth around it and use pliers gently."], "twist_cw",
                     [("aerator", "unlock", "Unscrew the tip"), ("aerator", "remove", "Take it off")]),
                step("Rinse the grit out of the screen", "aerator screen", "You can see clean holes in the screen.",
                     ["Tap it on the counter and rinse it under another tap.", "White crust soaks off in vinegar in 30 minutes."], "rinse",
                     [("aerator_scale", "clean", "Rinse the grit out")]),
                step("Screw the tip back on", "aerator", "It's snug and doesn't leak.",
                     ["Keep the little parts in the same order."], "screw_in",
                     [("aerator", "insert", "Put it back"), ("aerator", "lock", "Screw it on")]),
                step("Turn the water on full", "faucet handle", "A strong, even stream comes out.",
                     ["Still weak? The valves under the sink may be half closed."], "none",
                     [("faucet_handle", "open", "Water on full"), ("faucet_handle", "close", "Water off")]),
            ],
            "a clogged aerator", tools=["Cloth", "Pliers (only if stuck)", "White vinegar (for crust)"], next="half_closed_valves"),
        problem(
            "half_closed_valves", "Still weak with a clean aerator",
            ["Still weak with a clean aerator"],
            "With a clean aerator, the next most likely cause is a shutoff valve under the sink that got bumped or half closed. Opening both fully brings full pressure back.",
            [
                step("Open the cabinet under the sink", "cabinet doors", "You can see two small valves on the wall.",
                     [], "none", OPEN_CABINET + [("shutoff_hot", "look", "Hot valve"), ("shutoff_cold", "look", "Cold valve")]),
                step("Turn both valves all the way open", "shutoff valves", "Both handles stop turning counterclockwise.",
                     ["Counterclockwise opens them.", "Don't force a valve that won't move; call a plumber."], "twist_ccw",
                     [("shutoff_hot", "turn", "Open the hot valve"), ("shutoff_cold", "turn", "Open the cold valve")]),
                step("Test the faucet on hot and cold", "faucet", "Both run strong.", [], "none",
                     [("faucet_handle", "open", "Test the water"), ("faucet_handle", "close", "Water off")] + CLOSE_CABINET),
            ],
            "a half-closed shutoff valve",
            safety=["If a valve drips when you turn it, close it back and call a plumber."]),
        problem(
            "leak_under_sink", "Leaking under the sink",
            ["There's water under the sink", "The cabinet under the sink is wet", "It drips under the sink"],
            "Most drips under a bathroom sink come from a loose plastic nut on the drain trap, which works loose over time. Finding the drip and snugging that nut by hand fixes it.",
            [
                step("Open the cabinet and dry everything", "cabinet", "The pipes and the cabinet floor are dry.",
                     ["Starting dry makes the drip easy to find."], "none", OPEN_CABINET),
                step("Put a bucket under the pipes", "bucket", "The bucket is under the trap.", [], "push_in",
                     [("bucket", "insert", "Bucket under the pipes")]),
                step("Run water and find the first drip", "drain pipes", "You can point at where the drip starts.",
                     ["Feel each joint with a dry paper towel.", "Water on the supply hoses or valves is a different leak."], "none",
                     [("faucet_handle", "open", "Run the water"), ("slip_nut_left", "look", "Check this nut"), ("slip_nut_right", "look", "And this one"), ("faucet_handle", "close", "Water off")]),
                step("Snug the leaking nut by hand", "slip nut", "The nut is snug.",
                     ["A quarter turn past hand-tight at most."], "screw_in",
                     [("slip_nut_left", "close", "Tighten the nut"), ("slip_nut_right", "close", "Tighten this one too")]),
                step("Run water again and check it's dry", "drain pipes", "No more drips.",
                     ["Still dripping at a valve or hose? Close the valve and call a plumber."], "none",
                     [("faucet_handle", "open", "Run the water"), ("p_trap", "look", "Stays dry"), ("faucet_handle", "close", "Water off")] + CLOSE_CABINET),
            ],
            "a loose drain nut", tools=["Paper towels", "Bucket"],
            safety=["If water sprays from a supply hose, close its shutoff valve right away."]),
    ],
))


# =====================================================================
# Toilet (the two-piece toilet recipe)
# =====================================================================

MODELS["toilet"] = json.loads((ROOT / "app/app/components/rig/recipes/examples/toilet.json").read_text())

LID_OFF = [("tank_lid", "remove", "Lift the tank lid off")]
LID_ON = [("tank_lid", "insert", "Put the lid back")]

ENTRIES.append(entry(
    "toilet", "toilet", "Toilet", "toilet", "toilet",
    "Inside the tank, stamped on the back wall above the water line.",
    [
        problem(
            "keeps_running", "Keeps running",
            ["The toilet keeps running", "It runs on and off by itself", "I hear water trickling in the toilet", "The toilet won't stop filling"],
            "Water is leaking past the flapper, the rubber seal at the bottom of the tank, so the tank keeps refilling. Usually the chain catches or grime stops the flapper sealing, and a wipe and a chain fix stops it.",
            [
                step("Lift the tank lid off", "tank lid", "The lid is off and resting on a towel.",
                     ["It's heavy porcelain; set it on a towel on the floor."], "lift", LID_OFF),
                step("Check the chain has a little slack", "flapper chain", "The chain hangs with about half an inch of slack.",
                     ["Too tight holds the flapper open; too long gets caught under it."], "none",
                     [("chain", "look", "Chain needs a little slack"), ("flapper", "look", "This is the flapper")]),
                step("Turn the water off and flush", "water shutoff valve", "The tank is empty.",
                     ["The valve is on the wall behind the toilet; turn it right."], "twist_cw",
                     [("shutoff_valve", "close", "Turn the water off"), ("flush_handle", "turn", "Flush to empty it")]),
                step("Wipe the flapper and its seat", "flapper", "The flapper and the ring under it feel smooth.",
                     ["Use a rough sponge on the ring.", "A warped or stiff flapper should be replaced; they're universal."], "none",
                     [("flapper", "open", "Lift the flapper"), ("seat_scale", "clean", "Wipe the ring clean"), ("flapper", "close", "Let it drop")]),
                step("Turn the water back on", "water shutoff valve", "The tank fills and then goes quiet.",
                     ["Turn it left all the way."], "twist_ccw",
                     [("shutoff_valve", "open", "Water back on"), ("fill_valve", "look", "The tank refills")]),
                step("Flush once and listen", "flush handle", "It fills and then stops completely.",
                     ["Silence after a minute means it's fixed."], "none",
                     [("flush_handle", "turn", "Flush"), ("flapper", "look", "It drops and seals")] + LID_ON),
            ],
            "a leaky flapper", tools=["Old towel", "Rough sponge"], parts=["Universal 2-inch toilet flapper (only if yours is warped)"], next="water_too_high"),
        problem(
            "water_too_high", "Still running with a good flapper",
            ["Still running with a good flapper"],
            "With a good flapper, the water level is probably set too high, so it trickles into the overflow tube and never stops. Lowering the float a little stops it.",
            [
                step("Lift the tank lid off", "tank lid", "The lid is off.", [], "lift", LID_OFF),
                step("Look where the water ends", "overflow tube", "You can see water spilling into the open tube.",
                     ["The water should stop about an inch below the top of the tube."], "none",
                     [("overflow_tube", "look", "Water spills in here"), ("float_cup", "look", "The float sets the level")]),
                step("Lower the float a little", "float", "The float sits lower on the valve.",
                     ["Turn the long screw on top of the fill valve, or squeeze the clip and slide the float down an inch."], "none",
                     [("fill_valve", "look", "Turn the screw here"), ("float_cup", "look", "Lower the float")]),
                step("Flush and check the level", "overflow tube", "The water stops an inch below the top of the tube.",
                     [], "none", [("flush_handle", "turn", "Flush"), ("overflow_tube", "look", "Water stops below the top")] + LID_ON),
            ],
            "water set too high"),
        problem(
            "weak_flush", "Weak flush",
            ["The toilet doesn't flush all the way", "Weak flush", "I have to flush twice", "The handle feels loose"],
            "A weak flush usually means the flapper isn't lifting all the way, because the chain is too long, or the tank isn't filling all the way because the water valve is partly closed.",
            [
                step("Lift the tank lid off", "tank lid", "The lid is off.", [], "lift", LID_OFF),
                step("Hold the handle down and watch the flapper", "flapper", "You can see how far the flapper lifts.",
                     ["It should lift straight up and stay up for a few seconds."], "none",
                     [("flush_handle", "turn", "Push the handle"), ("flapper", "open", "The flapper should lift high")]),
                step("Shorten the chain to half an inch of slack", "flapper chain", "The chain has just a little slack.",
                     ["Move the clip one or two links."], "none", [("chain", "look", "Take up the slack here")]),
                step("Open the wall valve all the way", "water shutoff valve", "The valve is fully open.",
                     ["Turn it left until it stops."], "twist_ccw", [("shutoff_valve", "look", "Open all the way")]),
                step("Flush and watch", "flush handle", "Everything goes down in one flush.",
                     [], "none", [("flush_handle", "turn", "Flush"), ("flapper", "close", "It drops back")] + LID_ON),
            ],
            "a long flapper chain", tools=["Old towel"]),
        problem(
            "clogged", "Clogged or overflowing",
            ["The toilet is clogged", "The water is rising in the bowl", "The toilet won't go down", "It's about to overflow"],
            "Something is stuck in the bowl's trap. Stopping the water first keeps it from overflowing, then a few firm plunges usually clears it.",
            [
                step("Don't flush again: lift the tank lid", "tank lid", "The lid is off.",
                     ["If the bowl is rising, act fast."], "lift", LID_OFF),
                step("Push the flapper shut to stop the water", "flapper", "No more water goes into the bowl.",
                     ["Press it down with your hand; it's clean tank water."], "none", [("flapper", "close", "Push the flapper down")]),
                step("Turn off the water at the wall", "water shutoff valve", "The tank stops filling.",
                     ["Turn it right until it stops."], "twist_cw", [("shutoff_valve", "close", "Water off")]),
                step("Plunge with slow, firm pushes", "bowl", "The water drains away with a gulp.",
                     ["Use a plunger with a flap (flange) that fits the hole.", "Seal it, push gently first, then pump firmly 10 times."], "none",
                     [("toilet_lid", "open", "Open the lid"), ("bowl", "look", "Plunge here")]),
                step("Turn the water back on and flush", "flush handle", "It flushes and refills normally.",
                     [], "none", [("shutoff_valve", "open", "Water back on"), ("flush_handle", "turn", "Flush")] + LID_ON),
            ],
            "a clog in the bowl", tools=["Flange plunger", "Old towels", "Rubber gloves"],
            safety=["Never mix drain cleaners in a toilet; the fumes are dangerous.", "If sewage comes up in a tub or floor drain too, call a plumber."]),
        problem(
            "slow_refill", "Fills slowly or not at all",
            ["The tank fills really slowly", "The toilet tank won't refill", "It takes forever to fill", "No water goes into the tank"],
            "Grit from the water line clogs the top of the fill valve. Turning the water off, popping the cap and flushing the grit out usually fixes it.",
            [
                step("Lift the tank lid off", "tank lid", "The lid is off.", [], "lift", LID_OFF),
                step("Turn the water off at the wall", "water shutoff valve", "The valve is closed.", ["Turn it right."], "twist_cw",
                     [("shutoff_valve", "close", "Water off")]),
                step("Twist off the fill valve cap", "fill valve cap", "The cap is off.",
                     ["Push down and turn it left an eighth of a turn."], "twist_ccw",
                     [("fill_valve_cap", "unlock", "Twist the cap left"), ("fill_valve_cap", "remove", "Lift it off")]),
                step("Hold a cup over the valve, water on for 5 seconds", "fill valve", "Clear water sprays into the cup, washing the grit out.",
                     ["This flushes grit out of the line."], "none",
                     [("fill_valve", "look", "Cup over the top"), ("shutoff_valve", "open", "Water on, briefly"), ("shutoff_valve", "close", "Then off")]),
                step("Put the cap back and turn the water on", "fill valve cap", "The tank fills in about a minute.", [], "twist_cw",
                     [("fill_valve_cap", "insert", "Cap back on"), ("fill_valve_cap", "lock", "Twist to lock"), ("shutoff_valve", "open", "Water on")] + LID_ON),
            ],
            "grit in the fill valve", tools=["Plastic cup", "Old towel"]),
    ],
))


# =====================================================================
# Refrigerator (top freezer): coils, grille, vents, door seal, drain, water filter, dial
# =====================================================================

BODY = "#f4f3f0"
LINER = "#fbfbfa"
fridge_nodes = room(width=1.5, wall_z=-0.42) + [
    group("cabinet", "", [0, 0, 0]),
    node("side_left", "cabinet", "box", [0.03, 1.7, 0.7], [-0.365, 0.93, 0.0], mat="white_enamel", color=BODY),
    node("side_right", "cabinet", "box", [0.03, 1.7, 0.7], [0.365, 0.93, 0.0], mat="white_enamel", color=BODY),
    node("top", "cabinet", "box", [0.76, 0.03, 0.7], [0, 1.775, 0.0], mat="white_enamel", color=BODY),
    node("back", "cabinet", "box", [0.7, 1.7, 0.03], [0, 0.93, -0.335], mat="white_plastic", color=LINER),
    node("floor_inside", "cabinet", "box", [0.7, 0.03, 0.66], [0, 0.1, 0.0], mat="white_plastic", color=LINER),
    node("divider", "cabinet", "box", [0.7, 0.06, 0.66], [0, 1.27, 0.0], mat="white_plastic", color=LINER),
    node("shelf_low", "cabinet", "box", [0.69, 0.008, 0.6], [0, 0.55, 0.0], mat="glass"),
    node("shelf_high", "cabinet", "box", [0.69, 0.008, 0.6], [0, 0.88, 0.0], mat="glass"),
    node("crisper", "cabinet", "rounded_box", [0.66, 0.2, 0.55], [0, 0.23, 0.02], mat="clear", color="#dfe9ee"),
    node("milk", "cabinet", "rounded_box", [0.1, 0.22, 0.1], [-0.2, 0.67, -0.05], mat="white_plastic", color="#ffffff"),
    node("milk_cap", "cabinet", "cylinder", [0.035, 0.02], [-0.2, 0.79, -0.05], mat="plastic", color="#2f6fd1"),
    node("juice", "cabinet", "rounded_box", [0.09, 0.18, 0.09], [0.05, 0.65, -0.1], mat="plastic", color="#f2a23a"),
    node("leftovers", "cabinet", "rounded_box", [0.18, 0.07, 0.14], [0.2, 0.92, -0.05], mat="clear", color="#cfe3c8"),
    node("ice_tray", "cabinet", "rounded_box", [0.3, 0.05, 0.22], [-0.1, 1.33, -0.05], mat="white_plastic", color="#e9f3f8"),
    node("frozen_bag", "cabinet", "rounded_box", [0.2, 0.09, 0.16], [0.18, 1.35, 0.0], mat="plastic", color="#7cc0e8"),
    # Air slots on the freezer's back wall feed the fridge below.
    node("freezer_vent", "cabinet", "panel", [0.3, 0.1, 0.012], [0, 1.6, -0.315], mat="white_plastic", color="#e4e6e8",
         points=[[-0.1, 0, 0.04, 0.06], [-0.05, 0, 0.04, 0.06], [0, 0, 0.04, 0.06], [0.05, 0, 0.04, 0.06], [0.1, 0, 0.04, 0.06]]),
    # The defrost drain hole low on the fridge's back wall, blocked by a plug of ice and crumbs.
    node("defrost_drain", "cabinet", "cylinder", [0.03, 0.01], [0, 0.2, -0.315], rot=(90, 0, 0), mat="black_plastic"),
    group("drain_clog", "cabinet", [0, 0.2, -0.3]),
    node("drain_ice", "drain_clog", "clump", [0.04, 0.03, 0.02], [0, 0, 0], mat="grime", color="#9bb3bf"),
    node("water_puddle", "cabinet", "patch", [0.3, 0.2], [0, 0.118, -0.12], mat="water"),
    # Temperature dial in the fridge ceiling and the twist-in water filter beside it.
    group("temperature_dial", "cabinet", [0.22, 1.22, -0.2]),
    node("dial_face", "temperature_dial", "cylinder", [0.06, 0.02], [0, 0, 0], mat="white_plastic", color="#ffffff"),
    node("dial_pointer", "temperature_dial", "box", [0.008, 0.024, 0.04], [0, 0, 0.012], mat="black_plastic"),
    node("filter_housing", "cabinet", "rounded_box", [0.1, 0.07, 0.3], [-0.24, 1.2, -0.05], mat="white_plastic", color="#e7e9eb"),
    group("water_filter", "cabinet", [-0.24, 1.2, 0.11]),
    node("filter_cartridge", "water_filter", "cylinder", [0.055, 0.24], [0, 0, -0.1], rot=(90, 0, 0), mat="white_plastic", color="#dfe7ee"),
    node("filter_cap", "water_filter", "cylinder", [0.065, 0.03], [0, 0, 0.02], rot=(90, 0, 0), mat="plastic", color="#2f6fd1"),
    # Under the front: the toe grille, with the dusty condenser coils behind it.
    group("toe_grille", "cabinet", [0, 0.05, 0.36]),
    node("grille_face", "toe_grille", "panel", [0.7, 0.08, 0.015], [0, 0, 0], mat="black_plastic",
         points=[[-0.25, 0, 0.08, 0.03], [-0.13, 0, 0.08, 0.03], [0, 0, 0.08, 0.03], [0.13, 0, 0.08, 0.03], [0.25, 0, 0.08, 0.03]]),
    node("condenser_coils", "cabinet", "wire_grid", [0.6, 0.3, 0.02], [0, 0.05, 0.16], rot=(-90, 0, 0), mat="black_plastic", color="#3a3a3a"),
    group("coil_dust", "cabinet", [0, 0.065, 0.16]),
    node("dust_mat", "coil_dust", "patch", [0.6, 0.3], [0, 0, 0], mat="lint", color="#b7aea2"),
    # Power cord to the wall outlet behind.
    node("outlet_plate", "", "rounded_box", [0.07, 0.11, 0.01], [0.25, 0.4, -0.41], mat="white_plastic"),
    group("power_plug", "", [0.25, 0.4, -0.39]),
    node("plug_body", "power_plug", "rounded_box", [0.04, 0.05, 0.03], [0, 0, 0], mat="black_plastic"),
    node("power_cord", "", "hose", [0.012], [0, 0, 0], mat="black_plastic", points=[[0.25, 0.4, -0.37], [0.28, 0.3, -0.36], [0.2, 0.15, -0.35]]),
    # Doors, hinged on the right.
    group("freezer_door", "cabinet", [0, 1.53, 0.38]),
    node("freezer_panel", "freezer_door", "rounded_box", [0.76, 0.5, 0.06], [0, 0, 0], mat="white_enamel", color=BODY),
    node("freezer_gasket", "freezer_door", "rounded_box", [0.7, 0.44, 0.012], [0, 0, -0.035], mat="rubber", color="#d9d6cf"),
    node("freezer_handle", "freezer_door", "capsule", [0.025, 0.22], [-0.32, -0.1, 0.05], mat="plastic", color="#d0cfca"),
    group("fridge_door", "cabinet", [0, 0.68, 0.38]),
    node("fridge_panel", "fridge_door", "rounded_box", [0.76, 1.16, 0.06], [0, 0, 0], mat="white_enamel", color=BODY),
    node("door_gasket", "fridge_door", "rounded_box", [0.7, 1.1, 0.012], [0, 0, -0.035], mat="rubber", color="#d9d6cf"),
    node("door_bins", "fridge_door", "rounded_box", [0.6, 0.08, 0.1], [0, 0.2, -0.09], mat="clear", color="#e2edf2", repeat=[3, 0, -0.3, 0, 0]),
    node("fridge_handle", "fridge_door", "capsule", [0.025, 0.4], [-0.32, 0.3, 0.05], mat="plastic", color="#d0cfca"),
]

fridge_parts = [
    part("fridge_door", "Fridge door", "hinge", [0, 1, 0], 100, ["open", "close", "look"], ["door", "lower door"], pivot=[0.37, 0, 0], view=[-0.3, 0.4, 1]),
    part("freezer_door", "Freezer door", "hinge", [0, 1, 0], 100, ["open", "close", "look"], ["freezer"], pivot=[0.37, 0, 0], view=[-0.3, 0.5, 1]),
    part("door_gasket", "Door seal", "none", [0, 1, 0], 0, ["look", "clean"], ["gasket", "rubber seal"], view=[-0.6, 0.3, 1]),
    part("toe_grille", "Bottom grille", "slide", [0, 0, 1], 0.25, ["remove", "insert", "look"], ["kick plate", "front grille", "toe grille"], view=[0.3, 0.6, 1]),
    part("condenser_coils", "Coils", "none", [0, 1, 0], 0, ["look", "clean"], ["condenser coils", "black coils"], view=[0.2, 0.9, 0.8]),
    part("coil_dust", "Dust on the coils", "debris", [0, 0.3, 1], 0.35, ["clean", "look"], ["dust", "lint"], view=[0.2, 0.9, 0.8]),
    part("freezer_vent", "Freezer air vents", "none", [0, 1, 0], 0, ["look", "clean"], ["vents", "air slots"], view=[0.1, 0.2, 1]),
    part("defrost_drain", "Drain hole", "none", [0, 1, 0], 0, ["look", "clean"], ["defrost drain", "drain"], view=[0.1, 0.5, 1]),
    part("drain_clog", "Ice in the drain", "debris", [0, 0.4, 1], 0.2, ["clean", "look"], ["clog", "ice"], view=[0.1, 0.5, 1]),
    part("water_puddle", "Water puddle", "none", [0, 1, 0], 0, ["look", "clean"], ["water"], view=[0.1, 0.8, 1]),
    part("temperature_dial", "Temperature dial", "turn", [0, 0, 1], 70, ["turn", "look"], ["thermostat", "temp control"], view=[0.2, -0.2, 1]),
    part("water_filter", "Water filter", "twist", [0, 0, 1], 90, ["unlock", "remove", "insert", "lock", "look"], ["filter", "cartridge"], lift=0.22, view=[-0.2, -0.1, 1]),
    part("power_plug", "Power plug", "slide", [0, 0, 1], 0.15, ["remove", "insert", "look"], ["plug", "cord"], view=[0.6, 0.3, 1]),
]

MODELS["refrigerator"] = {"name": "Top-freezer refrigerator", "nodes": fridge_nodes, "parts": fridge_parts}

ENTRIES.append(entry(
    "refrigerator", "refrigerator", "Fridge", "fridge", "refrigerator",
    "Inside the fridge on the left wall, near the top or behind the crisper drawer.",
    [
        problem(
            "not_cold", "Not cold enough",
            ["The fridge isn't cold", "My fridge is warm but the freezer is cold", "Food is spoiling fast", "The fridge feels warm"],
            "The coils under the fridge get blanketed in dust, so it can't shed heat and runs warm. Blocked air vents inside do the same. Cleaning the coils and clearing the vents usually brings the cold back in a few hours.",
            [
                step("Unplug the fridge", "power plug", "The inside light stays off when you open the door.",
                     ["Pull the plug, not the cord.", "Food is fine for an hour with the doors shut."], "pull_out",
                     [("power_plug", "remove", "Unplug it")]),
                step("Pull off the grille at the bottom front", "bottom grille", "The grille is off and you can see under the fridge.",
                     ["It clips on; pull gently at both ends."], "pull_out", [("toe_grille", "remove", "Pull the grille off")]),
                step("Vacuum the dust off the coils", "coils", "The coils look black, not gray and fuzzy.",
                     ["Use the brush tool and go slowly.", "A flashlight helps you see to the back."], "none",
                     [("condenser_coils", "look", "The coils are under here"), ("coil_dust", "clean", "Vacuum the dust off")]),
                step("Clear the air vents in the freezer", "freezer air vents", "Nothing blocks the slots on the back wall.",
                     ["Move food back from the slots; air has to flow down to the fridge."], "none",
                     [("freezer_door", "open", "Open the freezer"), ("freezer_vent", "look", "Keep these slots clear"), ("freezer_door", "close", "Close it")]),
                step("Set the dial to the middle", "temperature dial", "The dial points at 3 to 4, or the middle mark.",
                     [], "none", [("fridge_door", "open", "Open the fridge"), ("temperature_dial", "turn", "Middle setting"), ("fridge_door", "close", "Close it")]),
                step("Grille back on, plug it in, wait 4 hours", "bottom grille", "The fridge hums and feels cold after a few hours.",
                     ["A glass of water on the middle shelf should read 37 to 40°F."], "push_in",
                     [("toe_grille", "insert", "Grille back on"), ("power_plug", "insert", "Plug it back in")]),
            ],
            "dusty coils", tools=["Vacuum with a brush tool", "Flashlight"], next="bad_door_seal",
            safety=["Unplug the fridge before you reach under it; the fan there can spin up."]),
        problem(
            "bad_door_seal", "Still warm with clean coils",
            ["Still warm with clean coils"],
            "With clean coils, the door seal is the next most likely cause: a gap lets warm air in all day. Cleaning the rubber and checking it grips fixes most of them.",
            [
                step("Close the door on a dollar bill", "door seal", "You feel the bill drag when you pull it out.",
                     ["Try the top, sides and bottom.", "If it slides out easily, the seal isn't gripping there."], "none",
                     [("fridge_door", "open", "Open the door"), ("door_gasket", "look", "Test the seal all around"), ("fridge_door", "close", "Close it on the bill")]),
                step("Wipe the seal with warm soapy water", "door seal", "The rubber is clean and not sticky.",
                     ["Sticky spills stop it sealing.", "Dry it after."], "none",
                     [("fridge_door", "open", "Open the door"), ("door_gasket", "clean", "Wipe the rubber")]),
                step("Close the door and test again", "fridge door", "The bill drags everywhere you test.",
                     ["A torn or flat seal can be replaced; search your model number + door gasket."], "none",
                     [("fridge_door", "close", "Close it")]),
            ],
            "a leaky door seal", tools=["Dollar bill", "Warm soapy water", "Cloth"]),
        problem(
            "water_inside", "Water in the bottom",
            ["There's water in the bottom of the fridge", "Water under the crisper drawers", "Ice on the back wall of the fridge", "The fridge is leaking water"],
            "The small drain at the back of the fridge is blocked with ice or crumbs, so defrost water pools instead of draining away. Clearing it with warm water fixes it.",
            [
                step("Open the fridge and take out the bottom drawers", "fridge door", "You can see the back wall at the bottom.",
                     [], "none", [("fridge_door", "open", "Open the fridge"), ("water_puddle", "look", "Water pools here")]),
                step("Soak up the water", "water puddle", "The floor of the fridge is dry.", ["Use a towel or sponge."], "none",
                     [("water_puddle", "clean", "Soak it up")]),
                step("Find the drain hole on the back wall", "drain hole", "You can see the small hole or channel.",
                     ["It's low on the back wall, sometimes under a cover."], "none", [("defrost_drain", "look", "The drain hole")]),
                step("Push warm water into the drain", "drain hole", "Water goes down the hole instead of pooling.",
                     ["Use a turkey baster or a squeeze bottle.", "A pipe cleaner loosens stuck crumbs."], "none",
                     [("drain_clog", "clean", "Flush the clog out")]),
                step("Put the drawers back and close the door", "fridge door", "The bottom stays dry over the next day.", [], "none",
                     [("fridge_door", "close", "Close it")]),
            ],
            "a blocked defrost drain", tools=["Towel", "Turkey baster or squeeze bottle", "Warm water"]),
        problem(
            "water_filter", "Water tastes bad or flows slow",
            ["The water from the fridge tastes bad", "The water dispenser is slow", "The filter light is on", "I need to change the fridge water filter"],
            "The water filter clogs after about six months, so water slows down and tastes off. Swapping it takes two minutes.",
            [
                step("Open the fridge and find the filter", "water filter", "You can see the filter cap.",
                     ["It's usually in the top right corner, or in the grille at the bottom."], "none",
                     [("fridge_door", "open", "Open the fridge"), ("water_filter", "look", "The water filter")]),
                step("Twist the old filter a quarter turn and pull", "water filter", "The old filter is out.",
                     ["A little water drips out; have a towel ready."], "twist_ccw",
                     [("water_filter", "unlock", "Quarter turn left"), ("water_filter", "remove", "Pull it out")]),
                step("Push the new filter in and twist to lock", "water filter", "It clicks and the cap lines up.",
                     ["Take the cap off the new one first.", "Match the model number on the old filter."], "twist_cw",
                     [("water_filter", "insert", "Push the new one in"), ("water_filter", "lock", "Twist to lock")]),
                step("Run 2 gallons through the dispenser", "dispenser", "Water runs clear and steady.",
                     ["The first water can be cloudy or sputter; that's air.", "Hold the filter reset button for 3 seconds if it has one."], "none",
                     [("fridge_door", "close", "Close the door")]),
            ],
            "an old water filter", tools=["Towel"], parts=["Water filter for your fridge (match the old one's number)"]),
        problem(
            "too_cold", "Freezing my food",
            ["The fridge is freezing my food", "Everything in the fridge is frozen", "Lettuce freezes in the fridge", "It's too cold"],
            "The dial is set too cold, or food is blocking the cold air coming down from the freezer onto it. Turning the dial warmer and moving food fixes it within a day.",
            [
                step("Turn the dial one step warmer", "temperature dial", "The dial is one number lower (warmer).",
                     ["On most fridges, a lower number is warmer."], "none",
                     [("fridge_door", "open", "Open the fridge"), ("temperature_dial", "turn", "One step warmer")]),
                step("Move food away from the top back", "shelves", "Nothing sits right under the cold air slot.",
                     ["Cold air pours in at the top back."], "none", [("freezer_vent", "look", "Cold air comes from here"), ("fridge_door", "close", "Close the door")]),
                step("Check again tomorrow", "fridge", "Food stays cold but doesn't freeze.",
                     ["37 to 40°F is right for a fridge."], "none", []),
            ],
            "the dial set too cold"),
    ],
))


# =====================================================================
# Smoke alarm on the ceiling: twist off the base, battery door, test button
# =====================================================================

alarm_nodes = [
    node("ceiling", "", "box", [1.2, 0.02, 1.0], [0, 2.4, 0], mat="white_enamel", color="#f1efea"),
    node("wall", "", "box", [1.2, 1.2, 0.02], [0, 1.8, -0.5], mat="white_enamel", color="#e9e5de"),
    node("crown", "", "box", [1.2, 0.04, 0.04], [0, 2.37, -0.48], mat="wood", color="#f5f3ee"),
    node("mount_plate", "", "cylinder", [0.12, 0.008], [0, 2.385, 0.05], mat="white_plastic", color="#f7f7f5"),
    group("smoke_alarm", "", [0, 2.355, 0.05]),
    node("alarm_body", "smoke_alarm", "lathe", [0, 1, 1], [0, 0, 0], mat="white_plastic", color="#fbfbfa",
         points=[[0.0, -0.022], [0.05, -0.022], [0.066, -0.016], [0.072, -0.004], [0.072, 0.022]]),
    node("vent_ring", "smoke_alarm", "torus", [0.11, 0.006], [0, -0.006, 0], rot=(90, 0, 0), mat="black_plastic", color="#cfd2d4"),
    node("led", "smoke_alarm", "sphere", [0.008], [0.03, -0.022, 0.02], mat="glow", color="#ff3b30"),
    group("test_button", "smoke_alarm", [0, -0.024, 0]),
    node("test_cap", "test_button", "cylinder", [0.03, 0.006], [0, 0, 0], mat="white_plastic", color="#e2e4e6"),
    node("alarm_label", "smoke_alarm", "label", [0.05, 0.012], [0, -0.0228, -0.035], rot=(90, 0, 0), mat="clear", text="PUSH TO TEST"),
    # The battery door on the side of the body; the 9-volt battery sits behind it.
    group("battery_door", "smoke_alarm", [0.066, 0.004, 0]),
    node("door_flap", "battery_door", "rounded_box", [0.012, 0.022, 0.05], [0, 0, 0], mat="white_plastic", color="#f2f2f0"),
    group("battery", "smoke_alarm", [0.045, 0.004, 0]),
    node("battery_body", "battery", "rounded_box", [0.026, 0.017, 0.048], [0, 0, 0], mat="painted_metal", color="#2b2b2b"),
    node("battery_band", "battery", "box", [0.027, 0.018, 0.012], [0, 0, 0.012], mat="painted_metal", color="#d4a82a"),
    # A little dust in the vents sets off false alarms.
    group("vent_dust", "smoke_alarm", [0, -0.008, 0.06]),
    node("dust_bits", "vent_dust", "clump", [0.03, 0.01, 0.015], [0, 0, 0], mat="lint", color="#9e968b"),
]

alarm_parts = [
    part("smoke_alarm", "Smoke alarm", "twist", [0, -1, 0], -40, ["unlock", "remove", "insert", "lock", "look"], ["alarm", "detector", "smoke detector", "CO alarm"], lift=0.08, view=[0.4, -0.7, 0.8]),
    part("test_button", "Test button", "press", [0, 1, 0], 0.004, ["press", "look"], ["test", "hush button", "silence button"], view=[0.3, -0.9, 0.5]),
    part("battery_door", "Battery door", "hinge", [0, 0, 1], -100, ["open", "close", "look"], ["battery cover", "battery drawer"], pivot=[0, -0.011, 0], view=[0.8, -0.5, 0.6]),
    part("battery", "Battery", "slide", [1, 0, 0], 0.07, ["remove", "insert", "look"], ["9-volt battery", "9V battery", "AA batteries"], view=[0.8, -0.5, 0.6]),
    part("vent_dust", "Dust in the vents", "debris", [0.4, -1, 0.4], 0.25, ["clean", "look"], ["dust", "cobweb"], view=[0.4, -0.8, 0.6]),
    part("led", "Red light", "none", [0, 1, 0], 0, ["look"], ["light", "LED"], view=[0.3, -0.9, 0.5]),
]

MODELS["smoke_alarm"] = {"name": "Ceiling smoke alarm", "nodes": alarm_nodes, "parts": alarm_parts}

ALARM_DOWN = [("smoke_alarm", "unlock", "Twist it left"), ("smoke_alarm", "remove", "Pull it down")]
ALARM_UP = [("smoke_alarm", "insert", "Line it up on the plate"), ("smoke_alarm", "lock", "Twist it right to lock")]

ENTRIES.append(entry(
    "smoke-alarm", "smoke alarm", "Smoke alarm", "smoke_alarm", "smoke_alarm",
    "On the back of the alarm, with the date it was made.",
    [
        problem(
            "chirping", "Chirping every minute",
            ["The smoke alarm keeps chirping", "A beep every minute", "My smoke detector chirps", "It beeps once in a while"],
            "One short chirp every 30 to 60 seconds means the battery is low. A fresh battery and a test stops it. Alarms older than 10 years chirp at the end of their life and need replacing.",
            [
                step("Stand on something steady under it", "step stool", "You can reach the alarm comfortably.",
                     ["Use a step stool, not a wobbly chair.", "Ask someone to hold it if you can."], "none", [("smoke_alarm", "look", "Stand steady underneath")]),
                step("Twist the alarm left and pull it down", "smoke alarm", "The alarm is off the ceiling in your hand.",
                     ["Turn it about an eighth of a turn.", "Some are wired: unclip the plug on the back."], "twist_ccw",
                     [("smoke_alarm", "unlock", "Twist it left"), ("smoke_alarm", "remove", "Pull it down")]),
                step("Swap in a new battery", "battery", "The new battery sits in with + and − matching the marks.",
                     ["Most take a 9-volt; check the label on the back.", "Check the date on the back: older than 10 years? Replace the whole alarm."], "none",
                     [("battery_door", "open", "Open the battery door"), ("battery", "remove", "Old battery out"), ("battery", "insert", "New battery in"), ("battery_door", "close", "Close the door")]),
                step("Twist it back onto the ceiling", "smoke alarm", "It's locked flat against the ceiling.", [], "twist_cw", ALARM_UP),
                step("Press and hold the test button", "test button", "It sounds a loud alarm, then stops.",
                     ["It's loud; cover your ear."], "press", [("test_button", "press", "Hold the test button")]),
            ],
            "a low battery", tools=["Step stool"], parts=["9-volt battery (or the type on the label)"],
            safety=["Never leave the alarm without a battery; replace it today."]),
        problem(
            "false_alarm", "Goes off when I cook",
            ["The smoke alarm goes off when I cook", "It goes off for no reason", "False alarms", "It beeps when I shower"],
            "Dust in the vents or an alarm too close to the stove or bathroom sets it off. Silence it, blow the dust out, and keep it at least 10 feet from the stove.",
            [
                step("If there's any real smoke or fire, get everyone out", "smoke alarm", "You've checked: it's only cooking smoke or steam.",
                     ["Call 911 from outside if you see flames or smell burning you can't explain."], "none", [("led", "look", "Check before you silence it")]),
                step("Press the button to hush it", "test button", "It goes quiet for a few minutes.",
                     ["Open a window and fan the smoke away."], "press", [("test_button", "press", "Press to hush")]),
                step("Take it down and blow the dust out", "dust in the vents", "The vents look clean.",
                     ["Use a vacuum brush or a can of air around the slots."], "none", ALARM_DOWN + [("vent_dust", "clean", "Blow the dust out")]),
                step("Put it back and test it", "test button", "It locks on and sounds when tested.",
                     ["If it's within 10 feet of the stove, a photoelectric alarm or moving it helps."], "press", ALARM_UP + [("test_button", "press", "Test it")]),
            ],
            "dust in the sensor", tools=["Step stool", "Vacuum brush or can of air"],
            safety=["Never take the battery out to stop false alarms."]),
        problem(
            "test_fails", "Doesn't beep when tested",
            ["The smoke alarm doesn't work", "Nothing happens when I press test", "It's silent when I test it"],
            "A silent test usually means a dead or missing battery, or the alarm is past its 10-year life. A fresh battery tells you which.",
            [
                step("Take the alarm down", "smoke alarm", "It's in your hand.", [], "twist_ccw", ALARM_DOWN),
                step("Put in a brand new battery", "battery", "A new battery is in, facing the right way.",
                     ["Check the date on the back while it's down."], "none",
                     [("battery_door", "open", "Open the door"), ("battery", "remove", "Old one out"), ("battery", "insert", "New one in"), ("battery_door", "close", "Close it")]),
                step("Put it back and test", "test button", "It sounds loudly.",
                     ["Still silent, or older than 10 years: replace the alarm today."], "press", ALARM_UP + [("test_button", "press", "Test it")]),
            ],
            "a dead battery", tools=["Step stool"], parts=["9-volt battery", "A new smoke alarm if it's over 10 years old"]),
    ],
))


# =====================================================================
# Kitchen outlet (GFCI) and the breaker panel
# =====================================================================

outlet_nodes = room(width=1.6, wall_height=1.8, wall_z=-0.3) + [
    node("counter", "", "box", [0.8, 0.04, 0.5], [-0.35, 0.9, -0.05], mat="ceramic", color="#e8e2d6"),
    node("counter_cabinet", "", "box", [0.8, 0.86, 0.48], [-0.35, 0.45, -0.06], mat="wood", color="#d8ccb6"),
    node("backsplash", "", "box", [0.8, 0.45, 0.01], [-0.35, 1.15, -0.29], mat="ceramic", color="#f3efe7"),
    # The GFCI outlet with TEST and RESET buttons, and the toaster that stopped.
    group("gfci_outlet", "", [-0.45, 1.08, -0.282]),
    node("gfci_plate", "gfci_outlet", "rounded_box", [0.075, 0.12, 0.008], [0, 0, 0], mat="white_plastic"),
    node("gfci_face", "gfci_outlet", "rounded_box", [0.045, 0.1, 0.01], [0, 0, 0.004], mat="white_plastic", color="#f7f7f4"),
    node("slots_top", "gfci_outlet", "box", [0.02, 0.006, 0.002], [0, 0.035, 0.01], mat="black_plastic"),
    node("slots_bottom", "gfci_outlet", "box", [0.02, 0.006, 0.002], [0, -0.035, 0.01], mat="black_plastic"),
    group("test_button", "gfci_outlet", [0, 0.008, 0.01]),
    node("test_key", "test_button", "rounded_box", [0.018, 0.009, 0.004], [0, 0, 0], mat="black_plastic"),
    group("reset_button", "gfci_outlet", [0, -0.008, 0.01]),
    node("reset_key", "reset_button", "rounded_box", [0.018, 0.009, 0.004], [0, 0, 0], mat="plastic", color="#d33a2c"),
    node("toaster", "", "rounded_box", [0.26, 0.18, 0.15], [-0.15, 1.01, -0.1], mat="stainless"),
    node("toaster_cord", "", "hose", [0.008], [0, 0, 0], mat="black_plastic", points=[[-0.25, 0.94, -0.17], [-0.36, 0.93, -0.25], [-0.43, 1.03, -0.275]]),
    # Breaker panel on the wall to the right.
    group("panel", "", [0.45, 1.25, -0.29]),
    node("panel_box", "panel", "rounded_box", [0.36, 0.6, 0.08], [0, 0, 0.04], mat="painted_metal", color="#bfc3c6"),
    node("panel_dead_front", "panel", "box", [0.3, 0.52, 0.005], [0, 0, 0.082], mat="painted_metal", color="#d5d8da"),
    node("breakers_left", "panel", "rounded_box", [0.1, 0.035, 0.03], [-0.065, 0.2, 0.095], mat="black_plastic", repeat=[8, 0, -0.05, 0, 0]),
    node("breakers_right", "panel", "rounded_box", [0.1, 0.035, 0.03], [0.065, 0.2, 0.095], mat="black_plastic", repeat=[3, 0, -0.05, 0, 0]),
    node("breakers_right_low", "panel", "rounded_box", [0.1, 0.035, 0.03], [0.065, -0.05, 0.095], mat="black_plastic", repeat=[4, 0, -0.05, 0, 0]),
    group("tripped_breaker", "panel", [0.065, 0.05, 0.095]),
    node("tripped_body", "tripped_breaker", "rounded_box", [0.1, 0.035, 0.03], [0, 0, 0], mat="black_plastic"),
    node("tripped_flag", "tripped_breaker", "box", [0.01, 0.02, 0.012], [0.02, 0, 0.018], mat="plastic", color="#e2462f"),
    node("panel_label", "panel", "label", [0.08, 0.03], [-0.11, 0.255, 0.087], mat="clear", text="KITCHEN 20A"),
    group("panel_door", "panel", [0, 0, 0.09]),
    node("door_sheet", "panel_door", "rounded_box", [0.36, 0.6, 0.012], [0, 0, 0], mat="painted_metal", color="#c9cdd0"),
    node("door_latch", "panel_door", "rounded_box", [0.02, 0.06, 0.012], [-0.15, 0, 0.01], mat="chrome"),
]

outlet_parts = [
    part("gfci_outlet", "Outlet", "none", [0, 1, 0], 0, ["look"], ["GFCI outlet", "plug", "socket", "receptacle"], view=[0.2, 0.3, 1]),
    part("test_button", "TEST button", "press", [0, 0, -1], 0.003, ["press", "look"], ["test"], view=[0.1, 0.1, 1]),
    part("reset_button", "RESET button", "press", [0, 0, -1], 0.003, ["press", "look"], ["reset", "red button"], view=[0.1, 0.1, 1]),
    part("toaster", "Toaster", "none", [0, 1, 0], 0, ["look"], ["appliance", "kettle"], view=[0.3, 0.5, 1]),
    part("panel_door", "Panel door", "hinge", [0, 1, 0], 110, ["open", "close", "look"], ["breaker box door", "panel cover"], pivot=[0.18, 0, 0], view=[-0.3, 0.2, 1]),
    part("tripped_breaker", "Tripped breaker", "hinge", [1, 0, 0], -30, ["open", "close", "look"], ["breaker", "switch in the panel"], pivot=[0, 0, -0.015], view=[0.2, 0.2, 1], rest=0.5),
    part("panel_label", "Breaker labels", "none", [0, 1, 0], 0, ["look"], ["labels", "panel map"], view=[0.1, 0.1, 1]),
]

MODELS["outlet_breaker"] = {"name": "Kitchen outlet and breaker panel", "nodes": outlet_nodes, "parts": outlet_parts}

ENTRIES.append(entry(
    "outlet-breaker", "outlet", "Outlet or lights out", "outlet", "outlet_breaker",
    "The breaker panel door has a list of what each breaker feeds.",
    [
        problem(
            "outlet_dead", "An outlet stopped working",
            ["An outlet stopped working", "Nothing works when I plug it in", "The kitchen outlets are dead", "The bathroom plug has no power"],
            "Kitchen, bathroom, garage and outdoor outlets are protected by a GFCI outlet with TEST and RESET buttons. When it trips, it cuts that outlet and others down the line. Pressing RESET almost always brings them back.",
            [
                step("Unplug what you were using", "toaster", "Nothing is plugged into the dead outlet.",
                     ["The thing you plugged in may be what tripped it."], "pull_out", [("toaster", "look", "Unplug it first")]),
                step("Find the outlet with TEST and RESET buttons", "outlet", "You've found it; it can be a few feet away from the dead one.",
                     ["Check kitchen, bathroom, garage and outside outlets."], "none", [("gfci_outlet", "look", "The one with buttons")]),
                step("Press RESET firmly until it clicks", "RESET button", "It clicks and stays in.",
                     ["If it won't stay in, the power may be off at the breaker."], "press", [("reset_button", "press", "Press RESET hard")]),
                step("Plug in a lamp or phone charger to test", "outlet", "It has power.",
                     ["Test the dead outlet, not just the GFCI."], "push_in", [("gfci_outlet", "look", "Test with a lamp")]),
            ],
            "a tripped GFCI outlet", tools=["A lamp or phone charger to test"], next="breaker_tripped",
            safety=["Keep hands dry and stay away from water when pressing the buttons.", "If an outlet is warm, scorched or smells burnt, leave it off and call an electrician."]),
        problem(
            "breaker_tripped", "Still dead after RESET",
            ["Still dead after RESET"],
            "If RESET didn't help, the breaker for that circuit has probably tripped. A tripped breaker sits in the middle, not fully on, and has to go all the way off before it goes back on.",
            [
                step("Open the breaker panel door", "panel door", "You can see the rows of breakers.",
                     ["It's often in the garage, basement or a hall closet."], "none", [("panel_door", "open", "Open the panel")]),
                step("Find the breaker that's in the middle", "tripped breaker", "You can see one breaker out of line with the rest.",
                     ["It may show a red or orange flag.", "The label list on the door helps."], "none",
                     [("tripped_breaker", "look", "This one is out of line"), ("panel_label", "look", "Labels help")]),
                step("Push it fully OFF, then back ON", "tripped breaker", "It clicks into the ON position and stays.",
                     ["Push firmly; you'll feel it reset.", "Stand to the side of the panel as you flip it."], "none",
                     [("tripped_breaker", "close", "All the way off"), ("tripped_breaker", "open", "Then back on")]),
                step("Close the panel and test the outlet", "outlet", "The outlet works again.",
                     ["If it trips again right away, leave it off and call an electrician."], "none",
                     [("panel_door", "close", "Close the panel"), ("gfci_outlet", "look", "Test the outlet")]),
            ],
            "a tripped breaker",
            safety=["Never remove the panel's inner cover; only touch the breaker switches.", "If a breaker trips again right away, stop and call an electrician."]),
        problem(
            "breaker_keeps_tripping", "Breaker keeps tripping",
            ["The breaker keeps tripping", "The power keeps going out in one room", "It trips when I use the microwave and toaster"],
            "A breaker that trips when several things run at once is overloaded: too many heaters, kettles or microwaves on one circuit. Spreading them out stops it. If it trips with nothing plugged in, that's a wiring fault for an electrician.",
            [
                step("Unplug the big heat makers on that circuit", "toaster", "Space heaters, kettles, toasters and hair dryers are unplugged.",
                     ["Anything that heats draws the most power."], "pull_out", [("toaster", "look", "Unplug the heaters")]),
                step("Reset the breaker: fully off, then on", "tripped breaker", "It stays on.", [], "none",
                     [("panel_door", "open", "Open the panel"), ("tripped_breaker", "close", "Fully off"), ("tripped_breaker", "open", "Then on"), ("panel_door", "close", "Close it")]),
                step("Plug things back in one at a time", "outlet", "You know which combination trips it.",
                     ["Move heaters and kettles to outlets on another circuit."], "none", [("gfci_outlet", "look", "One at a time")]),
            ],
            "an overloaded circuit",
            safety=["If it trips with nothing plugged in, or you smell burning, call an electrician."]),
    ],
))


# =====================================================================
# Furnace filter and the thermostat
# =====================================================================

furnace_nodes = room(width=1.8, wall_height=1.9, wall="#e3ded5", floor="#c9c3b8", wall_z=-0.45) + [
    group("furnace", "", [-0.25, 0, -0.1]),
    node("cabinet_body", "furnace", "box", [0.55, 1.2, 0.7], [0, 0.65, 0], mat="painted_metal", color="#c7c9c6"),
    node("base_return", "furnace", "box", [0.55, 0.05, 0.7], [0, 0.025, 0], mat="painted_metal", color="#9fa3a2"),
    node("duct_top", "furnace", "box", [0.45, 0.45, 0.55], [0, 1.47, 0], mat="foil", color="#cfd3d6"),
    node("duct_up", "furnace", "box", [0.3, 0.6, 0.3], [0, 1.97, -0.1], mat="foil", color="#cfd3d6"),
    node("upper_door", "furnace", "box", [0.5, 0.5, 0.01], [0, 0.93, 0.355], mat="painted_metal", color="#d7d9d6"),
    node("lower_door", "furnace", "box", [0.5, 0.45, 0.01], [0, 0.4, 0.355], mat="painted_metal", color="#d7d9d6"),
    node("sight_glass", "furnace", "rounded_box", [0.06, 0.04, 0.012], [0, 0.4, 0.362], mat="glass"),
    node("warning_label", "furnace", "label", [0.12, 0.05], [0.12, 1.05, 0.362], mat="white_plastic", text="WARNING"),
    # The filter slides into a slot on the side, at the bottom where air comes in.
    node("filter_slot", "furnace", "box", [0.02, 0.06, 0.68], [0.285, 0.18, 0], mat="painted_metal", color="#8e9392"),
    group("air_filter", "furnace", [0.29, 0.18, 0]),
    node("filter_frame", "air_filter", "box", [0.025, 0.4, 0.62], [0, 0.0, 0], rot=(0, 0, 0), mat="cardboard"),
    node("filter_media", "air_filter", "box", [0.027, 0.36, 0.58], [0, 0, 0], mat="pleated_filter", color="#efe9dc"),
    group("filter_dust", "air_filter", [0.016, 0, 0]),
    node("filter_grime", "filter_dust", "box", [0.004, 0.34, 0.56], [0, 0, 0], mat="grime", color="#7d7464"),
    node("airflow_arrow", "air_filter", "label", [0.12, 0.05], [0.016, 0.1, 0.15], rot=(0, 90, 0), mat="clear", text="AIRFLOW →"),
    # The furnace power switch on the wall beside it, like a light switch.
    group("furnace_switch", "", [0.25, 1.3, -0.44]),
    node("switch_plate", "furnace_switch", "rounded_box", [0.07, 0.11, 0.008], [0, 0, 0], mat="white_plastic"),
    group("switch_toggle", "furnace_switch", [0, 0, 0.006]),
    node("toggle", "switch_toggle", "rounded_box", [0.014, 0.03, 0.012], [0, 0, 0.004], mat="white_plastic", color="#f7f5ef"),
    node("switch_label", "furnace_switch", "label", [0.07, 0.02], [0, 0.075, 0.002], mat="clear", text="FURNACE", color="#c22"),
    # The thermostat on the wall.
    group("thermostat", "", [0.55, 1.45, -0.44]),
    node("stat_base", "thermostat", "rounded_box", [0.13, 0.1, 0.02], [0, 0, 0.01], mat="white_plastic"),
    group("stat_cover", "thermostat", [0, 0, 0.025]),
    node("stat_face", "stat_cover", "rounded_box", [0.125, 0.095, 0.015], [0, 0, 0], mat="white_plastic", color="#f9f9f7"),
    node("stat_screen", "stat_cover", "rounded_box", [0.07, 0.04, 0.003], [0, 0.012, 0.008], mat="glass", color="#9fb7a8"),
    node("stat_reading", "stat_cover", "label", [0.05, 0.025], [0, 0.012, 0.0102], mat="clear", text="68°"),
    group("mode_switch", "stat_cover", [-0.035, -0.03, 0.008]),
    node("mode_key", "mode_switch", "rounded_box", [0.018, 0.01, 0.004], [0, 0, 0], mat="plastic", color="#9aa0a6"),
    group("temp_up", "stat_cover", [0.03, -0.03, 0.008]),
    node("up_key", "temp_up", "rounded_box", [0.016, 0.01, 0.004], [0, 0, 0], mat="plastic", color="#9aa0a6"),
    group("stat_batteries", "thermostat", [0, -0.01, 0.019]),
    node("aa_pair", "stat_batteries", "capsule", [0.014, 0.05], [0, 0, 0], rot=(0, 0, 90), mat="painted_metal", color="#2b2b2b", repeat=[2, 0, 0.018, 0, 0]),
]

furnace_parts = [
    part("air_filter", "Air filter", "slide", [1, 0, 0], 0.55, ["remove", "insert", "look"], ["furnace filter", "HVAC filter", "return filter"], view=[1, 0.4, 0.6]),
    part("filter_dust", "Dirty filter", "debris", [1, 0.4, 0.4], 0.2, ["clean", "look"], ["dust"], view=[1, 0.4, 0.6]),
    part("airflow_arrow", "Airflow arrow", "none", [0, 1, 0], 0, ["look"], ["arrow"], view=[1, 0.3, 0.3]),
    part("furnace_switch", "Furnace switch", "none", [0, 1, 0], 0, ["look"], ["power switch", "service switch"], view=[0.1, 0.1, 1]),
    part("switch_toggle", "Switch", "hinge", [1, 0, 0], 40, ["open", "close", "look"], ["toggle"], pivot=[0, 0, 0], view=[0.2, 0.1, 1], rest=1),
    part("thermostat", "Thermostat", "none", [0, 1, 0], 0, ["look"], ["thermostat"], view=[0.1, 0.1, 1]),
    part("stat_cover", "Thermostat cover", "slide", [0, 0, 1], 0.12, ["remove", "insert", "look"], ["faceplate", "front"], view=[0.3, 0.1, 1]),
    part("stat_batteries", "Batteries", "slide", [0, 0, 1], 0.08, ["remove", "insert", "look"], ["AA batteries", "AAA batteries"], view=[0.3, 0.1, 1]),
    part("mode_switch", "Mode switch", "press", [0, 0, -1], 0.003, ["press", "look"], ["heat/cool switch", "mode button"], view=[0.1, 0.1, 1]),
    part("temp_up", "Up button", "press", [0, 0, -1], 0.003, ["press", "look"], ["temperature up", "arrow"], view=[0.1, 0.1, 1]),
    part("lower_door", "Furnace door", "none", [0, 1, 0], 0, ["look"], ["blower door", "front panel"], view=[0.3, 0.4, 1]),
]

MODELS["furnace"] = {"name": "Furnace and thermostat", "nodes": furnace_nodes, "parts": furnace_parts}

ENTRIES.append(entry(
    "furnace-hvac", "furnace", "Heat and AC", "hvac", "furnace",
    "On the inside of the furnace's lower door, with the filter size printed on the old filter's frame.",
    [
        problem(
            "no_heat_or_ac", "Heat or AC won't come on",
            ["The heat won't come on", "The AC isn't running", "The furnace won't turn on", "The thermostat screen is blank"],
            "Most no-heat calls are the thermostat: dead batteries, the wrong mode, or a setting below the room temperature. The next is the furnace's own power switch, which looks like a light switch and gets flipped off by accident.",
            [
                step("Check the thermostat is on HEAT (or COOL)", "thermostat", "It shows HEAT and a target above the room temperature.",
                     ["Set it 5 degrees above the room for heat, below for AC."], "none",
                     [("thermostat", "look", "Check the mode"), ("mode_switch", "press", "Set HEAT or COOL"), ("temp_up", "press", "Raise the setting")]),
                step("Blank screen? Put in fresh batteries", "batteries", "The screen lights up.",
                     ["Pull the cover straight off; most take two AA or AAA."], "none",
                     [("stat_cover", "remove", "Pull the cover off"), ("stat_batteries", "remove", "Old batteries out"), ("stat_batteries", "insert", "New ones in"), ("stat_cover", "insert", "Cover back on")]),
                step("Make sure the furnace switch is ON", "furnace switch", "The switch near the furnace is up (on).",
                     ["It looks like a light switch, often with a red plate."], "none",
                     [("furnace_switch", "look", "The furnace switch"), ("switch_toggle", "look", "Make sure it's up")]),
                step("Wait 5 minutes and listen", "furnace", "You hear it start and feel air from the vents.",
                     ["Furnaces wait a few minutes before they fire."], "none", [("lower_door", "look", "It should start in a few minutes")]),
            ],
            "the thermostat or a switched-off furnace", tools=["AA or AAA batteries"], next="dirty_filter",
            safety=["If you smell gas, leave the house now and call the gas company from outside."]),
        problem(
            "dirty_filter", "Weak air or the house won't warm up",
            ["Weak air from the vents", "The house isn't getting warm", "The AC runs but it's not cooling well", "Time to change the furnace filter", "Still not heating with the thermostat set right"],
            "A clogged air filter starves the system of air, so it blows weakly, runs all day and can shut itself off. Filters should be changed every 1 to 3 months. A new one costs a few dollars and takes two minutes.",
            [
                step("Turn the thermostat off", "thermostat", "The system is off.", ["So it doesn't pull dust while the filter is out."], "none",
                     [("thermostat", "look", "Set it to OFF"), ("mode_switch", "press", "Off")]),
                step("Slide the old filter out of its slot", "air filter", "The old filter is out.",
                     ["The slot is low on the side of the furnace, or behind a grille on a wall or ceiling."], "pull_out",
                     [("air_filter", "remove", "Slide it out")]),
                step("Check the size printed on its frame", "air filter", "You know the size, like 16x25x1.",
                     ["A gray, dusty filter is overdue."], "none", [("filter_dust", "look", "Gray means overdue"), ("airflow_arrow", "look", "Size and arrow are printed here")]),
                step("Slide the new one in, arrow toward the furnace", "airflow arrow", "The filter is all the way in and the arrow points into the furnace.",
                     ["The arrow shows which way the air flows."], "push_in", [("filter_dust", "clean", "Swap for a clean one"), ("air_filter", "insert", "Slide the new one in")]),
                step("Turn the thermostat back on", "thermostat", "Air from the vents feels strong.",
                     ["Write the date on the filter's frame."], "none", [("mode_switch", "press", "Back to HEAT or COOL")]),
            ],
            "a clogged air filter", parts=["Air filter, the same size as the old one"]),
    ],
))


# =====================================================================
# Shower head: vinegar soak, thread tape
# =====================================================================

shower_nodes = [
    node("tile_wall", "", "box", [1.2, 1.4, 0.02], [0, 1.4, -0.3], mat="ceramic", color="#e9eef0"),
    node("tile_side", "", "box", [0.02, 1.4, 0.8], [-0.6, 1.4, 0.1], mat="ceramic", color="#e3e9ec"),
    node("tub", "", "box", [1.2, 0.5, 0.8], [0, 0.25, 0.1], mat="white_enamel", color="#f7f7f5"),
    node("tub_inside", "", "box", [1.05, 0.02, 0.65], [0, 0.48, 0.1], mat="white_enamel", color="#eef0f0"),
    node("valve_trim", "", "cylinder", [0.18, 0.012], [0, 1.25, -0.288], rot=(90, 0, 0), mat=CHROME),
    group("shower_valve", "", [0, 1.25, -0.27]),
    node("valve_lever", "shower_valve", "capsule", [0.025, 0.14], [0.05, 0, 0.02], rot=(0, 0, 90), mat=CHROME),
    node("arm_flange", "", "cylinder", [0.07, 0.012], [0, 1.9, -0.288], rot=(90, 0, 0), mat=CHROME),
    node("shower_arm", "", "hose", [0.022], [0, 0, 0], mat=CHROME, points=[[0, 1.9, -0.29], [0, 1.9, -0.18], [0, 1.85, -0.1]]),
    group("arm_threads", "", [0, 1.85, -0.1]),
    node("thread_tape", "arm_threads", "cylinder", [0.024, 0.02], [0, 0, 0], rot=(-45, 0, 0), mat="white_plastic", color="#ffffff"),
    group("shower_head", "", [0, 1.83, -0.08]),
    node("head_neck", "shower_head", "cylinder", [0.035, 0.05, 0.03], [0, 0.0, 0.0], rot=(-45, 0, 0), mat=CHROME),
    node("head_dish", "shower_head", "lathe", [0, 1, 1], [0, -0.035, 0.035], rot=(-45, 0, 0), mat=CHROME,
         points=[[0.015, 0.04], [0.04, 0.02], [0.06, 0.0], [0.062, -0.01], [0.0, -0.012]]),
    node("nozzle_face", "shower_head", "cylinder", [0.1, 0.004], [0, -0.042, 0.042], rot=(-45, 0, 0), mat="rubber", color="#5c6166"),
    group("nozzle_scale", "shower_head", [0, -0.046, 0.046]),
    node("scale_crust", "nozzle_scale", "cylinder", [0.09, 0.004], [0, 0, 0], rot=(-45, 0, 0), mat="mineral_scale"),
    group("vinegar_bag", "", [0, 1.75, 0.3]),
    node("bag", "vinegar_bag", "sphere", [0.16, 0.18, 0.14], [0, 0, 0], mat="clear", color="#e8f1f4"),
    node("bag_vinegar", "vinegar_bag", "sphere", [0.13, 0.08, 0.11], [0, -0.04, 0], mat="water"),
    node("bag_band", "vinegar_bag", "torus", [0.05, 0.008], [0, 0.085, 0], rot=(90, 0, 0), mat="rubber", color="#d84a3a"),
]

shower_parts = [
    part("shower_head", "Shower head", "twist", [0, -0.7, 0.7], -360, ["unlock", "remove", "insert", "lock", "look"], ["head", "spray head"], lift=0.06, view=[0.6, 0.2, 1]),
    part("nozzle_scale", "Mineral buildup", "debris", [0, -0.6, 0.8], 0.15, ["clean", "look"], ["scale", "white crust", "clogged nozzles"], view=[0.3, -0.5, 1]),
    part("vinegar_bag", "Bag of vinegar", "slide", [0, -0.25, 0.38], 1, ["insert", "remove", "look"], ["vinegar", "plastic bag"], rest=1, view=[0.5, 0.2, 1]),
    part("arm_threads", "Arm threads", "none", [0, 1, 0], 0, ["look", "clean"], ["threads", "thread tape", "plumber's tape"], view=[0.6, 0.2, 1]),
    part("shower_valve", "Shower handle", "hinge", [0, 0, 1], 60, ["open", "close", "look"], ["handle", "valve", "faucet"], pivot=[0, 0, 0], view=[0.3, 0.2, 1]),
    part("shower_arm", "Shower arm", "none", [0, 1, 0], 0, ["look"], ["pipe", "arm"], view=[0.6, 0.2, 1]),
]

MODELS["shower_head"] = {"name": "Shower head", "nodes": shower_nodes, "parts": shower_parts}

ENTRIES.append(entry(
    "shower-head", "shower head", "Shower", "shower", "shower_head",
    "Brand is usually stamped on the shower head's face or neck.",
    [
        problem(
            "weak_spray", "Weak or sputtering spray",
            ["The shower pressure is weak", "The shower head sprays sideways", "Only some holes spray", "The shower sputters"],
            "Hard water leaves white mineral crust in the tiny nozzles, so they clog one by one. Soaking the head in vinegar overnight dissolves it, no tools needed.",
            [
                step("Fill a plastic bag halfway with white vinegar", "bag of vinegar", "The bag has enough vinegar to cover the nozzles.", [], "none",
                     [("vinegar_bag", "look", "Half a bag of vinegar")]),
                step("Slip it over the head and band it on", "shower head", "The nozzles sit in the vinegar.",
                     ["A rubber band or twist tie holds it to the arm."], "none", [("vinegar_bag", "insert", "Bag over the head")]),
                step("Leave it for a few hours or overnight", "mineral buildup", "The white crust has softened.",
                     ["Skip the soak for gold or brass finishes: 30 minutes only."], "none", [("nozzle_scale", "clean", "The vinegar eats the crust")]),
                step("Take the bag off and rub the nozzles", "nozzles", "The rubber nozzles are clean.",
                     ["Rub each rubber nub with your thumb or an old toothbrush."], "none", [("vinegar_bag", "remove", "Bag off")]),
                step("Run hot water for a minute", "shower handle", "A strong, even spray.", [], "none",
                     [("shower_valve", "open", "Water on"), ("shower_head", "look", "Strong, even spray"), ("shower_valve", "close", "Water off")]),
            ],
            "mineral buildup in the nozzles", tools=["Plastic bag", "White vinegar", "Rubber band", "Old toothbrush"]),
        problem(
            "leaks_at_arm", "Leaks where the head meets the pipe",
            ["The shower head leaks at the pipe", "Water sprays from behind the shower head", "It drips from the connection"],
            "Water escaping where the head screws on means the thread seal has worn out. Wrapping the pipe threads with plumber's tape seals it again.",
            [
                step("Unscrew the shower head by hand", "shower head", "The head is off.",
                     ["Turn it to the left. Use a cloth and pliers only if it's stuck."], "twist_ccw",
                     [("shower_head", "unlock", "Turn it left"), ("shower_head", "remove", "Take it off")]),
                step("Wipe off the old tape", "arm threads", "The threads are bare and clean.", [], "none",
                     [("arm_threads", "clean", "Wipe the old tape off")]),
                step("Wrap new tape 3 times clockwise", "arm threads", "Tape covers the threads, wrapped clockwise.",
                     ["Clockwise as you face the end of the pipe, so screwing on doesn't unroll it."], "none",
                     [("arm_threads", "look", "Wrap the tape here")]),
                step("Screw the head back on hand tight", "shower head", "It's snug.",
                     ["Check the rubber washer is inside the head."], "twist_cw",
                     [("shower_head", "insert", "Put it back"), ("shower_head", "lock", "Screw it on")]),
                step("Run the water and check for drips", "shower head", "No water leaks at the connection.", [], "none",
                     [("shower_valve", "open", "Water on"), ("arm_threads", "look", "No drips"), ("shower_valve", "close", "Water off")]),
            ],
            "worn thread tape", tools=["Plumber's tape (PTFE)", "Cloth", "Pliers (only if stuck)"]),
    ],
))


# =====================================================================
# Interior door: hinges, pins, latch, strike plate
# =====================================================================

door_nodes = room(width=1.6, wall_height=2.2, wall_z=-0.05, depth=1.2) + [
    node("frame_left", "", "box", [0.06, 2.06, 0.12], [-0.46, 1.03, -0.05], mat="white_enamel", color="#f3efe6"),
    node("frame_right", "", "box", [0.06, 2.06, 0.12], [0.46, 1.03, -0.05], mat="white_enamel", color="#f3efe6"),
    node("frame_top", "", "box", [0.98, 0.06, 0.12], [0, 2.09, -0.05], mat="white_enamel", color="#f3efe6"),
    group("strike_plate", "", [0.43, 0.95, -0.02]),
    node("strike_metal", "strike_plate", "rounded_box", [0.012, 0.11, 0.03], [0, 0, 0], mat="brass"),
    group("hinge_top", "", [-0.415, 1.8, 0.03]),
    node("hinge_top_leaf", "hinge_top", "box", [0.04, 0.1, 0.006], [0, 0, 0], mat="brass"),
    node("hinge_top_barrel", "hinge_top", "cylinder", [0.014, 0.1], [0, 0, 0.006], mat="brass"),
    group("hinge_pin", "hinge_top", [0, 0.06, 0.006]),
    node("pin_head", "hinge_pin", "cylinder", [0.016, 0.01], [0, 0, 0], mat="brass"),
    node("pin_shaft", "hinge_pin", "cylinder", [0.006, 0.1], [0, -0.05, 0], mat="brass"),
    group("hinge_screws", "hinge_top", [0.01, 0, 0.004]),
    node("screw_heads", "hinge_screws", "cylinder", [0.009, 0.004], [0, 0.03, 0], rot=(90, 0, 0), mat="brass", repeat=[3, 0, -0.03, 0, 0]),
    group("hinge_bottom", "", [-0.415, 0.25, 0.03]),
    node("hinge_bottom_leaf", "hinge_bottom", "box", [0.04, 0.1, 0.006], [0, 0, 0], mat="brass"),
    node("hinge_bottom_barrel", "hinge_bottom", "cylinder", [0.014, 0.1], [0, 0, 0.006], mat="brass"),
    group("door", "", [-0.425, 1.03, 0.0]),
    node("door_slab", "door", "rounded_box", [0.82, 2.02, 0.04], [0.43, 0, -0.012], mat="white_enamel", color="#faf8f3"),
    node("panel_upper", "door", "rounded_box", [0.6, 0.8, 0.006], [0.42, 0.5, 0.022], mat="white_enamel", color="#efebe3"),
    node("panel_lower", "door", "rounded_box", [0.6, 0.7, 0.006], [0.42, -0.5, 0.022], mat="white_enamel", color="#efebe3"),
    group("door_knob", "door", [0.76, -0.08, 0.02]),
    node("knob_rose", "door_knob", "cylinder", [0.06, 0.01], [0, 0, 0.005], rot=(90, 0, 0), mat="brass"),
    node("knob_ball", "door_knob", "sphere", [0.055, 0.055, 0.045], [0, 0, 0.045], mat="brass"),
    group("latch", "door", [0.84, -0.08, 0]),
    node("latch_bolt", "latch", "rounded_box", [0.025, 0.02, 0.016], [0, 0, 0], mat="brass"),
    node("oil_can", "", "cylinder", [0.06, 0.12, 0.07], [-0.62, 0.06, 0.4], mat="painted_metal", color="#2e7d4f"),
    node("oil_can_label", "", "label", [0.05, 0.03], [-0.62, 0.07, 0.436], mat="clear", text="OIL", color="#ffffff"),
]

door_parts = [
    part("door", "Door", "hinge", [0, 1, 0], -70, ["open", "close", "look"], ["door"], pivot=[0, 0, 0], view=[0.4, 0.2, 1]),
    part("hinge_pin", "Hinge pin", "slide", [0, 1, 0], 0.09, ["remove", "insert", "look"], ["pin"], view=[0.4, 0.1, 1]),
    part("hinge_top", "Top hinge", "none", [0, 1, 0], 0, ["look", "clean"], ["hinge"], view=[0.4, 0.1, 1]),
    part("hinge_screws", "Hinge screws", "turn", [0, 0, 1], 180, ["turn", "look"], ["screws"], view=[0.3, 0.1, 1]),
    part("strike_plate", "Strike plate", "none", [0, 1, 0], 0, ["look"], ["strike", "latch plate", "metal plate on the frame"], view=[-0.5, 0.1, 1]),
    part("latch", "Latch", "press", [-1, 0, 0], 0.012, ["press", "look"], ["latch bolt", "tongue"], view=[0.8, 0.1, 0.6]),
    part("door_knob", "Door knob", "turn", [0, 0, 1], 50, ["turn", "look"], ["handle", "knob"], view=[0.3, 0.1, 1]),
    part("oil_can", "Oil", "none", [0, 1, 0], 0, ["look"], ["lubricant", "WD-40", "grease"], view=[0.4, 0.5, 1]),
]

MODELS["interior_door"] = {"name": "Interior door", "nodes": door_nodes, "parts": door_parts}

ENTRIES.append(entry(
    "interior-door", "door", "Door", "door", "interior_door",
    "No sticker needed.",
    [
        problem(
            "squeaky", "Squeaks",
            ["The door squeaks", "My door creaks when I open it", "Squeaky hinge"],
            "The hinge pin is dry and its metal rubs as the door swings. Lifting the pin out, wiping it and oiling it stops the squeak for a year or more.",
            [
                step("Close the door", "door", "The door is shut, so it holds itself up while a pin is out.", [], "none", [("door", "close", "Close the door")]),
                step("Tap the top hinge pin up and out", "hinge pin", "The pin is out in your hand.",
                     ["Push up from below with a nail and tap with a hammer.", "Do one hinge at a time."], "lift",
                     [("hinge_pin", "remove", "Tap the pin up and out")]),
                step("Wipe it and coat it with a little oil", "hinge pin", "The pin is clean with a thin coat of oil.",
                     ["Petroleum jelly or 3-in-1 oil works; skip WD-40, it dries out."], "none",
                     [("oil_can", "look", "A little oil"), ("hinge_top", "look", "Wipe the hinge too")]),
                step("Slide the pin back in and swing the door", "hinge pin", "The door opens without a squeak.",
                     ["Repeat on the other hinges if it still squeaks."], "push_in",
                     [("hinge_pin", "insert", "Pin back in"), ("door", "open", "Swing the door"), ("door", "close", "Quiet now")]),
            ],
            "a dry hinge pin", tools=["Nail and hammer", "Light oil or petroleum jelly", "Paper towel"]),
        problem(
            "wont_latch", "Won't stay closed",
            ["The door won't latch", "The door won't stay closed", "The door pops open", "I have to slam the door to close it"],
            "The door has sagged a little, so the latch misses the hole in the metal plate on the frame. Tightening the top hinge screws lifts it back; a long screw in the top hinge fixes it for good.",
            [
                step("Close the door slowly and watch the latch", "latch", "You can see if the latch hits above or below the hole.",
                     ["Rub a little lipstick or chalk on the latch to mark where it hits."], "none",
                     [("door", "close", "Close it slowly"), ("latch", "look", "Watch where the latch hits"), ("strike_plate", "look", "It should go in this hole")]),
                step("Tighten the screws in the top hinge", "hinge screws", "All the top hinge screws are tight.",
                     ["Open the door to reach them."], "screw_in",
                     [("door", "open", "Open the door"), ("hinge_screws", "turn", "Tighten the screws")]),
                step("Still loose? Swap one screw for a 3-inch screw", "hinge screws", "The long screw bites into the wall framing and pulls the door up.",
                     ["Use the middle hole on the frame side of the top hinge."], "screw_in",
                     [("hinge_screws", "turn", "A long screw here")]),
                step("Close the door and check it latches", "door", "The door clicks shut without slamming.",
                     ["If it still misses, the strike plate can be moved up or down a little."], "none",
                     [("door", "close", "Click, it latches"), ("latch", "look", "Latch catches")]),
            ],
            "a sagging door", tools=["Screwdriver", "3-inch wood screw (if needed)"]),
        problem(
            "sticks", "Sticks or rubs the frame",
            ["The door sticks", "The door rubs on the frame", "The door is hard to close", "The door scrapes the floor"],
            "A door that rubs at the top corner on the latch side has sagged from loose hinge screws. Tightening them, or adding a long screw to the top hinge, pulls it back into line.",
            [
                step("Find where it rubs", "door", "You can see a shiny worn spot or feel where it catches.", [], "none",
                     [("door", "close", "Close it slowly"), ("door", "look", "Look for the worn spot")]),
                step("Tighten every hinge screw", "hinge screws", "No screw turns any further.",
                     ["A screw that spins and won't tighten needs a longer one."], "screw_in",
                     [("door", "open", "Open the door"), ("hinge_screws", "turn", "Tighten the screws")]),
                step("Close the door and test", "door", "It closes without rubbing.",
                     ["Humid weather swells doors; a little sanding on the rubbing edge helps if needed."], "none",
                     [("door", "close", "Close it")]),
            ],
            "loose hinge screws", tools=["Screwdriver", "3-inch wood screw (if needed)"]),
    ],
))


# The researched appliances keep their content; this only gives them a picker tile and short titles.
PICKER = {
    "whirlpool-top-load-washer": ("Washer · top-load", "washer_top", {
        "will_not_start": "Won't start", "not_draining_wet_clothes": "Won't drain, clothes soaking", "shaking_banging_walking": "Shakes and bangs",
        "not_filling_or_slow_fill": "Won't fill with water", "lid_will_not_lock": "Lid light flashing", "smelly_washer_clothes_not_fresh": "Smells musty"}),
    "whirlpool-front-load-washer": ("Washer · front-load", "washer_front", {
        "not_draining": "Water left in the drum", "smelly_washer": "Smells musty", "leaking_from_front": "Puddle in front",
        "shaking_and_noisy": "Shakes a lot", "will_not_start": "Won't start", "door_wont_open_low_water": "Door won't open"}),
    "whirlpool-electric-dryer": ("Dryer", "dryer", {
        "clothes_still_damp_long_dry_time": "Clothes still damp", "dryer_will_not_start": "Won't start", "dryer_tumbles_but_no_heat": "Spins but no heat",
        "dryer_stops_before_clothes_are_dry": "Stops too early", "thumping_banging_or_shaking": "Thumps and bangs", "drum_light_not_working": "Light is out",
        "clothes_wrinkled_after_sitting": "Clothes come out wrinkled"}),
    "whirlpool-dishwasher": ("Dishwasher", "dishwasher", {
        "dishes_not_clean": "Dishes still dirty or gritty", "water_left_in_bottom": "Water left in the bottom", "dishes_still_wet": "Dishes come out wet",
        "bad_smell": "Smells bad", "leaking_from_door": "Leaks from the door", "will_not_start": "Won't start", "white_film_and_spots": "White film on glasses"}),
    "whirlpool-electric-range": ("Oven and stove", "range", {
        "oven_will_not_start": "Oven won't turn on", "one_burner_will_not_heat": "A burner won't heat", "food_bakes_too_hot_or_cold": "Bakes too hot or cold",
        "oven_light_out": "Oven light is out", "burnt_on_cooktop_spill": "Burnt spill on the glass top", "light_oven_spill_and_smell": "Spill on the oven floor"}),
    "whirlpool-otr-microwave": ("Microwave", "microwave", {
        "microwave_will_not_start": "Won't start", "sparking_inside_microwave": "Sparks inside", "vent_not_pulling_smells": "Fan doesn't pull smoke",
        "cooktop_light_not_working": "Stove light is out", "turntable_rumbling_or_not_spinning": "Plate rumbles or won't spin",
        "display_flashing_after_power_cut": "Screen flashing PF", "inside_light_not_working": "Dark inside", "runs_but_does_not_heat": "Runs but doesn't heat"}),
    "garbage-disposal": ("Garbage disposal", "disposal", {
        "jammed_and_humming": "Hums but won't spin", "will_not_turn_on": "Totally silent", "bad_smell_from_sink": "Smells bad",
        "sink_drains_slowly_or_not_at_all": "Sink won't drain", "leaking_under_the_sink": "Leaking underneath", "loud_rattling_or_grinding_noise": "Loud rattling"}),
    "car-oil-change": ("Car", "car", {
        "engine_oil_due_for_change": "Oil change", "engine_oil_level_low": "Oil is low", "engine_coolant_level_low": "Coolant is low",
        "washer_fluid_not_spraying": "Windshield fluid won't spray", "weak_airflow_clogged_cabin_filter": "Weak air from the vents",
        "battery_terminals_corroded_no_start": "Clicks and won't start", "blown_fuse_dead_electrical_part": "Something electrical died"}),
}


def tag_researched_entries():
    for entry_id, (category, icon, titles) in PICKER.items():
        path = ROOT / "backend/library" / f"{entry_id}.json"
        data = json.loads(path.read_text())
        data["category"], data["icon"] = category, icon
        for item in data["problems"]:
            if item["id"] in titles:
                item["title"] = titles[item["id"]]
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def write():
    tag_researched_entries()
    for name, recipe in MODELS.items():
        text = json.dumps(recipe, indent=1) + "\n"
        (ROOT / "backend/models" / f"{name}.json").write_text(text)
        # The toilet already lives in the app's examples (and the backend's references); leave it as it is.
        if name != "toilet":
            (ROOT / "app/app/components/rig/recipes/examples" / f"{name}.json").write_text(text)
    for item in ENTRIES:
        (ROOT / "backend/library" / f"{item['id']}.json").write_text(json.dumps(item, indent=1) + "\n")
    print(f"{len(MODELS)} models, {len(ENTRIES)} library entries, {sum(len(e['problems']) for e in ENTRIES)} fixes")


if __name__ == "__main__":
    write()
