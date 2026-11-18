<div align="center">

<img src="assets/icon.png" alt="My Server Manager" width="120">

# My Server Manager

**Tạo và quản lí nhiều server Minecraft Java ngay trên máy của bạn, không cần dùng dòng lệnh.**

[![Release](https://img.shields.io/github/v/release/MoeShinn/My-Server-Manager?style=flat-square)](https://github.com/MoeShinn/My-Server-Manager/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/MoeShinn/My-Server-Manager/total?style=flat-square)](https://github.com/MoeShinn/My-Server-Manager/releases)
[![License](https://img.shields.io/github/license/MoeShinn/My-Server-Manager?style=flat-square)](legal/LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-informational?style=flat-square)

[Tải về](https://github.com/MoeShinn/My-Server-Manager/releases/latest) · [Báo lỗi](https://github.com/MoeShinn/My-Server-Manager/issues/new/choose) · [Đóng góp](CONTRIBUTING.md)

</div>

> Đây không phải sản phẩm chính thức của Minecraft. Ứng dụng không được Mojang hay Microsoft phê duyệt hay liên kết.

## Tính năng

- **Tạo server nhanh:** Vanilla, Paper, Purpur, Folia, Leaf, Fabric, Velocity hoặc jar tự chọn.
- **Tự tải mọi thứ cần thiết:** server jar và đúng bản Java cho từng server, bạn không phải cài Java.
- **Điều khiển và theo dõi:** chạy, dừng, khởi động lại, console realtime có gợi ý lệnh, Dashboard cho nhiều server.
- **Plugin và mod:** tìm, cài và gỡ từ Modrinth.
- **Quản lí tệp:** duyệt, đổi tên hàng loạt, di chuyển, xóa, sửa tệp bằng trình sửa tích hợp.
- **Cho bạn bè vào chơi:** hướng dẫn IP tùy chỉnh và playit.gg.
- **Chạy ổn định:** thu xuống khay hệ thống, tự khởi động server, tự khởi động lại khi crash, thoát an toàn (dừng từng server trước khi tắt app).
- **Đa ngôn ngữ:** tiếng Anh, tiếng Việt, song ngữ Việt-Anh; thêm ngôn ngữ mới chỉ bằng một tệp JSON.
- **Riêng tư:** không tài khoản, không thu thập dữ liệu.

## Cài đặt

Tải bản mới nhất ở trang [Releases](https://github.com/MoeShinn/My-Server-Manager/releases/latest).

| Hệ điều hành | Tệp | Ghi chú |
|---|---|---|
| Windows 10/11 (64-bit) | `mc-server-manager-Setup-<phiên bản>.exe` | Chạy tệp và làm theo hướng dẫn. |
| Linux (64-bit) | `mc-server-manager-<phiên bản>-linux-x64.AppImage` | Thử nghiệm. `chmod +x` rồi chạy tệp. |

Bản Windows chưa kí số, nên SmartScreen có thể cảnh báo "Unknown publisher". Bấm **More info** rồi **Run anyway**.

App tự kiểm tra cập nhật (có thể tắt trong **Cài đặt**).

## Dành cho nhà phát triển

Công nghệ: Electron, TypeScript, React, Tailwind, electron-vite. Cần Node 20 trở lên.

```bash
npm install
npm run dev          # chạy chế độ phát triển (Windows: run-dev.bat)
npm run typecheck    # kiểm tra kiểu
npm run build        # build mã nguồn vào thư mục out/
```

Tạo bản cài trên máy của bạn:

```bash
# Windows
build-setup.bat

# Linux
npm run prepare-build && npm run build
npx electron-builder --config electron-builder.config.cjs --linux --publish never
```

Nếu `npm run build` báo "heap out of memory", đặt `NODE_OPTIONS=--max-old-space-size=6144` trước khi chạy (các tệp `.bat` đã làm sẵn).

### Cấu trúc thư mục

```
config.toml        Cấu hình app (tên, phiên bản, kho GitHub, cửa sổ, liên kết pháp lí...)
data.json          Dữ liệu từ xa: mốc Java, liên kết tải Java, loader plugin, danh sách ngôn ngữ
assets/            Icon
language/          Tệp ngôn ngữ đóng gói sẵn: en.json, vi.json, vi-en.json
locales-src/       Chữ tiếng Anh gốc (app.en.json), gộp thành language/en.json
legal/             LICENSE, PRIVACY.md, THIRD_PARTY_NOTICES.md
tools/             build-language.mjs, make-icon.mjs, glossary.md
scripts/           prepare-build.mjs (đồng bộ version, kiểm tra icon)
src/main/          Tiến trình chính Electron: engine, content, files, language, app
src/preload/       Cầu nối an toàn giữa main và renderer
src/renderer/      Giao diện React
src/shared/        Kiểu dữ liệu và hợp đồng IPC dùng chung
.github/           Workflow build/phát hành, mẫu issue và pull request
```

### Cấu hình (`config.toml`)

Mỗi key có chú thích ngay phía trên. Các key chính:

- `app_name`, `app_id` (không đổi sau khi phát hành), `user_agent` (nên ghi kèm tên GitHub vì PaperMC và Modrinth yêu cầu).
- `app_repo`: kho chứa bản phát hành, dùng cho tính năng cập nhật.
- `data_repo`, `data_branch`: nơi app đọc `data.json` và ngôn ngữ tải thêm.
- `app_version`: **nơi duy nhất** đổi phiên bản, lúc build tự đồng bộ vào `package.json`.
- `installer_icon`: icon `.ico` cho trình cài đặt.

### Phát hành phiên bản mới (Dành cho thành viên phát triển phần mềm)

1. Sửa `app_version` trong `config.toml` (ví dụ `1.0.1`) rồi đẩy lên nhánh `main`.
2. Workflow **Release** tự chạy: so với commit trước, nếu version đổi thì build bản Windows (NSIS) và Linux (AppImage) trên GitHub Actions.
3. Workflow tạo release `v<phiên bản>` kèm tệp cài đặt và các tệp `latest.yml`, `latest-linux.yml`, `.blockmap` (cơ chế tự cập nhật của app đọc các tệp này). Nếu release cùng tag đã tồn tại, nó bị **xóa và tạo lại**.
4. Muốn build lại đúng phiên bản hiện tại: vào tab **Actions**, chọn **Release**, bấm **Run workflow** và tích `force`.

Nội dung mô tả release lấy từ [`.github/release-notes.md`](.github/release-notes.md) (`{{VERSION}}` và `{{REPO}}` được thay tự động).

### Kho dữ liệu (data repo)

App đọc `https://raw.githubusercontent.com/{data_repo}/{data_branch}/data.json` và ngôn ngữ ở `.../language/{mã}.json`. `data_repo` có thể trùng kho của app. Kho phải **công khai**, `data.json` và thư mục `language/` nằm ở **gốc** kho.

### Thêm ngôn ngữ

1. Tạo `language/<mã>.json` (mã dạng `vi`, `pt-br`...), có `_meta` gồm `code` và `name`.
2. Thêm vào mảng `languages` của `data.json`:
   `{ "code": "fr", "name": "Français", "file": "language/fr.json" }`
3. Đẩy lên kho dữ liệu. Người dùng thấy ngôn ngữ trong Cài đặt, mục "Tải thêm ngôn ngữ".

Công cụ `tools/build-language.mjs` (không cần thư viện ngoài, xem `--help`):

| Lệnh | Việc làm |
|---|---|
| `node tools/build-language.mjs` | Gộp `locales-src/*.en.json` thành `language/en.json`; báo lỗi nếu một key trùng nhưng khác nội dung. |
| `... --missing vi --chunk 80` | Liệt kê key còn thiếu của `vi` ra `tools/missing-vi-1.json`... để đem đi dịch. |
| `... --merge vi tools/missing-vi-1.json --name "Tiếng Việt"` | Gộp bản dịch vào `language/vi.json`, kiểm tra giữ nguyên tham số `{...}`. |
| `... --check` | Kiểm tra mọi tệp trong `language/`: tham số, key thiếu, key thừa. |

Khi dịch, dùng `tools/glossary.md` để thuật ngữ nhất quán.

## Hạn chế đã biết

- Bản Linux còn thử nghiệm, chưa được kiểm tra kĩ như bản Windows.
- Bản cài Windows chưa kí số nên có cảnh báo SmartScreen.
- Liên kết tải Java trong `data.json` dựng theo API của Eclipse Adoptium. Java 16 (đã hết hỗ trợ) và Java 7 có thể không có sẵn; mã băm `sha256` chưa điền.

## Đóng góp

Xem [CONTRIBUTING.md](CONTRIBUTING.md). Báo lỗi hoặc đề xuất tính năng ở [Issues](https://github.com/MoeShinn/My-Server-Manager/issues/new/choose).

## Ủng hộ

<a href="https://moeshinn.github.io/donate/"><img src="https://moeshinn.github.io/image/9sjqqzqk.png" alt="buy me a coffee" width="40%"></a>

## Giấy phép

[MIT](legal/LICENSE). Chính sách riêng tư: [PRIVACY.md](legal/PRIVACY.md). Thành phần bên thứ ba: [THIRD_PARTY_NOTICES.md](legal/THIRD_PARTY_NOTICES.md).

Minecraft là nhãn hiệu của Mojang AB / Microsoft. Đây không phải sản phẩm chính thức của Minecraft.
