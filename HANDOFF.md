# SolSongs PoC: Handoff (repo/worker vẫn tên songreel)

Bài hát tặng riêng: trang chủ → khách điền bảng hỏi → AI viết lời tiếng Việt → Suno hát 2 bản → nghe thử 40s → thanh toán (giả lập) mở bản đầy đủ → tuỳ chọn dựng MV.

- **Trang chủ:** `src/web/Home.tsx` + `home.css`, lấy theo `ref/solsongs-v1.6.1.html` (logo sóng âm, lưới dịp tặng 3D ở `homeOccArt.ts`, giai điệu mẫu ở `homeBed.ts`). `?start=1` vào thẳng bảng hỏi.
- **Deploy gần nhất:** 2026-11-23, version `c3161ae4` (sửa tỉ lệ khung xem trước MV). Đã chạy migration `0002_mvs.sql` và `0003_acoustic.sql` trên D1 remote.

- **URL:** https://songreel-poc.quann111.workers.dev
- **Benchmark viết lời:** https://songreel-poc.quann111.workers.dev/bench/
- **Demo không tốn tiền:** thêm `?mock=1` vào URL (dữ liệu giả, không gọi AI)

## Hạ tầng

- **Cloudflare account Qquankun@gmail.com** (`6a959e87aaf889d75de1f587de9f89cb`), đã pin trong `wrangler.jsonc`. Mọi lệnh wrangler đều chạy kèm `CLOUDFLARE_ACCOUNT_ID=6a959e87aaf889d75de1f587de9f89cb`. Không đụng worker `roomcraft-ai` cùng account.
- **Worker `songreel-poc`:**
  - Hono API trên `/api/*`. SPA React do binding `ASSETS` phục vụ.
  - Cron chạy mỗi phút để xử lý tiếp các đơn mà khách đã đóng tab.
- **D1 `songreel`** (`249a274e-…`): bảng `orders` và `mvs`, xem `migrations/`. `0003_acoustic.sql` thêm cột `orders.acoustic`; `0004_mv_story.sql` thêm `mvs.story` và `mvs.approved_at`.
- **KV `songreel-blobs`** (`8227a667…`): lưu mp3 và ảnh bìa. Dùng KV vì token wrangler không có quyền R2.
- **Secrets:** `RUNNINGHUB_API_KEY` (key của RoomCraft, tiền trừ ví RoomCraft), `POC_PASSCODE` (mã truy cập ở bước cuối bảng hỏi) và `OPENAI_API_KEY` (Whisper đo mốc lời cho MV Pro; thiếu thì dùng mốc ước lượng). Bản local nằm trong `.dev.vars` (đã gitignore).
- **RunningHub** (`src/worker/runninghub.ts`) theo developer kit chính thức: https://github.com/HM-RunningHub/ComfyUI_RH_OpenAPI/tree/main/developer-kit (`llms.txt`, `rh-api-contract.md`).
  - Endpoint và tham số chỉ lấy từ `model-registry.public.json` của kit, không tự đặt. Base URL giữ `https://www.runninghub.ai/openapi/v2` (key chạy trên `.ai`).
  - File cục bộ (ảnh khách) upload qua `/media/upload/binary` rồi mới dùng URL. `FAILED` và `CANCEL` đều là lỗi. Chỉ thử lại lỗi mạng, 429, 5xx. Response cuối lưu KV `rhraw/<taskId>` 30 ngày.
  - Registry còn liệt kê `seedance-v1.5-pro` nhưng gọi thật báo "đã ngừng dịch vụ" (2026-11-23).

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
7. **Bản acoustic (mua kèm):** `POST /api/orders/:id/acoustic` (cần mã truy cập) gửi Suno thu lại cùng lời với style guitar/piano mộc (`ACOUSTIC_STYLE`), giữ nhịp và giọng của bản chính.
   - Suno ra 2 bản, chỉ giữ bản đầu, lưu KV `audio/<id>/acoustic`. Trạng thái nằm trong cột `orders.acoustic` (JSON).
   - `GET /api/orders/:id` và cron hỏi tiếp khi đang thu. Lỗi thì gọi lại endpoint để thu lần nữa.
   - Đo thật trên local: xong sau khoảng 50 giây.

## MV Amateur (`src/worker/mv.ts`, `src/shared/mv.ts`)

Khách đã có bài → chọn mức MV, khổ 9:16/16:9, tuỳ chọn tối đa 3 ảnh người nhận → server dựng cảnh → trình duyệt ghép video. Mục này là kiểu **lai** (mức Amateur); mức Pro/Cinematic xem mục "MV kể chuyện" bên dưới.

1. **Chia cảnh** (`planScenes`, dùng chung client/server): mỗi câu hát 1 cảnh, thêm cảnh mở đầu và kết.
   - Suno không trả mốc thời gian, nên giọng hát được ước lượng chiếm 8%..94% bài, chia đều theo số chữ.
   - Kiểu **lai**: chỉ cảnh điệp khúc có clip, mua 6s, phần còn lại của cảnh là ảnh tĩnh có Ken Burns.
   - Kiểu **toàn clip**: mọi cảnh là clip 4–15s.
