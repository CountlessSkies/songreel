"""Test Suno v6 qua RunningHub: gui loi tieng Viet, poll ket qua, tai mp3 ve.

Chay: python scripts/suno_test.py [--case <ten>] [--env <duong-dan .dev.vars>]
"""
import argparse
import json
import pathlib
import sys
import time
import urllib.request

BASE = "https://www.runninghub.ai/openapi/v2"
ENDPOINT = "/rhart-audio/suno-v6/custom"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "out" / "suno"

CASES = {
    "sinhnhat-me": {
        "title": "Mẹ Ơi, Mừng Sinh Nhật",
        "tags": "Vietnamese pop ballad, warm, acoustic guitar, piano, soft strings, 78 BPM, female vocals, Vietnamese vocals",
        "vocalGender": "f",
        "prompt": """[Verse 1]
Sáng nay nắng vàng trên hiên nhà
Con nhớ bàn tay mẹ hiền hoà
Bao năm tóc mẹ thêm sợi bạc
Vẫn dịu dàng như những ngày xa

[Pre-Chorus]
Ngày mẹ sinh ra, ngày con biết thương
Một lời cảm ơn, gửi trọn yêu thương

[Chorus]
Mẹ Lan ơi, mừng sinh nhật mẹ
Con hát bài này thay lời con nhé
Dẫu mai đi xa trăm ngàn lối rẽ
Lòng con vẫn về bên mẹ Lan ơi

[Verse 2]
Nhớ bát canh chua chiều mưa bay
Nhớ tiếng ru hời bên vai gầy
Con lớn lên trong vòng tay ấy
Hôm nay con muốn nói điều này

[Chorus]
Mẹ Lan ơi, mừng sinh nhật mẹ
Con hát bài này thay lời con nhé
Dẫu mai đi xa trăm ngàn lối rẽ
Lòng con vẫn về bên mẹ Lan ơi

[Outro]
Mẹ Lan ơi, con thương mẹ nhiều
""",
    },
}


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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--case", default="sinhnhat-me", choices=CASES)
    ap.add_argument("--env", default=r"D:\AgentWorks\roomcraft-ai-names\.dev.vars")
    ap.add_argument("--timeout", type=int, default=900)
    args = ap.parse_args()

    key = load_key(pathlib.Path(args.env))
    case = CASES[args.case]
    body = {
        "make_instrumental": "false",
        "prompt": case["prompt"],
        "title": case["title"],
        "tags": case["tags"],
        "vocalGender": case["vocalGender"],
        "autoLyrics": "false",
        "audioFormat": "mp3",
    }

    t0 = time.time()
    sub = post(ENDPOINT, body, key)
    print("submit:", json.dumps(sub, ensure_ascii=False))
    task_id = sub.get("taskId")
    if not task_id:
        sys.exit("Submit loi")

    res = sub
    while time.time() - t0 < args.timeout:
        time.sleep(10)
        res = post("/query", {"taskId": task_id}, key)
        print(f"[{time.time() - t0:5.0f}s] {res.get('status')}", flush=True)
        if res.get("status") in ("SUCCESS", "FAILED"):
            break

    elapsed = time.time() - t0
    OUT.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    (OUT / f"{args.case}-{stamp}.json").write_text(
        json.dumps({"elapsed_s": round(elapsed, 1), "request": body, "response": res}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print("final:", json.dumps({k: res.get(k) for k in ("status", "errorCode", "errorMessage", "usage")}, ensure_ascii=False))
    print(f"elapsed: {elapsed:.0f}s")

    for i, item in enumerate(res.get("results") or []):
        url = item.get("url")
        if not url:
            continue
        ext = item.get("outputType") or "mp3"
        dst = OUT / f"{args.case}-{stamp}-{i + 1}.{ext}"
        urllib.request.urlretrieve(url, dst)
        print("saved:", dst, dst.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
