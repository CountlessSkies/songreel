# SolSongs PoC: Handoff (repo/worker vẫn tên songreel)

Bài hát tặng riêng: khách điền bảng hỏi → AI viết lời tiếng Việt → Suno hát 2 bản → nghe thử 40s → thanh toán (giả lập) mở bản đầy đủ.

- **URL:** https://songreel-poc.quann111.workers.dev
- **Benchmark viết lời:** https://songreel-poc.quann111.workers.dev/bench/
- **Demo không tốn tiền:** thêm `?mock=1` vào URL (dữ liệu giả, không gọi AI)

## Hạ tầng

- **Cloudflare account Qquankun@gmail.com** (`6a959e87aaf889d75de1f587de9f89cb`), đã pin trong `wrangler.jsonc`. Mọi lệnh wrangler đều chạy kèm `CLOUDFLARE_ACCOUNT_ID=6a959e87aaf889d75de1f587de9f89cb`. Không đụng worker `roomcraft-ai` cùng account.
- **Worker `songreel-poc`:**
  - Hono API trên `/api/*`. SPA React do binding `ASSETS` phục vụ.
  - Cron chạy mỗi phút để xử lý tiếp các đơn mà khách đã đóng tab.
- **D1 `songreel`** (`249a274e-…`): bảng `orders`, xem `migrations/0001_orders.sql`.
- **KV `songreel-blobs`** (`8227a667…`): lưu mp3 và ảnh bìa. Dùng KV vì token wrangler không có quyền R2.
- **Secrets:** `RUNNINGHUB_API_KEY` (key của RoomCraft, tiền trừ ví RoomCraft) và `POC_PASSCODE` (mã truy cập ở bước cuối bảng hỏi). Bản local nằm trong `.dev.vars` (đã gitignore).

## Pipeline (`src/worker/pipeline.ts`)

1. **Brief:** chuẩn hoá bảng hỏi, chặn nội dung vi phạm bằng regex `BLOCK`, tự chọn giọng khi khách để "Chọn giúp tôi".
2. **Lyricist:** gọi LLM qua `llm.runninghub.ai` với model khách chọn (`WRITERS` trong `src/shared/catalog.ts`):
   - `sol` = `openai/gpt-6.1-sol` (mặc định)
   - `claude` = `anthropic/claude-sonnet-5.5`
   - `gemini` = `google/gemini-4-hydrogen`
   - Prompt nằm ở `src/worker/prompts.ts`, chỉ phía server.
   - Nếu model trả JSON hỏng, server tự cắt bớt rồi parse lại.
3. **Critic:** luật của prototype v1.03 (`src/worker/critic.ts`). Nếu vi phạm luật cứng thì sửa, tối đa 3 lần gọi tổng cộng.
4. **Music Director:** ghép style tags (thể loại, cảm xúc, thời đại, giọng, nhạc cụ, BPM) và gắn tag `[Verse]/[Chorus]` cho lời.
5. **Producer:** Suno v6 custom (`/rhart-audio/suno-v6/custom`, $0.08 cho 2 bản). Link kết quả chỉ sống 24h nên tải ngay về KV.
6. **Đẩy đơn:**
   - `GET /api/orders/:id` chạy bước tiếp theo ngay trong request. Viết lời bằng Sol có thể mất khoảng 40s.
   - Khoá `busy_until` trong D1 chặn 2 request gọi trùng một bước.

## Frontend (`src/web/`)

- React 19 + Astryx. Khách đổi được 7 theme (góc dưới trái): Butter (mặc định), Y2K, Matcha, Chocolate, Stone, Neutral, Gothic.
- Font ép về Be Vietnam Pro vì font gốc của các theme thiếu dấu tiếng Việt.
- Có 3 màn: `Wizard` (5 bước), `Waiting`, `Result`.
  - Nghe thử 40s bắt đầu từ khoảng 1/4 bài, vì Suno không trả mốc điệp khúc.
  - Lời bài mờ từ sau điệp khúc đầu.
- Khoá nghe thử chỉ làm phía client. File mp3 đầy đủ vẫn tải được qua `/api/media/...` nếu biết link.

## Chạy và deploy

```bash
npm install
npm run dev            # Vite :5180, proxy /api -> wrangler dev :8787
npm run dev:worker     # wrangler dev (doc .dev.vars)
CLOUDFLARE_ACCOUNT_ID=6a959e87aaf889d75de1f587de9f89cb npm run deploy
```

## Công cụ (`tools/`)

- `suno_test.py`: gọi thử Suno trực tiếp, tải mp3 về `out/suno/`.
- `bench_lyrics.py`: benchmark viết lời nhiều model, xuất JSON + HTML vào `out/bench/`.
- `e2e_orders.py`: tạo đơn thật trên URL deploy cho từng model rồi poll đến khi xong (tốn tiền thật).

## Chưa làm / chưa kiểm chứng

- Thanh toán thật (Viết Quân làm riêng), gửi email/Zalo, video lời bài, bản acoustic.
- Audio QC (loudness/clipping): hiện chỉ kiểm tra có file.
- Giá mỗi lần gọi LLM qua RunningHub: response chỉ trả token, chưa có số tiền.
- Độ ổn định khi nhiều đơn cùng lúc, tỉ lệ Suno lỗi.
- Đánh giá lời bằng người Việt đọc/nghe mù.
