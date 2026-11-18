# PART 5 (P5) - Ghi chú bàn giao

Phạm vi: file hỗ trợ, hệ thống ngôn ngữ, Quản lí tệp, trang Cài đặt.

## Nói thật về mức độ kiểm tra
**Chưa chạy thử trong Electron thật và chưa nhìn thấy giao diện render.** Những gì đã kiểm tra thực tế:
- Files service: 81 kiểm tra tự động bằng Node với `electron` giả (đường dẫn thoát ra ngoài, ổ đĩa, UNC, `.mcmanager`, symlink thư mục và symlink hỏng, tên Windows dành riêng, BOM, nhị phân, quá lớn, ghi nguyên tử, đổi tên chéo, đổi tên chỉ khác hoa thường, di chuyển trùng tên, xóa vào Thùng rác). Chạy trên Linux nên các hành vi riêng của Windows (khóa file EBUSY/EPERM, tên dành riêng thật sự bị HĐH chặn) **chưa** được thử.
- Language service: 20 kiểm tra với máy chủ HTTP giả (chép file ngôn ngữ mẫu, đọc từ điển có phủ tiếng Anh, tải/cập nhật/gỡ, sao lưu `.bak`, loại khóa nguy hiểm, `_meta.code` sai, `removeAll` đổi về `en` trước).
- `tools/build-language.mjs`: đã chạy cả bốn chế độ, gồm đường báo lỗi sai tham số. `tools/make-icon.mjs`: đã chạy, icon PNG 512x512 hợp lệ (đã xem ảnh), không ghi đè khi đã có.
- TypeScript `strict` không lỗi cho toàn bộ code P5 (main và renderer), nhưng dựa trên **bản stub** UI kit và `useT` do mình tự suy ra từ hợp đồng, không phải code thật của P3.
- Vite build thử `monacoSetup.ts` và import `?raw`: thành công, đủ 5 worker được đóng gói cục bộ. Chưa thử nạp trong cửa sổ Electron.
- Chưa kiểm tra: toàn bộ UI (bố cục, thanh kéo chia đôi, phím tắt, đổi tên tại chỗ, các Modal), vì chưa có UI kit thật.

## Đã xong
1. `config.toml` (15 key, comment tiếng Việt, nhóm theo mục), `data.json` (mốc Java, javaDownloads cho 8/11/16/17/21/25 Windows zip và Linux tar.gz, pluginLoaders, languages).
2. Ngôn ngữ: language service, `language/en.json` (sinh bằng công cụ, 176 key), `vi.json`, `vi-en.json`, `tools/build-language.mjs`, `tools/glossary.md` (46 mục), `tools/make-icon.mjs`, `assets/icon.png` và `icon.svg` (đã tạo sẵn).
3. Files service đủ 9 hàm theo hợp đồng.
4. Trang Cài đặt đủ 8 nhóm theo thứ tự yêu cầu.
5. Trang Quản lí tệp: thanh công cụ, breadcrumb, danh sách (chọn nhiều, phím tắt, giới hạn 500 hàng), đổi tên tại chỗ và theo lô, xóa, di chuyển, tệp/thư mục mới, trình sửa Monaco (nạp cục bộ, theme theo app, nút Lưu và Ctrl+S, hỏi khi chưa lưu), dải cảnh báo khi server chạy, gợi ý khóa cho `server.properties`.
6. `legal/` (LICENSE, PRIVACY song ngữ, THIRD_PARTY_NOTICES), `README.md`, `locales-src/p5.en.json`.

## Chưa xong
- **Thanh thẻ cho nhiều tệp mở cùng lúc** (ưu tiên thấp): trình sửa hiện chỉ mở một tệp, mở tệp khác thì hỏi nếu có thay đổi chưa lưu.
- **Java 7**: không có mục trong `javaDownloads` vì không có liên kết chắc chắn (đúng yêu cầu "không bịa liên kết").

## Liên kết và dữ liệu CHƯA kiểm chứng
- Toàn bộ địa chỉ Adoptium trong `data.json` (dựng theo mẫu API trong prompt, chưa mở thử từ máy này). Đáng nghi nhất: **Java 16** (đã hết hỗ trợ, có thể không còn bản JRE) và **Java 25** (mới). Tất cả để `sha256: null`.
- Danh sách khóa `server.properties` trong `monacoSetup.ts` viết theo trí nhớ, có thể thiếu hoặc thừa theo phiên bản Minecraft.
- Giấy phép trong THIRD_PARTY_NOTICES là loại mình chắc chắn ở mức thư viện chính; chưa chạy `license-checker`.

## Thư viện npm
Không thêm ngoài danh sách hợp đồng. P5 dùng: `monaco-editor`, `@monaco-editor/react`, `lucide-react`, `react-router-dom` (đều đã có trong hợp đồng).
```
npm i monaco-editor @monaco-editor/react lucide-react react-router-dom
```

