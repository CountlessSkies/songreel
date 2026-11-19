"""Test MV tam: 1 anh Nano Banana flash (9:16) -> clip Seedance 2.0 i2v (mini/fast) qua RunningHub.

Do gia that (usage.thirdPartyConsumeMoney) va thoi gian. Ket qua o out/mv/.
Chay: python tools/mv_test.py [--models mini,fast] [--duration 5] [--real-person]
"""
import argparse
import concurrent.futures as cf
import json
import pathlib
import sys
import time
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

BASE = "https://www.runninghub.ai/openapi/v2"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "out" / "mv"
I2V = {
    "mini": "/bytedance/seedance-2.0-global-mini/image-to-video",
    "fast": "/bytedance/seedance-2.0-global-fast/image-to-video",
    "std": "/bytedance/seedance-2.0-global/image-to-video",
}

IMAGE_PROMPT = (
    "Vertical 9:16 cinematic film still. A Vietnamese woman in her fifties with gentle smile and a few grey hairs, "
    "wearing a soft cream ao ba ba, sits on the wooden porch of an old tiled-roof house in the Mekong countryside "
    "at golden hour, holding a cup of tea, warm backlight through banana leaves, shallow depth of field, 35mm, "
    "natural skin texture, nostalgic warm color grade. No text, no watermark."
)
MOTION_PROMPT = (
    "Slow push-in on the woman. She lifts her eyes from the tea and smiles warmly toward the camera, "
    "a light breeze moves the banana leaves and her hair, steam rises from the cup, golden light flickers. "
    "Gentle, calm, nostalgic. No text."
)

REF_PROMPT = (
    "Same woman as in the reference image (keep her face, hair, age and cream ao ba ba exactly). New scene: "
    "vertical 9:16 cinematic film still, she stands in a small Mekong market at early morning choosing fresh "
    "vegetables, soft mist, warm side light, 35mm, shallow depth of field, nostalgic warm grade. No text."
)


def load_key(env_path: pathlib.Path) -> str:
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("RUNNINGHUB_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    sys.exit(f"Khong thay RUNNINGHUB_API_KEY trong {env_path}")


def post(path: str, body: dict, key: str) -> dict:
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def run(name: str, path: str, body: dict, key: str, timeout: int = 900) -> dict:
    t0 = time.time()
    sub = post(path, body, key)
    tid = sub.get("taskId")
    if not tid:
        return {"name": name, "error": sub, "elapsed_s": 0}
    res = sub
    while time.time() - t0 < timeout:
        time.sleep(5)
        res = post("/query", {"taskId": tid}, key)
        if res.get("status") in ("SUCCESS", "FAILED"):
            break
    el = round(time.time() - t0, 1)
    print(f"[{name}] {res.get('status')} {el}s usage={res.get('usage')} err={res.get('errorMessage')}", flush=True)
    return {"name": name, "elapsed_s": el, "response": res}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--env", default=r"D:\AgentWorks\songreel\.dev.vars")
    ap.add_argument("--models", default="mini,fast")
    ap.add_argument("--duration", default="5")
    ap.add_argument("--real-person", action="store_true")
    ap.add_argument("--res", default="720p")
    ap.add_argument("--image-model", default="rhart-image-n-nb21")
    ap.add_argument("--ref-scene", action="store_true", help="tao them canh 2 tu anh canh 1 (giu nhan vat)")
    args = ap.parse_args()
    key = load_key(pathlib.Path(args.env))
    OUT.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")

    img = run("image", f"/{args.image_model}/text-to-image",
              {"prompt": IMAGE_PROMPT, "resolution": "1k", "aspectRatio": "9:16"}, key)
    results = img.get("response", {}).get("results") or []
    if not results:
        sys.exit(f"Tao anh loi: {json.dumps(img, ensure_ascii=False)}")
    img_url = results[0]["url"]
    urllib.request.urlretrieve(img_url, OUT / f"{stamp}-frame.{results[0].get('outputType') or 'png'}")

    report = {"image": img}
    if args.ref_scene:
        # Canh 2 dung anh canh 1 lam reference de giu nhan vat
        ref = run("ref-image", f"/{args.image_model}/image-to-image",
                  {"imageUrls": [img_url], "prompt": REF_PROMPT, "resolution": "1k", "aspectRatio": "9:16"}, key)
        report["ref"] = ref
        for item in (ref.get("response") or {}).get("results") or []:
            if item.get("url"):
                urllib.request.urlretrieve(item["url"], OUT / f"{stamp}-frame2.{item.get('outputType') or 'png'}")
    if not args.models:
        (OUT / f"{stamp}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return
    with cf.ThreadPoolExecutor() as ex:
        futs = {}
        for m in args.models.split(","):
            body = {
                "prompt": MOTION_PROMPT, "resolution": args.res, "duration": args.duration,
                "firstFrameUrl": img_url, "generateAudio": False, "ratio": "9:16",
                "realPersonMode": args.real_person, "returnLastFrame": False, "seed": -1,
            }
            futs[ex.submit(run, m, I2V[m], body, key)] = m
        for f in cf.as_completed(futs):
            r = f.result()
            report[r["name"]] = r
            for i, item in enumerate((r.get("response") or {}).get("results") or []):
                if not item.get("url"):
                    print(f"[{r['name']}] result {i} khong co url: {item}")
                    continue
                dst = OUT / f"{stamp}-{r['name']}-{i + 1}.{item.get('outputType') or 'mp4'}"
                urllib.request.urlretrieve(item["url"], dst)
                print("saved:", dst, dst.stat().st_size, "bytes")

    (OUT / f"{stamp}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
