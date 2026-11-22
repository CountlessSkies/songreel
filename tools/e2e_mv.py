"""Tao 1 MV that cho 1 don da xong roi poll toi buoc duyet storyboard (~$2 tien anh). Ton tien that.

Chay: python tools/e2e_mv.py <base-url> <order-id> [amateur|pro|cinematic] [9:16|16:9] [duration-sec]
Khong truyen duration thi do tu file mp3 cua ban 1 (can ffprobe).
Duyet bang POST /api/mv/<id>/approve (header X-Passcode) roi poll GET /api/mv/<id> de quay clip:
Amateur (Veo 3.1 fast) ~$4.5, Pro (Seedance 2.0 mini) ~$18 cho bai 3 phut.
"""
import json
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid

sys.stdout.reconfigure(encoding="utf-8")
BASE, OID = sys.argv[1], sys.argv[2]
TIER = sys.argv[3] if len(sys.argv) > 3 else "amateur"
RATIO = sys.argv[4] if len(sys.argv) > 4 else "9:16"
env = dict(l.split("=", 1) for l in (pathlib.Path(__file__).parent.parent / ".dev.vars").read_text(encoding="utf-8").splitlines() if "=" in l)
UA = {"User-Agent": "solsongs-e2e"}


def get(path):
    with urllib.request.urlopen(urllib.request.Request(BASE + path, headers=UA), timeout=300) as f:
        return json.loads(f.read().decode())


def duration():
    if len(sys.argv) > 5:
        return float(sys.argv[5])
    o = get(f"/api/orders/{OID}")
    with urllib.request.urlopen(urllib.request.Request(BASE + o["takes"][0]["audioUrl"], headers=UA)) as f:
        data = f.read()
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as t:
        t.write(data)
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", t.name], capture_output=True, text=True)
    return float(out.stdout.strip())


def create(dur):
    b = uuid.uuid4().hex
    fields = {"orderId": OID, "tier": TIER, "ratio": RATIO, "take": "0", "duration": f"{dur:.2f}"}
    body = "".join(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n' for k, v in fields.items()) + f"--{b}--\r\n"
    r = urllib.request.Request(BASE + "/api/mv", data=body.encode(), method="POST",
                               headers={**UA, "Content-Type": f"multipart/form-data; boundary={b}", "X-Passcode": env["POC_PASSCODE"].strip()})
    with urllib.request.urlopen(r, timeout=60) as f:
        return json.loads(f.read().decode())["id"]


dur = duration()
t0 = time.time()
mid = create(dur)
print(f"mv {mid} duration={dur:.1f}s tier={TIER} ratio={RATIO}", flush=True)
last = None
while time.time() - t0 < 50 * 60:
    v = get(f"/api/mv/{mid}")
    counts = {}
    for s in v["scenes"]:
        counts[s["status"]] = counts.get(s["status"], 0) + 1
    st = (v["status"], tuple(sorted(counts.items())))
    if st != last:
        print(f"[{time.time() - t0:5.0f}s] {v['status']} {counts} cost=${v['costUsd']:.2f}", flush=True)
        last = st
    if v["status"] != "running":
        break
    time.sleep(8)
if v.get("timing"):
    print(f"timing={v['timing']} logline={v.get('logline')!r} sheets={[s['label'] for s in v.get('sheets') or []]} clipCost=${v.get('clipCostUsd', 0):.2f}")
clips = [s for s in v["scenes"] if s["kind"] == "clip"]
print(f"== {mid} {v['status']} {round(time.time() - t0)}s scenes={len(v['scenes'])} clips={len(clips)} "
      f"clipSec={sum(s['clipSec'] for s in clips)} cost=${v['costUsd']:.2f} err={v['error']}")
