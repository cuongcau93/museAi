# MuseAuto Studio (clean-room)

Công cụ desktop (Electron) **tự viết lại từ đầu** để sản xuất video "faceless" hàng loạt.
Đây là bản dựng độc lập — **không** sao chép mã nguồn của bất kỳ phần mềm nào khác;
chỉ tái hiện *chức năng* (ý tưởng/chức năng không được bảo hộ bản quyền).

## Tính năng

**Giai đoạn 1**

| Module | Mô tả |
|---|---|
| **Storyboard** | Kịch bản → chia cảnh tự động → sinh prompt ảnh nhất quán (giữ phong cách + nhân vật cố định). Hoàn toàn offline. |
| **Ghép video** | Ảnh + lồng tiếng + nhạc nền → MP4, hiệu ứng Ken Burns + chuyển cảnh crossfade. Dùng ffmpeg kèm sẵn. |
| **Phụ đề** | Whisper.cpp chạy **offline** → xuất `.srt`. (Bạn tự tải binary + model, không kèm file bản quyền.) |

**Giai đoạn 2**

| Module | Mô tả | Test |
|---|---|---|
| **Giọng đọc (TTS)** | Edge neural voices (miễn phí, có giọng Việt). Lấy lời dẫn từ Storyboard → .mp3 lồng tiếng. | ✅ tạo MP3 thật |
| **muse.ai automation** | Playwright điều khiển Chrome đã đăng nhập, chạy hàng loạt prompt → tải ảnh. Selector cấu hình ở Cài đặt. | ⚙️ engine ✅; flow muse.ai cần chỉnh selector theo DOM thật |
| **Đa tài khoản** | Mỗi tài khoản = 1 profile Chrome riêng, giữ phiên đăng nhập độc lập. | ✅ |

**Giai đoạn 3**

| Module | Mô tả | Test |
|---|---|---|
| **AI kịch bản (Claude)** | Chủ đề → Claude viết kịch bản → phân cảnh art-director nhất quán nhân vật (JSON). Model mặc định `claude-opus-5-5`, API key ở Cài đặt. | ⚙️ build ✅; gọi API cần key của bạn |
| **Ghi cứng phụ đề** | Burn .srt lên video (Shorts/TikTok dọc), cỡ chữ/viền tuỳ chỉnh, hỗ trợ tiếng Việt có dấu. | ✅ render + xác minh chữ trên khung hình |
| **Đăng MXH** | Soạn bài Facebook tự động (mặc định chỉ soạn, không tự đăng), mở LadiPage/web trong profile. | ⚙️ build ✅; flow cần chỉnh selector |

**Giai đoạn 4 — full parity (dựng lại các view còn thiếu của bản gốc)**

| Module | Mô tả | Test |
|---|---|---|
| **Clone** | Pipeline faceless đầy đủ: kịch bản/audio → phân tích style+nhân vật → tách cảnh → prompt → ảnh từng cảnh → clip → ghép. Dùng Claude nếu có key, nếu không chạy offline. | ✅ build + hạ tầng chạy |
| **Studio (hàng đợi)** | Bảng điều khiển tạo hàng loạt: soạn nhiều prompt → task queue → run/stop/clear, theo dõi trạng thái realtime. | ✅ queue chạy LIVE |
| **Tư liệu (Assets)** | Store dùng chung `studio.json`: dự án, nhân vật cố định (+ảnh), mẫu prompt. | ✅ |
| **Thư viện (Library)** | Duyệt thư mục output, lọc ảnh/video, chọn nhiều → ghép/xoá/mở. | ✅ |
| **API server** | REST cục bộ `127.0.0.1:48900` `/api/v1/tasks`, Bearer auth, không CORS. | ✅ **test LIVE**: POST→queue→file, 401 khi thiếu key |
| **Task executor** | `demo` (ffmpeg vẽ ảnh/clip placeholder — chạy không cần tài khoản) \| `muse` (automation thật). | ✅ demo render ảnh+clip |
| **i18n + Theme** | Đổi ngôn ngữ VI/EN (nav), theme tối/sáng, lưu localStorage. | ✅ |

**Chưa dựng (logic nằm trong worker Python biên dịch của bản gốc — không đọc được):**
"Bộ hiểu" Muse & prompt-pack riêng của họ (bản này thay bằng Claude/offline), chuỗi drama nhiều tập (`drama:*`), sinh kịch bản từ trang sản phẩm (`scripts:generate` + fetch-html), xuất bản Facebook Reels qua Graph API token, tích hợp LadiPage sâu, và phần **bản quyền/license** (cố ý bỏ).

## Chạy

```bash
cd museauto-studio
npm install          # cài electron + ffmpeg-static
npm start            # mở app
```

> Lưu ý: nếu máy có biến môi trường `ELECTRON_RUN_AS_NODE=1`, hãy xoá nó trước khi chạy
> (nếu không Electron sẽ chạy như Node thuần và app không mở được).

## Đóng gói ra .exe cài đặt

```bash
npm run dist         # tạo bộ cài NSIS trong thư mục dist/
```

## Cấu hình Whisper (cho tab Phụ đề)

1. Tải whisper.cpp: https://github.com/ggerganov/whisper.cpp (lấy `whisper-cli.exe` / `main.exe`).
2. Tải model ggml (vd `ggml-base.bin`).
3. Mở app → **Cài đặt** → trỏ tới 2 file trên.

## Kiến trúc

```
src/
  main/                 # tiến trình chính (Node/Electron, CommonJS)
    main.js             # tạo cửa sổ + IPC
    services/
      storyboard-service.js   # kịch bản → cảnh → prompt
      ffmpeg-service.js       # dựng filter_complex, Ken Burns + xfade
      whisper-service.js      # audio→wav 16k→whisper→srt
  preload/preload.cjs   # cầu nối an toàn (contextIsolation ON)
  renderer/             # giao diện (HTML/CSS/JS thuần)
```

## muse.ai — cấu hình selector (quan trọng)

Vì DOM của muse.ai do bên họ quản lý và có thể đổi, module automation để **selector cấu hình được**
(Cài đặt → "muse.ai selector DOM"). Mở muse.ai, bấm F12, tìm đúng selector cho ô nhập prompt,
nút tạo, và ảnh kết quả rồi dán vào. Cú pháp theo Playwright (vd `button:has-text("Generate")`).

> ⚠️ Tự động hoá web có thể vi phạm Điều khoản dịch vụ của muse.ai. Chỉ dùng trên tài khoản của bạn.
> App **không** lưu mật khẩu — bạn đăng nhập thủ công một lần, phiên được giữ trong profile Chrome.

## AI kịch bản — cần Claude API key

Tab **AI kịch bản** gọi Claude (SDK chính thức, model mặc định `claude-opus-5-5`).
Mở **Cài đặt → Claude API**, dán key `sk-ant-...`, Lưu. Key chỉ lưu cục bộ trên máy bạn
và chỉ gửi tới API của Claude. Sau đó: nhập chủ đề → **1 · Viết kịch bản** → **2 · Phân cảnh + prompt**,
kết quả tự đồng bộ sang tab muse.ai và Giọng đọc.

## Lộ trình (có thể làm tiếp)

- Pipeline một-nút: chủ đề → kịch bản → ảnh (muse.ai) → TTS → ghép video → phụ đề, tự động toàn bộ.
- Lên lịch đăng (scheduler) nhiều bài/nhiều kênh.
- Tạo thumbnail tự động.

## Giấy phép

MIT (phần code trong repo này). Bạn sở hữu toàn quyền với bản dựng này.
