## My Server Manager v{{VERSION}}

Ứng dụng quản lí server Minecraft Java dành cho người không rành dòng lệnh. Có bản **Windows** và **Linux**.

### Tính năng chính
- Tạo server chỉ vài cú bấm: Vanilla, Paper, Purpur, Folia, Leaf, Fabric, Velocity hoặc jar tự chọn
- Tự tải server jar và đúng bản Java cho từng server
- Chạy, dừng, khởi động lại; console realtime có gợi ý lệnh (Tab)
- Quản lí nhiều server cùng lúc: Start all, Stop all, Dashboard theo dõi RAM và CPU
- Cài và gỡ plugin/mod từ Modrinth
- Quản lí tệp có trình sửa (Monaco), đổi tên hàng loạt
- Hướng dẫn IP tùy chỉnh và playit.gg để bạn bè vào chơi
- Thu xuống khay hệ thống, tự khởi động server, tự khởi động lại khi crash
- Thoát an toàn: dừng từng server lần lượt trước khi tắt app
- Tự kiểm tra và cập nhật phiên bản mới
- Giao diện tiếng Anh và tiếng Việt
- Không tài khoản, không thu thập dữ liệu

### Cài đặt

**Windows**
1. Tải `mc-server-manager-Setup-{{VERSION}}.exe` ở phần **Assets** bên dưới
2. Chạy file và làm theo hướng dẫn
3. Mở app, bấm tạo server

**Linux**
1. Tải `mc-server-manager-{{VERSION}}-linux-x64.AppImage` ở phần **Assets** bên dưới
2. Cho phép chạy: `chmod +x mc-server-manager-{{VERSION}}-linux-x64.AppImage` (hoặc chuột phải > Properties > cho phép chạy như chương trình)
3. Bấm đúp để mở, hoặc chạy `./mc-server-manager-{{VERSION}}-linux-x64.AppImage`

**Yêu cầu:** Windows 10/11 64-bit, hoặc Linux 64-bit có giao diện đồ họa (Ubuntu 22.04+ có thể cần cài thêm `libfuse2`). Không cần cài Java, app tự tải.

> Các file `latest.yml`, `latest-linux.yml` và `.blockmap` trong Assets dùng cho tính năng tự cập nhật, bạn không cần tải.

### Lưu ý
- Windows SmartScreen có thể cảnh báo "Unknown publisher" vì bản này chưa kí số. Bấm **More info** rồi **Run anyway**.
- Linux: nếu AppImage không chạy được, thử `./tên-file.AppImage --no-sandbox`.
- Đây không phải sản phẩm chính thức của Minecraft, không được Mojang hay Microsoft phê duyệt.

### Báo lỗi
Mở [Issues](https://github.com/{{REPO}}/issues), ghi rõ hệ điều hành, phiên bản, các bước làm, và dán log nếu có.

---

## English

Desktop app for creating and managing multiple Minecraft Java servers, no command line needed. Available for **Windows** and **Linux**.

**Highlights:** one-click server creation (Vanilla, Paper, Purpur, Folia, Leaf, Fabric, Velocity, custom jar), automatic jar and Java download, live console, multi-server dashboard, Modrinth plugins/mods, file manager with editor, playit.gg guide, system tray, auto start, crash restart, safe sequential shutdown, automatic updates, English/Vietnamese UI. No account, no data collection.

**Install (Windows):** download `mc-server-manager-Setup-{{VERSION}}.exe` below (Windows 10/11 x64). SmartScreen may warn because the build is unsigned: click *More info* then *Run anyway*.

**Install (Linux):** download `mc-server-manager-{{VERSION}}-linux-x64.AppImage`, run `chmod +x` on it, then double-click or run it. On Ubuntu 22.04+ you may need `libfuse2`.

The `latest*.yml` and `.blockmap` files are used by the built-in updater; you don't need to download them.

*Not an official Minecraft product; not approved by or associated with Mojang or Microsoft.*
