"""Benchmark viet loi: cung prompt + luat cham cua prototype v1.03, chay nhieu model qua RunningHub LLM proxy.

Chay: python -I tools/bench_lyrics.py [--runs 1]
Ket qua: out/bench/<stamp>.json va out/bench/<stamp>.html
"""
import argparse
import concurrent.futures as cf
import html
import json
import pathlib
import re
import time
import unicodedata
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "out" / "bench"
ENV = pathlib.Path(r"D:\AgentWorks\roomcraft-ai-names\.dev.vars")
URL = "https://llm.runninghub.ai/v1/chat/completions"

MODELS = [
    ("Claude Sonnet 5.5", "anthropic/claude-sonnet-5.5"),
    ("Gemini 4 Hydrogen", "google/gemini-4-hydrogen"),
    ("GPT-6.1 Sol", "openai/gpt-6.1-sol"),
]

# Prompt he thong giu nguyen tu prototype v1.03
SYS = """Bạn là nhạc sĩ Việt Nam viết lời bài hát tặng riêng một người. Viết tiếng Việt tự nhiên, dễ hát: mỗi câu 6–10 chữ, có vần, câu ngân dài ưu tiên kết thanh bằng. Xưng hô đúng quan hệ. Tên người nhận phải có trong điệp khúc. Dùng chi tiết kỷ niệm cụ thể, không bịa sự kiện lớn, không chép lời bài có sẵn.
Cấu trúc: Intro (không lời), Verse 1 (4 câu), Chorus (4 câu), Verse 2 (4 câu), Chorus 2 (lặp lại), Outro (2 câu).
Chỉ trả JSON: {"title":str,"sections":[{"name":str,"kind":"intro|verse|chorus|outro","lines":[str]}]}"""

CASES = [
    {
        "id": "me-lan", "label": "Mẹ Lan · Sinh nhật · Ballad",
        "name": "Lan", "you": "mẹ", "me": "con", "occ": "Sinh nhật", "genre": "Ballad Việt", "sender": "Con gái Mai",
        "memories": [
            "Mẹ hay nấu canh chua mỗi chiều mưa",
            "Mẹ hát ru con bằng bài ầu ơ ví dầu",
            "Năm con thi đại học mẹ thức đêm nấu cháo cho con",
            "Hiền, chịu khó, hay cười",
        ],
    },
    {
        "id": "vo-nguyet", "label": "Vợ Nguyệt · Kỷ niệm cưới · Acoustic",
        "name": "Nguyệt", "you": "em", "me": "anh", "occ": "Kỷ niệm ngày cưới / ngày yêu", "genre": "Acoustic", "sender": "Chồng Huy",
        "memories": [
            "Gặp nhau ở Đà Lạt, trời mưa phùn, đứng chung một chiếc ô",
            "Cưới nhau năm 2018 ở quê ngoại Bến Tre",
            "Có con gái tên Bông, năm nay 3 tuổi",
            "Em hay pha cà phê sữa đá mỗi sáng cho anh",
        ],
    },
    {
        "id": "ban-khue", "label": "Bạn thân Khuê · Tốt nghiệp · Pop",
        "name": "Khuê", "you": "cậu", "me": "tớ", "occ": "Tốt nghiệp", "genre": "Pop Việt", "sender": "Tớ - Linh",
        "memories": [
            "Học chung 4 năm Bách Khoa, thức trắng ôn thi giải tích",
            "Hai đứa hay đi trà sữa sau giờ học ở cổng Parabol",
            "Khuê từng chở tớ về nhà lúc xe tớ hỏng giữa trời mưa",
            "Lanh chanh, tốt bụng, mê mèo",
        ],
    },
    {
        "id": "ba-tu", "label": "Bà Tư · Tết · Dân ca đương đại",
        "name": "Bà Tư", "you": "bà", "me": "cháu", "occ": "Tết", "genre": "Dân ca đương đại", "sender": "Cháu nội Bin",
        "memories": [
            "Tết nào bà cũng gói bánh chưng, cháu ngồi canh nồi bên bếp lửa",
            "Vườn mai vàng trước nhà bà ở Huế",
            "Bà kể chuyện cổ tích Tấm Cám mỗi tối",
            "Bà nhai trầu, cười móm mém",
        ],
    },
]


