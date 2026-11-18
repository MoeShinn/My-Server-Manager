# INTEGRATION-REPORT (tiếng Việt)

## 1. Tình trạng (sau Giai đoạn 0)
Đã kiểm tra thật (sandbox Linux, Node 22):
- `npm install`: OK.
- `npm run typecheck` (node + web): sạch, không lỗi.
- `npm run build`: main, preload, renderer đều build ra (sau khi sửa lỗi Monaco bên dưới).
- 4 file `src/shared/` so với mục 4-6 hợp đồng: giống từng dòng (đã so bằng script, bỏ qua comment và khoảng trắng).
- Cây thư mục khớp mục 3 hợp đồng, không có file trùng giữa các phần, chỉ có một bản `src/shared`.

CHƯA kiểm tra: mở Electron thật, giao diện, Windows (taskkill, khóa file), mạng thật (Modrinth, Leaf, playit, Adoptium), electron-builder.

## 2. Lỗi đã sửa
| File | Lỗi | Cách sửa | Phần |
|---|---|---|---|
| language/en.json | Chỉ có 177/639 key (thiếu 463 key của P1-P4), giao diện sẽ hiện key trần | Chạy `node tools/build-language.mjs` (gộp 5 file locales-src, không có key trùng khác nội dung) | P5 |
| package.json | Không có bước nào tự gộp ngôn ngữ trước khi chạy/build | Thêm script `predev` và `prebuild` chạy `node tools/build-language.mjs` | P3 / P5 |
| run-dev.bat, build-setup.bat | Dấu xuống dòng kiểu Linux (LF), cmd Windows có thể báo không tìm thấy nhãn `:fail` | Đổi sang CRLF | P3 |
| src/renderer/styles/index.css | Thiếu biến `--info`, `--purple`, `--pink` mà trang Tệp (P5) dùng, đang rơi về màu cứng dự phòng | Thêm 3 biến cho cả theme tối và sáng | P3 |
| language/vi.json, language/vi-en.json | Mới có 176/639 key, phần lớn giao diện hiện tiếng Anh khi chọn tiếng Việt | Dịch 463 key còn thiếu theo `tools/glossary.md` (xưng "bạn", chính tả "í", giữ nguyên `{tham số}`). `vi-en` tạo bằng bảng thay thuật ngữ rồi rà lại. Công cụ `--check`: 639/639 key, 0 lỗi tham số | P5 |
| package.json | `monaco-editor ^0.52.2` không có đường dẫn `monaco-editor/editor/editor.worker?worker` mà `monacoSetup.ts` import, nên renderer không build được | Nâng lên `^0.57.0` (đúng giả định của P5) | P3 (ghim phiên bản) / P5 |

## 2b. Giai đoạn 1 đã kiểm tra
- Preload build ra 1 file CJS, chỉ `require("electron")`. Main chỉ require các thư viện nằm trong `dependencies`.
- `main` trong package.json (`./out/main/index.js`) khớp thư mục build. Alias `@` và `@shared` đúng ở cả 3 tsconfig/vite.
- `main/index.ts` ghép đúng thứ tự content, engine, files, language, app, đúng tên hàm và `deps`; có gọi `recoverOrphans` rồi `startAutoStartServers`.
- `config.toml` đủ 15 key, `config.ts` đọc đúng từng key. `prepare-build` chạy OK, icon 512x512 hợp lệ.
- `electron-builder.config.cjs` nạp được, `extraResources` gồm config.toml, data.json, language, assets, legal. Dev: `resourcesDir` = gốc dự án; đóng gói: `process.resourcesPath`.
- CHƯA chạy `electron-builder` (cần Windows). `app_repo` vẫn là `OWNER/REPO` nên chưa có tự cập nhật.

## 2c. Giai đoạn 2 đã đối chiếu (12 mục)
1. Service: chạy thật 4 service (giả `electron`), so với EngineApi/ContentApi/FilesApi/LanguageApi: không thiếu hàm, không lộ hàm nội bộ ra renderer. AppApi: kiểu trả về `AppApi`, typecheck sạch.
2. Cầu IPC: preload chỉ expose `mcmBridge`; `api.ts` dựng Proxy, ném lỗi có `.code` và `.params`; mọi chỗ gọi `api.*` đều qua kiểu `Api` nên typecheck bảo đảm hàm có thật.
3. Sự kiện: 11 kênh trong `EventPayloads`, các `emit` và `api.on` đều dùng đúng tên, đúng kiểu.
4. Dữ liệu trên đĩa: P1 ghi `.mcmanager/config.json`, P2 đọc đúng đường dẫn và trường (software, modKind, mcVersion, folder), có chặn thoát thư mục. `run.json` (P1) và `installed-content.json` (P2) khác tên. Trang Tệp ẩn `.mcmanager`.
5. `config.toml` đủ 15 key, `data.json` đúng kiểu DataJson, P2 và P5 đọc đúng tên trường.
6. Tạo server: `create-<id>` dùng cho cả tải jar và Java; màn tạo nhận theo tiền tố `create-`; sự kiện `done` của jar không bị hiểu là tạo xong (chỉ khi `servers.create` trả về); Hủy gọi `cancelDownload`. Tải Java ở Cài đặt dùng `java-<bản>` khớp P2.
7. Route: 11 route đủ file và `export default` (typecheck `lazy`); HashRouter; menu trái đúng route, ẩn Plugins/Mods khi `modKind = none`.
8. UI kit: `ProgressBar` 0-100, `ConfirmDialog.message` nhận ReactNode, `Badge.color` nhận chuỗi, `Box` nhận className. Khớp mọi giả định của P2, P4, P5.
9. Ngôn ngữ: 459 key tĩnh dùng trong code đều có trong en.json; 12 họ key động (errors.*, status, software, quit state, playit state, props) đều đủ. Không còn chữ cứng hiển thị (chỉ `server.jar` và `Ctrl+S` là kĩ thuật).
10. Thoát an toàn: đúng luồng X, khay, confirmQuit, stopAllSequential, forceQuit, cancelQuit; `before-quit` không lặp; `recoverOrphans` rồi `startAutoStartServers` chạy sau khi cửa sổ sẵn sàng.
11. Cài đặt: tên trường khớp AppSettings; `mcm:settings-changed` có 2 chỗ nghe (store, trang Cài đặt); đổi `dataDir` kiểm tra server đang chạy, rồi tự khởi động lại; đổi ngôn ngữ tải lại từ điển ngay.
12. Đường dẫn/HĐH: không có dấu gạch chéo ngược viết cứng; `taskkill`, `tasklist`, `cmd.exe` đều nằm sau kiểm tra `process.platform`; `removeContent`, `installContent` chặn `..`, dấu gạch, id lạ.

