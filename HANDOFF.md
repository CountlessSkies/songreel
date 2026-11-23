# SolSongs PoC: Handoff (repo/worker vẫn tên songreel)

Bài hát tặng riêng: trang chủ → khách điền bảng hỏi → AI viết lời tiếng Việt → Suno hát 2 bản → nghe thử 40s → thanh toán (giả lập) mở bản đầy đủ → tuỳ chọn dựng MV.

- **Trang chủ:** `src/web/Home.tsx` + `home.css`, lấy theo `ref/solsongs-v1.6.1.html` (logo sóng âm, lưới dịp tặng 3D ở `homeOccArt.ts`, giai điệu mẫu ở `homeBed.ts`). `?start=1` vào thẳng bảng hỏi.
- **Deploy gần nhất:** 2026-11-23, version `1728ac8d` (tải trọn clip trước khi ghép, prompt director v2 chưa thử thật, dừng MV rõ ràng khi ví RunningHub hết tiền). Đã chạy migration `0002`–`0004` trên D1 remote; secret `RUNNINGHUB_API_KEY`, `POC_PASSCODE`, `OPENAI_API_KEY` lấy từ `.dev.vars`.

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

## MV kể chuyện (`src/worker/mvStory.ts`, `mv.ts`, `src/shared/mv.ts`)

Khách đã có bài → vào Xưởng MV, chọn mức, khổ 9:16/16:9, tuỳ chọn tối đa 3 ảnh người nhận → server dựng storyboard → khách duyệt → server quay clip → trình duyệt ghép video. **Cả 3 mức chạy chung pipeline này, chỉ khác model quay video** (`MV_TIERS`):

| Mức | Giá bán tạm | Video | Chi phí AI ước tính (bài 3 phút) |
|---|---|---|---|
| Amateur | +299.000đ | Veo 3.1 fast, khung đầu + cuối (`rhart-video-v3.1-fast/start-end-to-video`), clip luôn 8s, tính theo lượt (~$0.21/clip, giá tham khảo của kit, chưa đo thật) | ~$6.5 |
| Pro | +1.000.000đ | Seedance 2.0 mini 720p (`rhart-video/sparkvideo-2.0-mini/image-to-video`), 4–15s theo đúng độ dài cảnh, $0.10/giây (đo thật) | ~$20 |
| Cinematic | +2.500.000đ | Tạm giống Pro. Thiết kế ghi Seedance 2.5 (đắt gấp 3) | ~$20 |

Thiết kế v1.6.1 còn ghi Amateur dùng ảnh Nano Banana Pro và Pro dùng Gemini Omni Flash 1.2; app dùng Seedream 5.5 cho ảnh mọi mức, và Gemini Omni 1.2 không có trên RunningHub.
Cảnh dài hơn clip (Veo luôn 8s) thì sau khi clip hết, video đứng ở khung cuối (`mvRender.ts`).
Pipeline cũ (kiểu "lai" và "toàn clip": Nano Banana, mỗi câu 1 ảnh, mốc lời ước lượng) đã gỡ ngày 2026-11-23. MV cũ đã dựng xong vẫn mở xem và xuất video được.

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
6. **`clips`:** quay mỗi shot từ khung đầu tới khung cuối bằng model của mức MV (bảng trên); tiếng của clip bị tắt khi ghép. Link RunningHub quá 20 giờ thì upload lại khung từ KV.
   - Bước kịch bản gọi LLM dạng stream (proxy của RunningHub cắt yêu cầu không stream sau 100s, lỗi 524) và tự thử lại tối đa 3 lần.
7. **Lỗi và giới hạn:**
   - Mỗi ảnh/clip thử tối đa 2 lần. Khung đầu hỏng thì dùng ảnh bối cảnh; khung cuối hỏng thì quay chỉ với khung đầu; clip hỏng thì cảnh thành ảnh tĩnh.
   - Từ lúc tạo tới storyboard tối đa 40 phút; từ lúc duyệt tới xong clip tối đa 60 phút.
8. **Chưa làm so với tài liệu:** chọn take và căn cue tự động, tạo lại từng cảnh, ghép trên server (Creatomate).

Phụ đề trong video chạy theo mốc đo được (`lineTimes`), không hiện chữ trong lúc nhạc dạo.

## Frontend (`src/web/`)

