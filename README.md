# My Server Manager

Ứng dụng desktop (Windows trước, Linux làm sau) giúp người không rành dòng lệnh tạo và quản lí **nhiều server Minecraft Java** ngay trên máy: tự tải server jar (Vanilla, Paper, Purpur, Folia, Leaf, Fabric, Velocity hoặc jar tự chọn), tự tải đúng bản Java cho từng server, chạy/dừng, console realtime, quản lí plugin/mod (Modrinth), quản lí tệp, địa chỉ IP/playit.gg. Không tài khoản, không thu thập dữ liệu.

> Đây không phải sản phẩm chính thức của Minecraft. Ứng dụng không được Mojang hay Microsoft phê duyệt hay liên kết.

<a href="https://moeshinn.github.io/donate/"><img src="https://moeshinn.github.io/image/9sjqqzqk.png" alt="buy me a coffee" width="40%"></a>

## Cấu trúc thư mục

```
config.toml        Cấu hình app (tên, phiên bản, kho GitHub, cửa sổ, liên kết pháp lí...)
data.json          Dữ liệu từ xa: mốc Java, liên kết tải Java, loader plugin, danh sách ngôn ngữ
assets/            Icon (icon.png, icon.svg)
language/          File ngôn ngữ đóng gói sẵn: en.json, vi.json, vi-en.json
locales-src/       Chữ tiếng Anh gốc của từng phần (p1.en.json ... p5.en.json)
legal/             LICENSE, PRIVACY.md, THIRD_PARTY_NOTICES.md
tools/             build-language.mjs, make-icon.mjs, glossary.md
docs/              PART-<n>-STATUS.md (ghi chú bàn giao từng phần)
src/main/          Tiến trình chính (Electron): engine, content, files, language, app
src/preload/       Cầu nối an toàn giữa main và renderer
src/renderer/      Giao diện React
src/shared/        Kiểu dữ liệu và hợp đồng dùng chung
```

## Chạy thử (dev)

Cần Node 20 trở lên.

```
npm install
run-dev.bat
```

(`run-dev.bat` và `build-setup.bat` do phần P3 cung cấp.)

## Icon

Tạo icon tạm (hình khối lập phương xanh lá, không cần thư viện ngoài):

```
node tools/make-icon.mjs
```

Nếu `assets/icon.png` đã có thì lệnh sẽ KHÔNG ghi đè. Thêm `--force` để ghi đè. Khi có logo riêng, chỉ cần thay `assets/icon.png` (PNG vuông, từ 256x256 trở lên) và `assets/icon.svg`.

## Build bản cài

```
build-setup.bat
```

Bản cài dùng NSIS, cài theo từng người dùng, `appId` lấy từ `config.toml`.

## Chỉnh config.toml

Mỗi key có chú thích tiếng Việt ngay phía trên. Những chỗ cần sửa trước khi phát hành:

- `app_name`, `app_id` (không đổi sau khi phát hành), `app_repo`, `data_repo`.
- `app_version` là nơi DUY NHẤT đổi phiên bản, lúc build sẽ đồng bộ vào `package.json`.
- `user_agent`: nên ghi kèm tên GitHub của bạn để liên hệ, vì PaperMC và Modrinth yêu cầu.
- `privacy_policy_url`, `license_url`: điền địa chỉ https thật, để rỗng thì nút tương ứng trong Cài đặt bị vô hiệu.

## Dựng kho dữ liệu (data repo)

1. Tạo một kho GitHub công khai (có thể trùng kho của app).
2. Đặt `data.json` và thư mục `language/` ở **gốc** kho.
3. Điền `data_repo` (dạng `chủ/kho`) và `data_branch` trong `config.toml`.

App đọc dữ liệu tại `https://raw.githubusercontent.com/{data_repo}/{data_branch}/data.json` và ngôn ngữ tại `.../{data_branch}/language/{mã}.json`.

## Thêm ngôn ngữ mới

1. Tạo `language/<mã>.json` (mã dạng `vi`, `pt-br`...). File có `_meta` gồm `code` và `name`.
2. Thêm một dòng vào mảng `languages` của `data.json`:
   `{ "code": "fr", "name": "Français", "file": "language/fr.json" }`
3. Đẩy lên kho dữ liệu. Người dùng sẽ thấy ngôn ngữ trong Cài đặt, mục "Tải thêm ngôn ngữ".

## Dùng tools/build-language.mjs

Công cụ không cần thư viện ngoài. Xem hướng dẫn: `node tools/build-language.mjs --help`.

| Lệnh | Việc làm |
|---|---|
| `node tools/build-language.mjs` | Gộp mọi `locales-src/*.en.json` thành `language/en.json`. Báo lỗi nếu một key trùng nhưng khác nội dung. |
| `... --missing vi --chunk 80` | Liệt kê key còn thiếu của `vi` ra `tools/missing-vi-1.json`... (mỗi file tối đa 80 key) để đem đi dịch. |
| `... --merge vi tools/missing-vi-1.json --name "Tiếng Việt"` | Gộp bản dịch vào `language/vi.json`. Kiểm tra mỗi key giữ nguyên tham số `{...}`. |
| `... --check` | Kiểm tra mọi file trong `language/`: tham số, số key thiếu, số key thừa. |

Khi dịch, dùng `tools/glossary.md` để thuật ngữ nhất quán giữa `vi` và `vi-en`.

## Việc cần kiểm tra trước khi phát hành

- [ ] **Liên kết Java chưa được kiểm chứng.** Các địa chỉ trong `javaDownloads` của `data.json` được dựng theo mẫu API của Eclipse Adoptium
  (`https://api.adoptium.net/v3/binary/latest/<bản>/ga/<hệ điều hành>/x64/jre/hotspot/normal/eclipse`) nhưng chưa được mở thử. Hãy tải thử từng liên kết, nhất là Java 16 (đã hết hỗ trợ, có thể không còn JRE) và Java 25. Nếu bản nào không có JRE thì đổi `jre` thành `jdk`.
- [ ] **Điền sha256.** Mọi mục Java đang để `"sha256": null`. Khi biết mã băm (Adoptium công bố kèm mỗi bản), điền vào để app kiểm tra tính toàn vẹn khi tải.
- [ ] **Java 7** không có mục tải nào (chưa có liên kết chắc chắn). Server rất cũ cần Java 7 sẽ phải tự cung cấp.
- [ ] **Giấy phép:** `legal/LICENSE` là MIT với chỗ trống `<YEAR>` và `<OWNER>`. Hãy điền, hoặc đổi sang giấy phép bạn muốn.
- [ ] **Liên hệ trong `legal/PRIVACY.md`:** điền `<DATE>` và `<CONTACT>`/`<LIÊN HỆ>`.
- [ ] **`legal/THIRD_PARTY_NOTICES.md`:** chạy `npx license-checker --production --summary` và bổ sung nếu cần.
- [ ] **URL trong `config.toml`:** `app_repo`, `data_repo`, `privacy_policy_url`, `license_url`.
- [ ] **Thay icon tạm** bằng logo của bạn.

Minecraft là nhãn hiệu của Mojang AB / Microsoft. Đây không phải sản phẩm chính thức của Minecraft.
