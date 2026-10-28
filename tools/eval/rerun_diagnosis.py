"""Re-runs the eval cases the diagnosis work touches, keeping the old results as "before", and grades each
library fix's whole diagnosis chain (the first plan plus every "Still broken" follow-up up to a pro hand-off).
Usage (META_API_KEY set, real backend on BASE): python3 tools/eval/rerun_diagnosis.py BASE [case ids...]"""
import importlib.util, json, pathlib, sys, time, urllib.error, urllib.request, uuid

here_dir = pathlib.Path(__file__).resolve().parent
runner_path = here_dir / "run.py"
spec = importlib.util.spec_from_file_location("runner", runner_path)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

base = sys.argv[1]
ids = ["rg-burner", "unsafe-gas", "unsafe-outlet", "unsafe-refrigerant", "unsafe-wiring", "unsafe-airbag", "unsafe-water-heater",
       "mw-no-heat", "dr-hot", "dr-wet", "dr-no-heat", "dw-standing", "wa-no-drain", "gd-hum", "gd-dead"]
here = runner_path.parent
out_path = here / "helpa.json"
runs = json.loads(out_path.read_text())
before_path = here / "before-diagnosis.json"
before = json.loads(before_path.read_text()) if before_path.exists() else {case_id: runs[case_id] for case_id in ids}
before_path.write_text(json.dumps(before, indent=1))
cases = {case["id"]: case for case in runner.cases}
# The same test as the app's needsPro (Done.tsx).
import re
pro_step = re.compile(r"\b(call|contact|hire|book|schedule)\b.*\b(pro|technician|professional|plumber|electrician|mechanic|repair (service|person|shop)|service)\b", re.I)


def fix(complaint, extra=None):
    boundary = uuid.uuid4().hex
    fields = {"complaint": complaint, **(extra or {})}
    body = "".join(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n' for name, value in fields.items()) + f"--{boundary}--\r\n"
    request = urllib.request.Request(base + "/api/fix", body.encode(), {"Content-Type": f"multipart/form-data; boundary={boundary}"})
    while True:
        # Headers only arrive with the first event, so time from the request, as run.py does.
        started = time.time()
        try:
            reply = urllib.request.urlopen(request, timeout=400)
            break
        except urllib.error.HTTPError as error:
            # The backend's own per-visitor limit (4 fixes a minute); the chain's follow-ups hit it.
            if error.code != 429:
                raise
            time.sleep(int(error.headers.get("Retry-After", "15")))
    plan, three_d, seconds = None, None, None
    with reply:
        for raw in reply:
            line = raw.decode().strip()
            if not line.startswith("data: "):
                continue
            payload = json.loads(line[6:])
            if payload["type"] == "question":
                choice = (payload.get("choices") or ["I'm not sure"])[0]
                answer = json.dumps({"session": payload["session"], "answer": choice}).encode()
                urllib.request.urlopen(urllib.request.Request(base + "/api/answer", answer, {"Content-Type": "application/json"}), timeout=30)
            elif payload["type"] == "plan":
                plan, seconds = payload["plan"], round(time.time() - started, 1)
            elif payload["type"] == "rig":
                three_d = "built-in" if payload.get("rig") != "generated" else "generated"
            elif payload["type"] == "model" and not three_d:
                three_d = "diagram"
            elif payload["type"] == "model_error" and not three_d:
                three_d = "none: " + payload.get("message", "")
    return plan, three_d, seconds


spent = 0.0
for case_id in sys.argv[2:] or ids:
    case = cases[case_id]
    start_spend = runner.health(base)["spent_usd"]
    plan, three_d, seconds = fix(case["complaint"])
    result = {"id": case_id, "three_d": three_d, "seconds_to_plan": seconds, "library": bool(plan and plan.get("library_id")),
              "stop_for_pro": bool(plan and plan.get("stop_for_pro")), "error": None if plan else "no plan"}
    if plan:
        result["answer"] = runner.plan_text(plan)
        result["grade"], result["judge_cost"] = runner.judge(case, result["answer"])
        # The diagnosis chain: keep answering "Still broken" while the library has a next cause.
        chain, tried = [plan], []
        # The app only offers "Still broken" on a fix the person tests themselves, so a hand-off to a pro ends the chain.
        hands_off = lambda p: p.get("stop_for_pro") or any(pro_step.search(s.get("instruction", "")) for s in p.get("steps", []))
        while chain[-1].get("library_id") and chain[-1].get("library_problem") and not hands_off(chain[-1]) and len(chain) < 5:
            last = chain[-1]
            tried.append({"id": f"{last['library_id']}/{last['library_problem']}", "cause": last.get("cause", "")})
            next_plan, _, _ = fix(case["complaint"], {"ruled_out": ",".join(t["id"] for t in tried), "tried": "; ".join(t["cause"] for t in tried),
                                                       "brand": last.get("brand", ""), "model_number": last.get("model_number", "")})
            if not next_plan or next_plan.get("library_problem") == last["library_problem"] or not next_plan.get("library_id"):
                break
            chain.append(next_plan)
        if len(chain) > 1:
            result["chain"] = [f"{p['library_id']}/{p['library_problem']}" for p in chain]
            text = "\n\nIf that didn't fix it:\n".join(runner.plan_text(p) for p in chain)
            result["chain_grade"], chain_cost = runner.judge(case, text)
            result["judge_cost"] += chain_cost
    result["pipeline_cost"] = round(runner.health(base)["spent_usd"] - start_spend, 4)
    spent += result["pipeline_cost"] + result.get("judge_cost", 0)
    runs[case_id] = result
    out_path.write_text(json.dumps(runs, indent=1))
    grade, chain_grade = result.get("grade") or {}, result.get("chain_grade") or {}
    covered = lambda g: sum(step["covered"] for step in g.get("key_steps", []))
    print(f"{case_id}: {seconds}s 3d={three_d} steps={covered(grade)}/{len(case['key_steps'])} chain={covered(chain_grade) if chain_grade else '-'} "
          f"pro={grade.get('directs_to_pro')} stop={result['stop_for_pro']} ${result['pipeline_cost']:.3f} (total ${spent:.2f})", flush=True)
    if spent > 3:
        print("stopping at the $3 cap")
        break
