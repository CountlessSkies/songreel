# SolSongs PoC: Handoff (repo/worker vẫn tên songreel)

Bài hát tặng riêng: trang chủ → khách điền bảng hỏi → AI viết lời tiếng Việt → Suno hát 2 bản → nghe thử 40s → thanh toán (giả lập) mở bản đầy đủ → tuỳ chọn dựng MV.

- **Trang chủ:** `src/web/Home.tsx` + `home.css`, lấy theo `ref/solsongs-v1.6.1.html` (logo sóng âm, lưới dịp tặng 3D ở `homeOccArt.ts`, giai điệu mẫu ở `homeBed.ts`). `?start=1` vào thẳng bảng hỏi.
- **Deploy gần nhất:** 2026-11-22, version `e33fa2ed` (trang chủ v1.6.1). Đã chạy migration `0002_mvs.sql` trên D1 remote.

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

## MV tạm (`src/worker/mv.ts`, `src/shared/mv.ts`)

Khách đã có bài → chọn kiểu MV, khổ 9:16/16:9, tuỳ chọn tối đa 3 ảnh người nhận → server dựng cảnh → trình duyệt ghép video.

1. **Chia cảnh** (`planScenes`, dùng chung client/server): mỗi câu hát 1 cảnh, thêm cảnh mở đầu và kết.
   - Suno không trả mốc thời gian, nên giọng hát được ước lượng chiếm 8%..94% bài, chia đều theo số chữ.
   - Kiểu **lai**: chỉ cảnh điệp khúc có clip, mua 6s, phần còn lại của cảnh là ảnh tĩnh có Ken Burns.
   - Kiểu **toàn clip**: mọi cảnh là clip 4–15s.
2. **Director:** GPT-6.1 Sol viết bible gồm nhân vật, bối cảnh, look, cùng prompt ảnh và prompt chuyển động cho từng cảnh. Prompt nằm ở `prompts.ts`, chỉ phía server.
3. **Ảnh nhân vật gốc:** Nano Banana 2.1 official (`rhart-image-n-nb21-official`, $0.03/ảnh). Có ảnh khách thì đưa vào làm reference. Ảnh khách lưu ở KV `mvphoto/` 7 ngày và không phục vụ ra ngoài.
4. **Ảnh từng cảnh:** Nano Banana 2.1 image-to-image, dùng ảnh gốc làm reference để giữ mặt.
5. **Clip:** Seedance 2.0 mini i2v 720p (`/bytedance/seedance-2.0-global-mini/image-to-video`).
   - **Tính tiền theo giây**: $0.1/s ở 720p, $0.05/s ở 480p. Bản fast giá $0.16/s.
   - Ảnh có người thật thì bắt buộc bật `realPersonMode: true`.
6. **Xử lý song song và lỗi:** chạy tối đa 8 task cùng lúc cho mỗi MV.
   - Ảnh lỗi 2 lần thì dùng ảnh gốc thay vào.
   - Clip lỗi 2 lần thì cảnh đó thành ảnh tĩnh.
   - Quá 45 phút thì báo lỗi.
7. **Ghép video:** làm trên trình duyệt (`src/web/mvRender.ts`).
   - Canvas vẽ: thẻ "Dành tặng", ảnh Ken Burns, clip, chuyển cảnh mờ dần, chữ karaoke, logo.
   - Xuất bằng `canvas.captureStream` + `MediaRecorder`, ưu tiên MP4, mất đúng bằng thời lượng bài.

Giá bán tạm: lai +299k, toàn clip +699k. Chi phí AI đo cho bài 3 phút: lai khoảng $5, toàn clip 720p khoảng $19.

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
- `mv_test.py`: gọi thử 1 ảnh và 1 clip để đo giá và thời gian.
- `e2e_mv.py <base> <order-id> [hybrid|full] [9:16|16:9]`: dựng 1 MV thật cho 1 đơn đã xong (tốn tiền thật).

## Chưa làm / chưa kiểm chứng

- Thanh toán thật (Viết Quân làm riêng), gửi email/Zalo, bản acoustic.
- MV:
  - Mốc thời gian lời là ước lượng, nên chữ có thể lệch nhạc vài giây.
  - Chưa ghép phía server (4K, xuất nhanh), vì Worker không chạy được ffmpeg, cần Container.
  - Chưa thử xuất trên điện thoại.
  - Mở MV không cần mã. Chỉ tạo MV mới cần mã.
- Audio QC (loudness/clipping): hiện chỉ kiểm tra có file.
- Giá mỗi lần gọi LLM qua RunningHub: response chỉ trả token, chưa có số tiền.
- Độ ổn định khi nhiều đơn cùng lúc, tỉ lệ Suno lỗi.
- Đánh giá lời bằng người Việt đọc/nghe mù.
