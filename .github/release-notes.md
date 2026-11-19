## My Server Manager v{{VERSION}}

Bản phát hành đầu tiên. Ứng dụng quản lí server Minecraft Java dành cho người không rành dòng lệnh. Có bản **Windows** và **Linux**.

### Tính năng chính
- Tạo server chỉ vài cú bấm: Vanilla, Paper, Purpur, Folia, Leaf, Fabric, Velocity hoặc jar tự chọn
- Tự tải server jar và đúng bản Java cho từng server, bạn không phải cài Java
- Chạy, dừng, khởi động lại; console realtime có gợi ý lệnh (Tab)
- Quản lí nhiều server cùng lúc: Start all, Stop all, Dashboard theo dõi RAM và CPU, có biểu đồ đường và tùy chỉnh được bố cục
- Nhập server có sẵn: chuyển cả thư mục vào app, tự đọc `.mcmanager/config.json` nếu có
- Tìm, cài và gỡ plugin/mod từ Modrinth
- Quản lí tệp có trình sửa tích hợp (Monaco), đổi tên hàng loạt, di chuyển, xóa
- Hướng dẫn IP tùy chỉnh và playit.gg để bạn bè vào chơi
- Thu xuống khay hệ thống, tự khởi động server, tự khởi động lại khi crash
- Thoát an toàn: dừng từng server lần lượt trước khi tắt app
- Tự kiểm tra và cập nhật phiên bản mới (tắt được trong Cài đặt)
- Không tài khoản, không thu thập dữ liệu

### Ngôn ngữ
- Bản cài có sẵn **English** và **Tiếng Việt - English** (song ngữ)
- Các ngôn ngữ khác tải thêm trong **Cài đặt > Tải thêm ngôn ngữ**: Tiếng Việt, 简体中文, Português (Brasil), Русский, Bahasa Indonesia, Deutsch, Español
- Hộp tải có danh sách cuộn và ô tìm kiếm: gõ mã (`en`, `vi`, `ru`, `jp`...) hoặc tên ngôn ngữ (`English`, `Việt Nam`, `viet nam`...), không phân biệt hoa thường và dấu
- Muốn thêm ngôn ngữ mới chỉ cần một tệp JSON, đặt vào thư mục ngôn ngữ của app

### Cài đặt

**Windows**
1. Tải `mc-server-manager-Setup-{{VERSION}}.exe` ở phần **Assets** bên dưới
2. Chạy file và làm theo hướng dẫn
3. Mở app, bấm tạo server

**Linux** (thử nghiệm)
1. Tải `mc-server-manager-{{VERSION}}-linux-x64.AppImage` ở phần **Assets** bên dưới
2. Cho phép chạy: `chmod +x mc-server-manager-{{VERSION}}-linux-x64.AppImage` (hoặc chuột phải > Properties > cho phép chạy như chương trình)
3. Bấm đúp để mở, hoặc chạy `./mc-server-manager-{{VERSION}}-linux-x64.AppImage`

**Yêu cầu:** Windows 10/11 64-bit, hoặc Linux 64-bit có giao diện đồ họa (Ubuntu 22.04+ có thể cần cài thêm `libfuse2`). Không cần cài Java, app tự tải.

> Các file `latest.yml`, `latest-linux.yml` và `.blockmap` trong Assets dùng cho tính năng tự cập nhật, bạn không cần tải.

### Lưu ý
- Windows SmartScreen có thể cảnh báo "Unknown publisher" vì bản này chưa kí số. Bấm **More info** rồi **Run anyway**.
- Linux: nếu AppImage không chạy được, thử `./tên-file.AppImage --no-sandbox`.
- Đây là bản đầu tiên nên có thể còn lỗi. Mọi phản hồi đều giúp ích cho các bản sau.
- Đây không phải sản phẩm chính thức của Minecraft, không được Mojang hay Microsoft phê duyệt.

### Báo lỗi
Mở [Issues](https://github.com/{{REPO}}/issues), ghi rõ hệ điều hành, phiên bản, các bước làm, và dán log nếu có.

---

## English

First release of My Server Manager: a desktop app for creating and managing multiple Minecraft Java servers, no command line needed. Available for **Windows** and **Linux** (Linux is experimental).

**Highlights:** one-click server creation (Vanilla, Paper, Purpur, Folia, Leaf, Fabric, Velocity, custom jar), automatic server jar and Java download, live console with command suggestions, multi-server dashboard with RAM/CPU charts and a customizable layout, import of existing servers, Modrinth plugins/mods, file manager with built-in editor, playit.gg and custom IP guide, system tray, auto start, crash restart, safe sequential shutdown, automatic updates. No account, no data collection.

**Languages:** English and Vietnamese-English (bilingual) are built in. More languages (Tiếng Việt, 简体中文, Português (Brasil), Русский, Bahasa Indonesia, Deutsch, Español) can be downloaded from *Settings > Download more languages*, which has a scrollable list and a search box that accepts language codes (`en`, `vi`, `ru`, `jp`...) or names (`English`, `Vietnam`...). A new language is just one JSON file.

**Install (Windows):** download `mc-server-manager-Setup-{{VERSION}}.exe` below (Windows 10/11 x64). SmartScreen may warn because the build is unsigned: click *More info* then *Run anyway*.

**Install (Linux):** download `mc-server-manager-{{VERSION}}-linux-x64.AppImage`, run `chmod +x` on it, then double-click or run it. On Ubuntu 22.04+ you may need `libfuse2`.

The `latest*.yml` and `.blockmap` files are used by the built-in updater; you don't need to download them.

*Not an official Minecraft product; not approved by or associated with Mojang or Microsoft.*