def user_prompt(c: dict) -> str:
    return (
        f'Người nhận: {c["name"]} (gọi là "{c["you"]}", người hát xưng "{c["me"]}")\n'
        f'Dịp: {c["occ"]}\nThể loại: {c["genre"]}\nNgười gửi: {c["sender"]}\n'
        "Kỷ niệm:\n- " + "\n- ".join(c["memories"])
    )


# ── Critic: port tu prototype ───────────────────────────────────────────────
TONES = {"\u0301": "sắc", "\u0300": "huyền", "\u0309": "hỏi", "\u0303": "ngã", "\u0323": "nặng"}
INITIALS = ["ngh", "ng", "nh", "ch", "tr", "th", "ph", "kh", "gh", "gi", "qu", "b", "c", "d", "đ", "g", "h", "k", "l",
            "m", "n", "p", "r", "s", "t", "v", "x"]


def tone_of(w: str) -> str:
    for ch in unicodedata.normalize("NFD", w.lower()):
        if ch in TONES:
            return TONES[ch]
    return "ngang"


def rhyme_key(w: str) -> str:
    b = "".join(c for c in unicodedata.normalize("NFD", w.lower()) if c not in TONES)
    b = re.sub(r"[^\w]", "", unicodedata.normalize("NFC", b))
    for i in INITIALS:
        if b.startswith(i) and len(b) > len(i):
            return b[len(i):]
    return b


def last_word(line: str) -> str:
    parts = line.split()
    return parts[-1] if parts else ""


def critique(L: dict, name: str) -> dict:
    issues, notes = [], []
    secs = L.get("sections") or []
    sung = [l for s in secs for l in (s.get("lines") or [])]
    if len(sung) < 10:
        issues.append(f"chỉ có {len(sung)} câu (cần ≥10)")
    long_ = [l for l in sung if len(l.split()) > 12]
    if long_:
        issues.append(f"{len(long_)} câu dài hơn 12 chữ")
    last = name.split()[-1].lower()
    chorus = [l for s in secs if s.get("kind") == "chorus" for l in (s.get("lines") or [])]
    if not any(last in l.lower() for l in chorus):
        issues.append("điệp khúc chưa có tên người nhận")
    pairs = rh = 0
    for s in secs:
        ls = s.get("lines") or []
        for i in range(0, len(ls) - 1, 2):
            pairs += 1
            ka, kc = rhyme_key(last_word(ls[i])), rhyme_key(last_word(ls[i + 1]))
            if ka == kc or (ka and kc and ka[-1] == kc[-1]):
                rh += 1
    rhyme = rh / pairs if pairs else 0
    if rhyme < 0.3:
        notes.append(f"ít vần ({rh}/{pairs} cặp câu)")
    ends = [tone_of(last_word(l)) for l in sung]
    flat = sum(t in ("ngang", "huyền") for t in ends) / (len(ends) or 1)
    if flat < 0.5:
        notes.append(f"chỉ {round(flat * 100)}% câu kết thanh bằng")
    words = [len(l.split()) for l in sung]
    in_range = sum(6 <= w <= 10 for w in words) / (len(words) or 1)
    score = round(max(0, 100 - 25 * len(issues) - 5 * len(notes)) * (0.8 + 0.2 * rhyme))
    return {"issues": issues, "notes": notes, "score": score, "rhyme": round(rhyme, 2), "flat": round(flat, 2),
            "lines": len(sung), "in_6_10": round(in_range, 2)}


