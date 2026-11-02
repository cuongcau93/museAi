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