## Giả định đã dùng
1. **Đường dẫn worker Monaco**: dùng `monaco-editor/editor/editor.worker?worker`, `monaco-editor/language/json/json.worker?worker`... (theo `exports` của `monaco-editor` 0.57.0, đã build thử thành công). Đường dẫn cũ `monaco-editor/esm/vs/...` **không còn chạy** với bản này. Nếu P3 ghim bản `monaco-editor` cũ hơn thì phải đổi lại.
2. **`?raw`**: `import ... from '../../../../legal/THIRD_PARTY_NOTICES.md?raw'` (từ `src/renderer/pages/Settings/`). Dev server có thể cần `server.fs.allow` bao gồm thư mục gốc dự án. Tệp `env.d.ts` trong `Files/` và `Settings/` chỉ có `/// <reference types="vite/client" />` để có kiểu cho `?raw` và `?worker`.
3. **UI kit của P3** (hợp đồng không nêu rõ kiểu, mình giả định):
   - `Select.onChange(value: string)` và `value` là chuỗi; `Toggle.onChange(checked: boolean)`; `TextInput.onChange(v: string)`.
   - `ProgressBar.value` là **0 đến 100** (không phải 0 đến 1), `null` là không xác định.
   - `Badge.color` nhận `'success' | 'warning' | 'muted'`.
   - `ConfirmDialog.message` là **chuỗi** (không phải JSX); mình nối câu bằng dấu cách, không dùng xuống dòng.
   - `Button` chuyển tiếp các props của `<button>` (mình dùng `title`, `disabled`, `aria-pressed`).
4. **`useT()`** nhận tham số thứ hai `Record<string, string | number>`, và mình gọi `t('errors.' + code, params)`.
5. **Lỗi qua IPC** có `.code` và `.params` (đọc bằng `readApiError`).
6. `engine.getServerFolder(id)` ném lỗi hoặc trả chuỗi rỗng khi không có server: cả hai đều thành `NOT_FOUND`.
7. Sau `app.updateSettings`/`resetSettings`, P3 phát `window` event `mcm:settings-changed`; trang Cài đặt cũng tự cập nhật từ giá trị trả về.
8. Task id tải Java là `java-<bản>` (như prompt P5 yêu cầu), P2 phải dùng đúng id này cho `download:progress` và `cancelDownload`.

## Điểm khác hoặc thêm so với prompt (có chủ ý)
- Files service: lỗi hệ thống `ENOENT` trả `NOT_FOUND` (prompt chỉ nói "lỗi khác là UNKNOWN"). `EBUSY/EPERM/EACCES` vẫn là `SERVER_RUNNING`.
- Files service chặn thêm: ký tự `:` trong đường dẫn (ổ đĩa, luồng NTFS), thành phần chỉ gồm dấu chấm/khoảng trắng (Windows coi `...` như `..`), và symlink hỏng.
- `readText` với tệp quá lớn vẫn kiểm tra nhị phân ở 8KB đầu và trả `binary` đúng.
- `listRemote` tải **cả** tệp `en.json` từ kho để so băm; nếu **một** tệp lỗi mạng thì cả danh sách báo `NETWORK` (đúng prompt). `installAll`/`updateAll` thì chạy hết các ngôn ngữ rồi báo lỗi đầu tiên, để một file hỏng không chặn các file còn lại.
- Mình không dùng key `common.*` của P3 (không biết P3 có những key nào): thêm `files.cancel`, `settings.cancel`, `settings.close`, `language.close`.
- Thêm nút Hủy khi tải Java (gọi `content.cancelDownload`).

## Chỗ cần phần khác chỉnh
- **P3 (theme):** thêm biến CSS `--info` (xanh dương, nút Di chuyển và icon cấu hình), `--purple` (icon jar), `--pink` (icon ảnh). Hiện mình dùng `var(--info, #60a5fa)` v.v. với màu dự phòng; nếu thêm biến thì màu dự phòng tự không còn dùng. P3 cũng cần cho `Box` nhận `className` có `!border-[var(--danger)]` (Tailwind) để viền đỏ của Vùng nguy hiểm thắng viền mặc định.
- **P3 (build):** chép `language/*.json` vào `resources/language/` (language service đọc `<resourcesDir>/language/`), chép `config.toml` vào resources, và gộp `locales-src/p*.en.json` bằng `node tools/build-language.mjs` trước mỗi lần build để `language/en.json` đầy đủ. Hiện `language/en.json` **chỉ chứa phần chữ của P5**.
- **P3 (routes):** `Files.tsx` dùng `useParams<{ id: string }>()`, route phải đặt tham số tên `id`. Trang cần cha có chiều cao xác định (mình dùng `h-full`).
- **P3 (vòng đời):** `app.uninstall`, `app.updateSettings({ dataDir })` (tự khởi động lại) và `app.pickFolder` phải đúng như hợp đồng; trang Cài đặt không tự tắt server.
- **P2:** `content.installJava(major)` ném `NOT_FOUND` khi không có liên kết (Java 7 hoặc mục `null`); trang Cài đặt hiện thông báo riêng cho trường hợp này. `content.listVersions(software, { forceRefresh: true })` được gọi lần lượt cho vanilla, paper, purpur, folia, leaf, fabric, velocity.
- **P3 (errors.\*):** cần có `errors.NOT_FOUND`, `errors.PATH_OUTSIDE_SERVER`, `errors.INVALID_INPUT`, `errors.SERVER_RUNNING`, `errors.NETWORK`... (mỗi ErrorCode một key, theo hợp đồng).
- **Gom `src/shared`:** mình không đưa 4 tệp `src/shared` vào gói bàn giao (P3 giữ bản chính thức). Code của mình import `@shared/types` (cả `AppException` là giá trị, không chỉ kiểu) và `@shared/constants` (`SERVER_META_DIR`).
