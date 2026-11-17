"""Tao 1 don that cho moi model viet loi tren URL deploy, poll toi khi xong. Ton ~$0.08 Suno + phi LLM moi don."""
import concurrent.futures as cf, json, pathlib, sys, time, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
BASE = sys.argv[1] if len(sys.argv) > 1 else "https://songreel-poc.quann111.workers.dev"
WRITERS = sys.argv[2].split(",") if len(sys.argv) > 2 else ["sol", "claude", "gemini"]
env = dict(l.split("=", 1) for l in (pathlib.Path(__file__).parent.parent / ".dev.vars").read_text(encoding="utf-8").splitlines() if "=" in l)
ANS = {"rel": "me", "name": "Lan", "occ": "sinh_nhat", "genre": "ballad", "voice": "female", "tempo": "vua", "mood": "cam_dong",
       "decade": "2020s", "inst": "auto", "qualities": "Hiền, chịu khó, hay cười", "memories": "Mẹ hay nấu canh chua mỗi chiều mưa. Mẹ hát ru con bằng bài ầu ơ ví dầu. Năm con thi đại học mẹ thức đêm nấu cháo.",
       "dedication": "Chúc mẹ tuổi mới luôn khoẻ", "sender": "Con gái Mai", "email": "test@example.com", "phone": ""}
def req(path, body=None):
    r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body else None,
        headers={"Content-Type": "application/json", "X-Passcode": env["POC_PASSCODE"].strip(), "User-Agent": "songreel-e2e"}, method="POST" if body else "GET")
    with urllib.request.urlopen(r, timeout=300) as f: return json.loads(f.read().decode())
def run(w):
    t0 = time.time(); oid = req("/api/orders", {**ANS, "writer": w})["id"]; last = None
    while time.time() - t0 < 900:
        o = req(f"/api/orders/{oid}")
        st = (o["status"], o["stage"], o["round"])
        if st != last: print(f"[{time.time()-t0:5.0f}s] {w:6} {oid} {st}", flush=True); last = st
        if o["status"] != "running": break
        time.sleep(5)
    return w, oid, round(time.time() - t0), o
with cf.ThreadPoolExecutor(3) as ex:
    for w, oid, sec, o in ex.map(run, WRITERS):
        print(f"== {w} {oid} {sec}s status={o['status']} title={o['title']!r} critic={o['critic']} takes={len(o['takes'])} err={o['error']}")