2. **Director:** GPT-6.1 Sol viết bible gồm nhân vật, bối cảnh, look, cùng prompt ảnh và prompt chuyển động cho từng cảnh. Prompt nằm ở `prompts.ts`, chỉ phía server.
3. **Ảnh nhân vật gốc:** Nano Banana 2.1 official (`rhart-image-n-nb21-official`, $0.03/ảnh). Có ảnh khách thì đưa vào làm reference. Ảnh khách lưu ở KV `mvphoto/` 7 ngày và không phục vụ ra ngoài.
4. **Ảnh từng cảnh:** Nano Banana 2.1 image-to-image, dùng ảnh gốc làm reference để giữ mặt.
5. **Clip:** Seedance 2.0 mini i2v 720p, endpoint trong registry `rhart-video/sparkvideo-2.0-mini/image-to-video` (tên trong registry: "seedance-2.0-mini"). Endpoint cũ `bytedance/seedance-2.0-global-mini` không có trong registry nên đã bỏ.
   - Tính tiền theo giây: đo thật 6 giây 720p hết $0.60.
   - Có khung cuối (`lastFrameUrl`), 4–15 giây. Bật `realPersonMode: true`.
6. **Xử lý song song và lỗi:** chạy tối đa 8 task cùng lúc cho mỗi MV.
   - Ảnh lỗi 2 lần thì dùng ảnh gốc thay vào.
   - Clip lỗi 2 lần thì cảnh đó thành ảnh tĩnh.
   - Quá 45 phút thì báo lỗi.
7. **Ghép video:** làm trên trình duyệt (`src/web/mvRender.ts`).
   - Canvas vẽ: thẻ "Dành tặng", ảnh Ken Burns, clip, chuyển cảnh mờ dần, chữ karaoke, logo.
   - Xuất bằng `canvas.captureStream` + `MediaRecorder`, ưu tiên MP4, mất đúng bằng thời lượng bài.

Giá bán tạm theo bản ref: Amateur +299k, Pro +1.000.000đ, Cinematic +2.500.000đ (`MV_TIERS` trong `src/shared/mv.ts`).
- Amateur chạy kiểu **lai** (khoảng $5 cho bài 3 phút). Pro và Cinematic cùng chạy kiểu **story**. Kiểu **toàn clip** cũ vẫn còn trong code nhưng không mức nào dùng.

## MV kể chuyện: mức Pro/Cinematic (`src/worker/mvStory.ts`)

Làm theo `ref/CAM_Creative_Pipeline_MV_Online.md` của director, chạy hết trên RunningHub, chỉ Whisper là của OpenAI. Mỗi bước là một `stage` trong bảng `mvs`, được `GET /api/mv/:id` và cron đẩy tiếp.

1. **`timing`:** Whisper `whisper-1` nghe bản phối, có lời bài làm gợi ý (`openai.ts`). Sau đó căn mốc vào lời có sẵn bằng quy hoạch động (`align.ts`).
   - Câu không khớp thì nội suy theo nhịp hát thật, đặt sát trước câu đo được kế tiếp. Khớp dưới 35% số câu thì dùng mốc ước lượng.
   - Không có lời gợi ý, Whisper bịa chữ khi nghe nhạc. Tách giọng trước thì gần như đúng hết, nhưng file stem (`mureka-ai/stem-song`) nặng 164 MB, Worker không tải nổi, nên chưa dùng.
   - Chia shot 4–15 giây theo mốc (`planShots`): mỗi câu 1 shot, đoạn nhạc dạo dài thành shot riêng.
   - Kiểm tra căn lời trên 1 kết quả Whisper: `node --experimental-strip-types tools/align_check.ts <whisper.json> <lyrics.txt> <duration>`.
2. **`script`:** GPT-6.1 Sol (`MV_STORY_SYSTEM` trong `prompts.ts`) viết logline, tối đa 2 nhân vật và 3 bối cảnh, mỗi shot có khung đầu, khung cuối, chuyển động và chỉ đạo diễn xuất tiếng Việt.
3. **`sheets`:** Seedream 5.5 vẽ character sheet (có ảnh khách thì dùng làm tham chiếu) và location sheet.
4. **`frames`:** Seedream 5.5 vẽ khung đầu (tham chiếu: sheet nhân vật + bối cảnh) rồi khung cuối (tham chiếu: khung đầu + sheet nhân vật). Khoảng $0.036 mỗi ảnh.
5. **`review`:** dừng lại, không tính giờ. Xưởng MV hiện storyboard; phòng chiếu phát khung hình trên nhạc như animatic.
   - Khách bấm "Duyệt và quay video" → `POST /api/mv/:id/approve` (cần mã truy cập).