# ── Goi model ───────────────────────────────────────────────────────────────
def load_key() -> str:
    for line in ENV.read_text(encoding="utf-8").splitlines():
        if line.startswith("RUNNINGHUB_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("Khong thay RUNNINGHUB_API_KEY")


def call(key: str, model: str, case: dict) -> dict:
    body = {
        "model": model,
        "max_tokens": 6000,
        "messages": [{"role": "system", "content": SYS}, {"role": "user", "content": user_prompt(case)}],
    }
    req = urllib.request.Request(URL, data=json.dumps(body).encode("utf-8"),
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=240) as r:
            d = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"ok": False, "sec": round(time.time() - t0, 1), "error": f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:300]}"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "sec": round(time.time() - t0, 1), "error": repr(e)[:300]}
    sec = round(time.time() - t0, 1)
    text = ""
    try:
        text = d["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError):
        return {"ok": False, "sec": sec, "error": "Response la: " + json.dumps(d, ensure_ascii=False)[:300]}
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return {"ok": False, "sec": sec, "error": "Khong co JSON", "raw": text[:2000], "usage": d.get("usage")}
    try:
        L = json.loads(m.group(0))
    except json.JSONDecodeError as e:
        return {"ok": False, "sec": sec, "error": f"JSON loi: {e}", "raw": text[:2000], "usage": d.get("usage")}
    return {"ok": True, "sec": sec, "lyrics": L, "critic": critique(L, case["name"]), "usage": d.get("usage")}


# ── Bao cao HTML ────────────────────────────────────────────────────────────
def render_html(results: list[dict], stamp: str) -> str:
    esc = html.escape
    by_model: dict[str, list[dict]] = {}
    for r in results:
        by_model.setdefault(r["model"], []).append(r)

    summary_rows = []
    for label, _ in MODELS:
        rs = by_model.get(label, [])
        ok = [r for r in rs if r["res"]["ok"]]
        avg = lambda xs: sum(xs) / len(xs) if xs else 0  # noqa: E731
        summary_rows.append(
            f"<tr><th>{esc(label)}</th><td>{len(ok)}/{len(rs)}</td>"
            f"<td>{avg([r['res']['critic']['score'] for r in ok]):.0f}</td>"
            f"<td>{sum(1 for r in ok if not r['res']['critic']['issues'])}/{len(ok)}</td>"
            f"<td>{avg([r['res']['critic']['rhyme'] for r in ok]) * 100:.0f}%</td>"
            f"<td>{avg([r['res']['critic']['in_6_10'] for r in ok]) * 100:.0f}%</td>"
            f"<td>{avg([r['res']['sec'] for r in rs]):.0f}s</td>"
            f"<td>{avg([(r['res'].get('usage') or {}).get('completion_tokens', 0) for r in rs]):.0f}</td></tr>"
        )

    case_blocks = []
    for c in CASES:
        cols = []
        for label, _ in MODELS:
            r = next((x for x in results if x["case"] == c["id"] and x["model"] == label), None)
            if not r:
                continue
            res = r["res"]
            if not res["ok"]:
                cols.append(f'<div class="col"><h3>{esc(label)}</h3><p class="err">Lỗi: {esc(res["error"])}</p>'
                            f'<p class="meta">{res["sec"]}s</p></div>')
                continue
            L, cr = res["lyrics"], res["critic"]
            secs = []
            for s in L.get("sections") or []:
                lines = s.get("lines") or []
                if not lines:
                    continue
                cls = "chorus" if s.get("kind") == "chorus" else ""
                secs.append(f'<div class="sec {cls}"><div class="sname">{esc(str(s.get("name", "")))}</div>'
                            + "".join(f"<div>{esc(str(l))}</div>" for l in lines) + "</div>")
            flags = "".join(f'<span class="tag bad">{esc(i)}</span>' for i in cr["issues"]) + "".join(
                f'<span class="tag warn">{esc(n)}</span>' for n in cr["notes"])
            if not flags:
                flags = '<span class="tag good">Đạt hết luật</span>'
            u = res.get("usage") or {}
            cols.append(
                f'<div class="col"><h3>{esc(label)} <span class="score">{cr["score"]}</span></h3>'
                f'<div class="title">“{esc(str(L.get("title", "")))}”</div>'
                f'<p class="meta">{res["sec"]}s · {u.get("prompt_tokens", "?")}→{u.get("completion_tokens", "?")} token · '
                f'{cr["lines"]} câu · vần {cr["rhyme"] * 100:.0f}% · thanh bằng {cr["flat"] * 100:.0f}% · 6–10 chữ {cr["in_6_10"] * 100:.0f}%</p>'
                f'<div class="flags">{flags}</div>{"".join(secs)}</div>'
            )
        mem = "".join(f"<li>{esc(m)}</li>" for m in c["memories"])
        case_blocks.append(
            f'<section><h2>{esc(c["label"])}</h2><details><summary>Bảng hỏi</summary>'
            f'<p>Gọi “{esc(c["you"])}”, xưng “{esc(c["me"])}” · Người gửi: {esc(c["sender"])}</p><ul>{mem}</ul></details>'
            f'<div class="grid">{"".join(cols)}</div></section>'
        )

    return f"""<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Benchmark viết lời</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700&display=swap">
<style>
:root{{--bg:#fffaf0;--card:#fff;--ink:#222;--mute:#6b6b6b;--line:#eadfca;--acc:#225bff;--good:#1b8a4a;--bad:#c62828;--warn:#b26a00;--chorus:#fff3c4}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#16140f;--card:#211e17;--ink:#eee;--mute:#aaa;--line:#3a3428;--chorus:#3a3010}}}}
body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 'Be Vietnam Pro',system-ui,sans-serif;padding:24px 16px}}
main{{max-width:1240px;margin:0 auto}} h1{{margin:0 0 4px}} .sub{{color:var(--mute);margin:0 0 20px}}
table{{border-collapse:collapse;width:100%;background:var(--card);border-radius:12px;overflow:hidden;margin-bottom:28px}}
th,td{{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left}} thead th{{font-size:13px;color:var(--mute)}}
section{{margin:28px 0}} h2{{margin:0 0 8px}} details{{color:var(--mute);margin-bottom:12px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}}
.col{{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}}
.col h3{{margin:0;display:flex;justify-content:space-between;align-items:center}}
.score{{background:var(--acc);color:#fff;border-radius:999px;padding:2px 12px;font-size:14px}}
.title{{font-weight:700;margin:6px 0 2px}} .meta{{color:var(--mute);font-size:12.5px;margin:2px 0 8px}}
.flags{{margin-bottom:10px}} .tag{{display:inline-block;font-size:12px;border-radius:999px;padding:1px 10px;margin:2px 4px 2px 0;border:1px solid}}
.good{{color:var(--good)}} .bad{{color:var(--bad)}} .warn{{color:var(--warn)}} .err{{color:var(--bad)}}
.sec{{margin:8px 0;padding:6px 10px;border-radius:8px}} .sec.chorus{{background:var(--chorus)}}
.sname{{font-size:12px;color:var(--mute);text-transform:uppercase;letter-spacing:.04em}}
</style></head><body><main>
<h1>Benchmark viết lời tiếng Việt</h1>
<p class="sub">Cùng prompt và luật chấm của prototype v1.03 · gọi qua RunningHub · 1 lần/bảng hỏi, không có vòng sửa · {esc(stamp)}</p>
<table><thead><tr><th>Model</th><th>Ra JSON</th><th>Điểm TB</th><th>Đạt luật cứng</th><th>Vần</th><th>Câu 6–10 chữ</th><th>Thời gian TB</th><th>Token ra TB</th></tr></thead>
<tbody>{"".join(summary_rows)}</tbody></table>
<p class="sub">Điểm tự động chỉ đo hình thức (số câu, độ dài, tên trong điệp khúc, vần, thanh). Độ tự nhiên và cảm xúc phải đọc bằng mắt.</p>
{"".join(case_blocks)}
</main></body></html>"""


def main() -> None:
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=1)
    args = ap.parse_args()
    key = load_key()
    jobs = [(label, mid, c, run) for run in range(args.runs) for c in CASES for label, mid in MODELS]
    results = []
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(call, key, mid, c): (label, mid, c, run) for label, mid, c, run in jobs}
        for f in cf.as_completed(futs):
            label, mid, c, run = futs[f]
            res = f.result()
            results.append({"model": label, "model_id": mid, "case": c["id"], "run": run, "res": res})
            s = f'{res["critic"]["score"]} điểm' if res["ok"] else "LỖI " + res["error"][:80]
            print(f"[{res['sec']:5.1f}s] {label:18} {c['id']:10} {s}", flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y-%m-%d %H:%M")
    fn = time.strftime("%Y%m%d-%H%M%S")
    (OUT / f"{fn}.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / f"{fn}.html").write_text(render_html(results, stamp), encoding="utf-8")
    print("report:", OUT / f"{fn}.html")


if __name__ == "__main__":
    main()
