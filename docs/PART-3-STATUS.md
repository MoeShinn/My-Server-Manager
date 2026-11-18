# PART 3 (P3) STATUS: Vỏ app, trang chung và build

## Trung thực về mức độ kiểm tra
- ĐÃ làm trong sandbox: `npm install` (mọi phiên bản trong package.json đều tồn tại), `npm run typecheck` (node + web) không lỗi, `npm run build` (electron-vite) ra `out/main`, `out/preload` (1 file CJS, chỉ `require("electron")`), `out/renderer`. `scripts/prepare-build.mjs` và `electron-builder.config.cjs` đã chạy thử với config.toml/icon giả.
- CHƯA làm: chưa mở app Electron thật, chưa chạy `electron-builder` (NSIS cần Windows), chưa thử tray/thoát an toàn/cập nhật/gỡ cài đặt với server thật. Việc typecheck/build dùng file giả (stub) cho service của P1, P2, P5 và trang của P2, P4, P5 (đã xoá, KHÔNG nằm trong bàn giao). Ghép thật có thể lộ lỗi kiểu nếu các phần khác lệch hợp đồng.

## Cách chạy thử
1. Cần Node 20+. Chạy `run-dev.bat` (tự `npm install` nếu thiếu rồi `npm run dev`).
2. Cần đủ file của các phần khác (config.toml, data.json, assets/icon.png, language/en.json...).

## Cách build bản cài
Chạy `build-setup.bat` (kiểm tra Node, npm install, prepare-build, build, electron-builder NSIS x64). Kết quả ở `dist/`. Nếu lỗi "symbolic link" khi tải winCodeSign: bật Developer Mode của Windows hoặc chạy bằng quyền Administrator.

## Phát hành bản cập nhật
1. Tăng `app_version` trong config.toml (nguồn duy nhất), điền `app_repo` thật (dạng `chu-so-huu/ten-repo`).
2. Chạy `build-setup.bat`.
3. Tạo GitHub Release có tag `v<app_version>` ở repo `app_repo`, đưa lên 3 file trong `dist`: file `.exe` cài đặt, `latest.yml`, file `.blockmap`.
4. `appId` (app_id) KHÔNG BAO GIỜ được đổi.

## Đã làm
Toàn bộ mục A–G của prompt: file dựng dự án; config/paths/settings/logger/ipcRegistry/preload/window/index; vòng đời (một bản duy nhất, khay, bấm X theo closeAction, thoát an toàn có timeout và ép tắt, session-end, nhận lại server mồ côi, tự chạy server); cập nhật (electron-updater); khởi động cùng Windows (`--hidden`); gỡ cài đặt; nhập server có sẵn; renderer (api, i18n, store, theme, UI kit, layout, hộp thoại toàn cục); trang Dashboard, Danh sách server, Tạo server; `locales-src/p3.en.json` (162 key, đã đối chiếu với code).

## Chỗ khác so với hợp đồng / prompt
1. **Preload và Proxy** (theo prompt): preload chỉ expose `window.mcmBridge = { invoke, on }`; Proxy `window.api` nằm ở `renderer/api.ts`.
2. **Gỡ cài đặt với deleteAllData**: chỉ xoá `serversDir` và `javaDir` (rồi xoá dataDir nếu rỗng), KHÔNG xoá toàn bộ nội dung dataDir, vì người dùng có thể đặt dataDir là thư mục như Documents.
3. **installerIcon/uninstallerIcon**: NSIS chỉ nhận `.ico`. Chỉ đặt khi `installer_icon` (hoặc `app_icon`) là `.ico`; nếu là PNG thì bỏ qua và electron-builder dùng icon app (tự chuyển từ PNG).
4. **ipcRegistry** bỏ qua tên hàm bắt đầu bằng `_` (hàm nội bộ của class).
5. **CSP dev**: `index.html` dùng CSP đúng prompt; riêng `npm run dev` plugin trong electron.vite.config.ts nới CSP (inline script của React refresh, websocket HMR). Bản build dùng CSP chặt.
6. **Vị trí thư viện**: thư viện chạy trong main (electron-updater, smol-toml, pidusage, extract-zip, semver) để ở `dependencies` (được externalize và đóng gói); thư viện renderer để ở `devDependencies` (được gói vào bundle).
7. `electron-builder.config.cjs` đặt `artifactName` là `${name}-Setup-${version}.${ext}` (tránh khoảng trắng trong tên file trên GitHub Release làm sai `latest.yml`) và `extraMetadata.version` lấy từ config.toml.
8. Giá trị `freeDiskMb` = 0 nếu không đọc được đĩa; trang Tạo server khi đó không hiện cảnh báo dung lượng.

## session-end (tắt máy / đăng xuất Windows)
Windows không cho chờ lâu và sự kiện không huỷ được. App gửi lệnh dừng tới mọi server (`engine.stopAll`), chờ tối đa khoảng 4 giây rồi thoát. Server lớn có thể không kịp lưu; lần mở app sau `recoverOrphans` sẽ xử lí.

## Thư viện thêm ngoài danh sách
Không có. (`tailwind.config.cjs` dùng `color-mix` của CSS cho màu có độ trong suốt.)

## Giả định
- Bản dịch tray/thông báo lấy từ `language.getDictionary(settings.language)`; nếu thiếu key thì tray dùng chữ Anh dự phòng 2 chuỗi (`Open app`, `Quit completely`).
- P3 chép `language/*.json` đóng gói sang `userData/language` nếu chưa có (`seedBundledLanguages`). Vô hại nếu P5 cũng làm.
- Không có sự kiện đổi settings trong EventPayloads, nên `api.ts` phát `mcm:settings-changed` sau `app.updateSettings`, `app.resetSettings` và MỌI lệnh `language.*` thành công (vì language service tự ghi `settings.language`). Trang của P4/P5 muốn nạp lại settings có thể lắng nghe sự kiện này.
- `ServerList` coi `custom` hiển thị tên jar bỏ `.jar`.
- Danh sách phiên bản Tạo server tô màu theo nhóm bằng bảng 10 màu cố định (viết cứng như prompt yêu cầu; vài màu sáng hơi nhạt trên theme sáng).

## Cần phần khác chỉnh / lưu ý
- **P5**: `config.toml` phải có đủ key bảng mục 7; `assets/icon.png` PNG vuông >= 256px (prepare-build sẽ dừng nếu thiếu). `language/en.json` phải có mọi key trong `locales-src/p3.en.json`, đặc biệt `app.tray.*`. Monaco phải cấu hình nạp cục bộ (`loader.config({ monaco })`), CSP chặn CDN và cần `worker-src blob:`.
- **P1/P2**: `engine.stopAllSequential` nên emit progress `timeout` rồi resolve (P3 xử lí cả trường hợp không emit bằng cách kiểm tra `runningServerIds()`). Create dùng `taskId` bắt đầu bằng `create-`; nút Huỷ gọi `content.cancelDownload` cho mọi task đang chạy (và task đầu tiên).
- **P4**: trang server dùng chung Zustand store ở `@/layout/stores` (`useServersStore`, `useSettingsStore`) và hook `useServerActions` nếu cần. UI kit có thêm `Field`, `StatusBadge`, `Modal.dismissible`, `Select` nhận `label` là ReactNode kèm `searchText`.
- Màu Tailwind: `bg-panel`, `bg-panel-2`, `border-line`, `text-fg`, `text-muted`, `text-accent`, `bg-accent`, `text-danger`, `text-success`, `text-warning`, `bg-bg`, hỗ trợ cả độ trong suốt (`bg-accent/10`).