## 3. Chưa sửa / cần quyết định
- Build renderer dùng nhiều RAM (Monaco, chunk FileEditor ~7.9 MB). Trong sandbox 4 GB phải đặt `NODE_OPTIONS=--max-old-space-size=3500`. Nếu máy bạn báo "heap out of memory" khi build thì thêm biến này vào `build-setup.bat` / `run-dev.bat`.
- `vi.json` và `vi-en.json` mới có 176/639 key; key còn thiếu tự rơi về tiếng Anh. Muốn dịch đủ: `node tools/build-language.mjs --missing vi --chunk 80`, dịch rồi `--merge`.
- `data.json`: mốc Java của P5 là 1.2.5 -> 8, 1.17 -> 17, 1.18 -> 17, 1.20.5 -> 21, 26.1 -> 25. Hợp đồng nêu ví dụ 1.7 -> 7 và 1.17 -> 16. Bản của P5 vẫn chạy được (Java 17 chạy 1.17) và không có Java 7/16 do không có link chắc chắn. Cần bạn xác nhận giữ nguyên.
- Khi đổi `dataDir`, app gọi `app.exit(0)` sau 500 ms mà không dừng playit agent (nếu đang chạy có thể còn sót tiến trình). Mức thấp. Trong chế độ dev, `app.relaunch()` không mở lại đúng (chỉ ảnh hưởng dev).
- Worker Monaco build ra file riêng, CSP là `worker-src 'self' blob:`; cần xem có chạy khi mở từ file:// trong Electron thật không (Giai đoạn 4).

## 4. Tính năng còn thiếu (Giai đoạn 3)
Ưu tiên theo mức quan trọng cho người dùng:

| Ưu tiên | Phần | Việc còn thiếu | Tình trạng |
|---|---|---|---|
| 1 | P1 | Không còn mục nào bỏ dở (tạo, chạy, dừng, console). Hạn chế đã biết: Velocity chỉ đồng bộ cổng vào `velocity.toml` từ lần start thứ 2; server "nhận lại" không gửi lệnh được | Không cần làm thêm |
| 2 | P3 | Thoát an toàn và chạy ngầm đã đủ | Không cần làm thêm |
| 3 | P5 | Ngôn ngữ `vi` và `vi-en` thiếu 463 key | **ĐÃ LÀM** (xem bảng lỗi đã sửa). Còn lại: từ vựng `vi` chưa đồng nhất hoàn toàn (một số chuỗi cũ của P5 dùng "server" và "ứng dụng", chuỗi mới dùng "máy chủ"), mức thấp |
| 4 | P5 | Thanh thẻ nhiều tệp mở cùng lúc trong trình sửa | CHƯA làm, mức thấp. Ước lượng: viết lại `Files.tsx` và `FileEditor.tsx` (~300 dòng, giữ nhiều model Monaco, hỏi khi đóng thẻ chưa lưu). Không làm khi chưa thấy được giao diện thật |
| 5 | P2 | Link Java 7 không có; Java 16 và 25 chưa kiểm chứng | Cần kiểm tra link Adoptium trên máy có mạng (Giai đoạn 4) |
| 5 | P4 | Lịch sử lệnh console và danh sách lệnh đã gõ chỉ lưu trong bộ nhớ, mất khi mở lại app | CHƯA làm, mức thấp (cần ghi file, hợp đồng không có API cho việc này) |
| 6 | P4 | Mô tả cờ JVM viết theo trí nhớ, cần đối chiếu với giá trị P1 sinh ra | Cần người đọc rà |

## 5. Giả định chưa xác minh
Link Java Adoptium và hash (đặc biệt Java 16, 25), đầu ra playit agent, JSON API Leaf, nạp worker Monaco trong Electron thật, CSP `worker-src blob:`.

## 6. Chạy / build
`run-dev.bat` (chạy thử), `build-setup.bat` (ra `dist/`). Phát hành: tăng `app_version` trong `config.toml`, điền `app_repo`, build, tạo GitHub Release tag `v<version>` kèm `.exe`, `latest.yml`, `.blockmap`.