- React 19. Trang chủ, bảng hỏi, màn chờ, màn kết quả và Xưởng MV tự vẽ bằng HTML/CSS lấy từ `ref/solsongs-v1.6.1.html`, không dùng thư viện component nào (đã gỡ Astryx):
  - `StudioShell.tsx`: thanh trên cùng (logo sóng âm, tab Trang chủ / Bài hát / Xưởng MV, nút "Kết nối AI") và lớp bọc `.studio`. Tab Xưởng MV chỉ bấm được khi bài đã xong; nút "Kết nối AI" chỉ hiện thông báo đang phát triển.
  - `app.css`: chỉ phần nền chung (box-sizing, font, nền tối), giống đầu CSS của bản ref.
  - `studio.css`: CSS của bản ref lồng trong `.studio`. Phần riêng của app nằm ở cuối file.
  - `Wizard` (8 chương, cột tiến trình bên trái), `Waiting`, `Result`.
  - `MvStudio` có 2 trạng thái:
    - Chưa dựng (`?studio=1`): thẻ "Nguyên liệu" cho chọn ảnh nhân vật, khung hình, mức Amateur/Pro/Cinematic, mã truy cập, rồi bấm "▶ Dựng MV". Storyboard hiện các cảnh dự kiến, phòng chiếu phát bài kèm phụ đề.
    - MV kể chuyện ở bước duyệt: hộp "Duyệt và quay video" kèm chi phí clip, logline, ảnh nhân vật/bối cảnh, chỉ đạo diễn xuất và khung cuối từng cảnh.
    - Đã dựng (`?mv=<id>&tier=`): thông tin MV, tiến độ, nút "Tạo file MV ↓", timeline bấm để tua, storyboard có ảnh/clip.
    - Bản ref còn cho nhập lời, sửa mô tả và tạo lại từng cảnh; app chưa có API đó nên bỏ.
- Trang benchmark `/bench/` (sinh bởi `tools/bench_lyrics.py`) cũng theo giao diện v1.6.1.
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
- `e2e_mv.py <base> <order-id> [amateur|pro|cinematic] [9:16|16:9]`: dựng 1 MV thật cho 1 đơn đã xong tới bước duyệt storyboard (~$2, tốn tiền thật).
- `align_check.ts`: kiểm tra căn lời và chia shot trên 1 kết quả Whisper.

## Việc tiếp theo (cập nhật 2026-11-23 chiều)

- **Ví RunningHub hết tiền** (lỗi `Insufficient balance`): nạp xong mới dựng được MV hay tạo bài mới. MV giờ dừng với dòng "Ví RunningHub hết tiền…".
- **Prompt director v2 chưa thử thật** vì ví hết tiền. Nạp tiền xong thì chạy `python tools/e2e_mv.py http://127.0.0.1:8787 9a7f9b2a1f8a amateur 9:16` (khoảng $2) và xem storyboard:
  - có cảnh hồi tưởng cho lời "ngày xưa/hồi bé" không;
  - có 3–5 bối cảnh không;
  - cỡ cảnh có đa dạng không.
- **"Phân cảnh có vấn đề"** (góp ý của anh Hà, 09:56): chưa rõ ý. Hiện mỗi câu hát là một cảnh khoảng 5–6 giây; nếu ý là cắt quá đều thì có thể ghép 2 câu thành một cảnh ở verse. Hỏi lại anh Hà trước khi sửa.
- MV Pro `2cce065f6a91` của anh Hà: cảnh cuối bị RunningHub từ chối lúc gửi quay clip (chưa rõ lý do; từ bản này lỗi được lưu vào `clipError` của cảnh).

## Tách giọng trước Whisper (làm ngày 2026-11-24)

**Vấn đề.** Bước `timing` cho Whisper nghe bản phối đầy đủ (kèm lời làm gợi ý) thì lúc được lúc không:
- Bài "Mẹ Ơi, Mừng Sinh Nhật" (đơn local `9a7f9b2a1f8a`): đo được 17/19 câu.
- Bài "Xa Nhau Vẫn Chung Trời" (đơn live `d4bd30aec86b`): Whisper bịa chữ ("Hãy subscribe cho kênh…"), căn lời được 0 câu nên dùng mốc ước lượng. MV vẫn ra, nhưng phụ đề và cảnh có thể lệch nhạc vài giây.
- Khi nghe **giọng hát đã tách** (kèm lời gợi ý), Whisper ra gần như đúng hết từng câu, sai số dưới 1 giây (đã thử ngày 2026-11-23 trên bài "Mẹ Ơi").

**Kế hoạch** (sửa `src/worker/mvStory.ts` bước `timing`, thêm 1 file xử lý zip/WAV):
1. Gửi task `mureka-ai/stem-song` (có trong registry; tham số `url` = link nhạc upload qua `/media/upload/binary`, `model: 'audio-separation-1'`).
   - Đo thật: 43 giây, $0.06.
   - Kết quả là 1 file **zip 164 MB** chứa `vocals.wav`, `bass.wav`, `drums.wav`, `instrumental.wav`, `other.wav`, `song.wav`, `song.mp3`. Mỗi WAV khoảng 34 MB, nén deflate.
   - Bước `timing` thành nhiều lượt: lượt 1 gửi task, các lượt sau hỏi trạng thái. Lưu `stemTask`, `stemTries` vào `story`.
