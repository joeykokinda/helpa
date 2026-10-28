"""Records the "Try a sample" runs: each sample photo and complaint goes through the real pipeline and the
event stream is saved to backend/samples/<id>.sse, which the backend replays for free. Re-run after the
library or rigs change, then rebuild the backend (the samples are embedded).
Usage: python3 tools/record_samples.py [http://127.0.0.1:8095] [sample ids...]"""
import json, pathlib, sys, threading, urllib.request, uuid

root = pathlib.Path(__file__).resolve().parent.parent
base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8095"
wanted = sys.argv[2:]
samples = json.loads((root / "app/app/lib/samples.json").read_text())


def answer(session, choice):
    body = json.dumps({"session": session, "answer": choice}).encode()
    urllib.request.urlopen(urllib.request.Request(f"{base}/api/answer", body, {"Content-Type": "application/json"}), timeout=30)


def record(sample):
    photo = (root / f"app/public/samples/{sample['id']}.webp").read_bytes()
    boundary = uuid.uuid4().hex
    body = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="complaint"\r\n\r\n{sample["complaint"]}\r\n'
        f'--{boundary}\r\nContent-Disposition: form-data; name="photos"; filename="photo-0.webp"\r\nContent-Type: image/webp\r\n\r\n'
    ).encode() + photo + f"\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request(f"{base}/api/fix", body, {"Content-Type": f"multipart/form-data; boundary={boundary}"})
    lines, types = [], []
    with urllib.request.urlopen(request, timeout=300) as response:
        for raw in response:
            line = raw.decode().rstrip("\n")
            if not line.startswith("data: "):
                continue
            payload = json.loads(line[6:])
            print(sample["id"], payload["type"], flush=True)
            if payload["type"] == "error":
                print(sample["id"], "FAILED:", payload["message"], flush=True)
                return
            if payload["type"] == "done":
                continue
            lines.append(line)
            types.append(payload["type"])
            if payload["type"] == "question":
                # The recording takes the first answer; the replay still waits for a real tap.
                threading.Thread(target=answer, args=(payload["session"], payload["choices"][0])).start()
    if "plan" not in types:
        print(sample["id"], "FAILED: no plan in the stream", flush=True)
        return
    (root / f"backend/samples/{sample['id']}.sse").write_text("\n\n".join(lines) + "\n\n")
    print(sample["id"], "saved", flush=True)


threads = [threading.Thread(target=record, args=(sample,)) for sample in samples if not wanted or sample["id"] in wanted]
for thread in threads:
    thread.start()
for thread in threads:
    thread.join()