6. **`clips`:** Seedance 2.0 mini quay mỗi shot từ khung đầu tới khung cuối, không tiếng. Link RunningHub quá 20 giờ thì upload lại khung từ KV.
7. **Lỗi và giới hạn:**
   - Mỗi ảnh/clip thử tối đa 2 lần. Khung đầu hỏng thì dùng ảnh bối cảnh; khung cuối hỏng thì quay chỉ với khung đầu; clip hỏng thì cảnh thành ảnh tĩnh.
   - Từ lúc tạo tới storyboard tối đa 40 phút; từ lúc duyệt tới xong clip tối đa 60 phút.
8. **Chưa làm so với tài liệu:** chọn take và căn cue tự động, tạo lại từng cảnh, ghép trên server (Creatomate).

Phụ đề trong video chạy theo mốc đo được (`lineTimes`), không hiện chữ trong lúc nhạc dạo.

## Frontend (`src/web/`)

- React 19. Trang chủ, bảng hỏi, màn chờ, màn kết quả và Xưởng MV tự vẽ bằng HTML/CSS lấy từ `ref/solsongs-v1.6.1.html`, không dùng component Astryx:
  - `StudioShell.tsx`: thanh trên cùng (logo sóng âm, tab Trang chủ / Bài hát / Xưởng MV, nút "Kết nối AI") và lớp bọc `.studio`. Tab Xưởng MV chỉ bấm được khi bài đã xong; nút "Kết nối AI" chỉ hiện thông báo đang phát triển.
  - `studio.css`: CSS của bản ref lồng trong `.studio`, kèm phần trả lại margin/màu chữ mà reset của Astryx đã xoá. Phần riêng của app nằm ở cuối file.
  - `Wizard` (8 chương, cột tiến trình bên trái), `Waiting`, `Result`.
  - `MvStudio` có 2 trạng thái:
    - Chưa dựng (`?studio=1`): thẻ "Nguyên liệu" cho chọn ảnh nhân vật, khung hình, mức Amateur/Pro/Cinematic, mã truy cập, rồi bấm "▶ Dựng MV". Storyboard hiện các cảnh dự kiến, phòng chiếu phát bài kèm phụ đề.
    - MV kể chuyện ở bước duyệt: hộp "Duyệt và quay video" kèm chi phí clip, logline, ảnh nhân vật/bối cảnh, chỉ đạo diễn xuất và khung cuối từng cảnh.
    - Đã dựng (`?mv=<id>&tier=`): thông tin MV, tiến độ, nút "Tạo file MV ↓", timeline bấm để tua, storyboard có ảnh/clip.
    - Bản ref còn cho nhập lời, sửa mô tả và tạo lại từng cảnh; app chưa có API đó nên bỏ.
- Không còn màn nào dùng component Astryx. `main.tsx` vẫn nạp reset và 7 theme của Astryx (CSS của các màn dựa trên reset đó); nút đổi theme bị ẩn.
- So với bản ref, app bỏ: "Dựng MV từ bài có sẵn", phong cách hình, độ phân giải clip, cách chia cảnh. App thêm ở chương 8: chọn AI viết lời và mã truy cập.
- Màn kết quả:
  - Hộp thanh toán có 2 ô mua kèm: gói tạo phim Amateur +299k và bản acoustic +49k; nút hiện đúng tổng. Tích acoustic thì sau khi thanh toán (giả lập) app gọi thu bản acoustic thật, xong hiện thành "Bản acoustic" trong trình phát và nút tải.
  - Hộp "Biến bài hát thành thước phim" chỉ có lời giới thiệu và nút "Mở Xưởng MV →", như bản ref. Form dựng MV nằm trong Xưởng MV.
  - Trạng thái đã thanh toán nằm trong `App` nên đi Xưởng MV rồi quay lại vẫn giữ. Tải lại trang thì mất (thanh toán còn giả lập), trừ khi đơn đã đặt bản acoustic.
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
- `e2e_mv.py <base> <order-id> [hybrid|full|story] [9:16|16:9]`: dựng 1 MV thật cho 1 đơn đã xong (tốn tiền thật). Kiểu story dừng ở bước duyệt storyboard.
- `align_check.ts`: kiểm tra căn lời và chia shot trên 1 kết quả Whisper.

## Chưa làm / chưa kiểm chứng

- Thanh toán thật (Viết Quân làm riêng), gửi email/Zalo. Gói tạo phim chưa trừ vào giá MV thật, chỉ đổi nhãn "Đã có trong gói".
- MV:
  - Mốc thời gian lời là ước lượng, nên chữ có thể lệch nhạc vài giây.
  - Chưa ghép phía server (4K, xuất nhanh), vì Worker không chạy được ffmpeg, cần Container.
  - Chưa thử xuất trên điện thoại.
  - Mở MV không cần mã. Chỉ tạo MV mới cần mã.
- Audio QC (loudness/clipping): hiện chỉ kiểm tra có file.
- Giá mỗi lần gọi LLM qua RunningHub: response chỉ trả token, chưa có số tiền.
- Độ ổn định khi nhiều đơn cùng lúc, tỉ lệ Suno lỗi.
- Đánh giá lời bằng người Việt đọc/nghe mù.