2. **Không tải cả zip** (Worker giới hạn 128 MB bộ nhớ). Dùng HTTP Range:
   - Đọc khoảng 64 KB cuối file để lấy End of Central Directory và central directory.
   - Tìm mục `vocals.wav` (offset local header, kích thước nén khoảng 24 MB, method 8 = deflate).
   - Range tải đúng đoạn đó: đọc 30 byte local header để lấy độ dài tên và extra, rồi tới phần dữ liệu nén.
   - Giải nén bằng `DecompressionStream('deflate-raw')` (có sẵn trong Worker).
   - Chưa kiểm tra server COS của RunningHub có nhận Range không; nếu không nhận thì bỏ qua bước này.
3. `vocals.wav` khoảng 34 MB, vượt giới hạn 25 MB của OpenAI. Cắt phần PCM làm 2 nửa, mỗi nửa ghép header WAV mới (chỉ copy byte, không resample), gửi Whisper 2 lần, cộng offset thời gian cho nửa sau. Giữ lời bài làm `prompt` cho cả 2 nửa.
4. Ghép các từ của 2 nửa rồi đưa vào `alignLyrics` như hiện tại.
5. **Đường lùi:** tách giọng lỗi, hết thời gian, hoặc không đọc được zip thì quay về cách hiện tại (Whisper nghe bản phối → không khớp thì mốc ước lượng).
6. **Rủi ro CPU:** giải nén 24 MB có thể vượt giới hạn CPU nếu tài khoản Cloudflare ở gói miễn phí (10 ms/request). Chưa biết tài khoản đang ở gói nào.
   - Lỗi vượt CPU làm request chết, không bắt được bằng try/catch.
   - Vì vậy phải lưu `stemProcessTries` vào DB **trước** khi xử lý nặng; nếu đã thử 2 lần thì đi thẳng đường lùi.
7. **Kiểm tra:**
   - Chạy lại đơn `d4bd30aec86b` (hoặc `9a7f9b2a1f8a` ở local) bằng `python tools/e2e_mv.py <base> <order> amateur 9:16`, dừng ở bước duyệt, khoảng $2.
   - Xem `story.timing` có ra `measured` không, và `story.timingNote`.
   - Kiểm tra căn lời trên file Whisper tải về bằng `tools/align_check.ts`.

**Đã loại:**
- Whisper của Cloudflare Workers AI (`@cf/openai/whisper`, `whisper-large-v3-turbo`): nghe bài hát bịa chữ nặng, kể cả khi đã tách giọng.
- `rhart-audio/extract-vocal` của RunningHub: trả về gọn hơn nhưng không có trong registry, và tài liệu chính thức ghi chỉ nhận video MP4/MOV.

## Kết quả test thật (2026-11-23)

- **Amateur** trên live (MV `2602ffa124fb`, bài 2:20, 9:16): xong sau 10,6 phút, tốn $5.62.
  - Storyboard: 5,3 phút, $1.62.
  - 20 clip Veo 3.1 fast: 5,4 phút, $4.00 ($0.20/clip). 20/20 clip đạt, mỗi clip 8 giây 720×1280; khung đầu và khung cuối của clip khớp ảnh đã duyệt.
  - Mốc lời: ước lượng (xem mục trên).
- **Pro** (Seedance 2.0 mini): storyboard chạy thật ở local, 5 phút, $1.86. **Bước quay clip chưa chạy thật trong pipeline.**
- **Cinematic**: giống Pro, chưa chạy thật.
- 2 lần anh Hà thử Pro lúc 01:09 và 01:36 đều lỗi `RunningHub LLM 524`. Đã sửa bằng cách gọi LLM dạng stream (version `d6ce6339`).

## Chưa làm / chưa kiểm chứng

- Thanh toán thật (Viết Quân làm riêng), gửi email/Zalo. Gói tạo phim chưa trừ vào giá MV thật, chỉ đổi nhãn "Đã có trong gói".
- MV:
  - Mốc lời có khi phải dùng ước lượng (xem "Việc tiếp theo"), lúc đó chữ có thể lệch nhạc vài giây.
  - Chưa ghép phía server (4K, xuất nhanh), vì Worker không chạy được ffmpeg, cần Container.
  - Chưa thử xuất trên điện thoại.
  - Mở MV không cần mã. Chỉ tạo MV mới cần mã.
- Audio QC (loudness/clipping): hiện chỉ kiểm tra có file.
- Giá mỗi lần gọi LLM qua RunningHub: response chỉ trả token, chưa có số tiền.
- Độ ổn định khi nhiều đơn cùng lúc, tỉ lệ Suno lỗi.
- Đánh giá lời bằng người Việt đọc/nghe mù.
