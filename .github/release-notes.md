## My Server Manager v{{VERSION}}

Ứng dụng quản lí server Minecraft Java dành cho người không rành dòng lệnh. Có bản **Windows** và **Linux**.

### Tính năng chính
- Tạo server chỉ vài cú bấm: Vanilla, Paper, Purpur, Folia, Leaf, Fabric, Velocity hoặc jar tự chọn
- Tự tải server jar và đúng bản Java cho từng server
- Chạy, dừng, khởi động lại; console realtime có gợi ý lệnh (Tab)
- Quản lí nhiều server cùng lúc: Start all, Stop all, Dashboard theo dõi RAM và CPU (có biểu đồ đường, tùy chỉnh được giao diện)
- Nhập server có sẵn: chuyển cả thư mục vào app, tự đọc `.mcmanager/config.json`
- Cài và gỡ plugin/mod từ Modrinth
- Quản lí tệp có trình sửa (Monaco), đổi tên hàng loạt
- Hướng dẫn IP tùy chỉnh và playit.gg để bạn bè vào chơi
- Thu xuống khay hệ thống, tự khởi động server, tự khởi động lại khi crash
- Thoát an toàn: dừng từng server lần lượt trước khi tắt app
- Tự kiểm tra và cập nhật phiên bản mới
- Giao diện tiếng Anh và tiếng Việt
- Không tài khoản, không thu thập dữ liệu

### Có gì mới ở v{{VERSION}}
- **Nhập máy chủ có sẵn**: nút "Import .jar" đổi thành **Nhập máy chủ**. App sao chép toàn bộ thư mục và tệp cùng thư mục với file `.jar` đã chọn, kèm hộp xác nhận hiện thư mục và dung lượng trước khi sao chép
- Nếu thư mục có `.mcmanager/config.json`, app đọc tên, mô tả, phần mềm, phiên bản và các thiết lập (RAM, cờ JVM, cổng...) từ đó. Đủ thông tin thì nhập luôn, thiếu thì chỉ hỏi phần còn thiếu (đã điền sẵn những gì có, vẫn sửa được)
- **Biểu đồ RAM và CPU** trong dashboard của từng server: biểu đồ đường 2 màu, di chuột để xem chi tiết từng thời điểm, lưu lịch sử tối đa 10 phút trong lúc app mở
- **Tùy chỉnh giao diện dashboard server**: bố cục mặc định gồm 2 cột: bên trái là console kèm biểu đồ bên dưới, bên phải là các mục còn lại. Bạn có thể bật/tắt từng mục, đổi thứ tự, chuyển mục sang bên trái hoặc phải, chọn kích thước thẻ và khoảng thời gian của biểu đồ. Cài đặt được nhớ lại và áp dụng cho mọi server, có nút đặt lại mặc định
- **Sửa lỗi**: đổi ngôn ngữ trong Cài đặt không cần tắt mở lại app nữa (trước đây app bị lặp vô hạn việc tải từ điển ngôn ngữ nên đổi xong không áp dụng được)
- Hộp "Tải thêm ngôn ngữ" có nút **Làm mới danh sách** để tải lại danh sách ngôn ngữ từ GitHub (trước đó danh sách được lưu tạm tới 6 tiếng nên ngôn ngữ mới thêm không hiện ngay)
- **Sửa lỗi**: tải được các ngôn ngữ có mã viết hoa như `zh-CN` (trước đây báo "thông tin chưa hợp lệ")

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

**What's new in v{{VERSION}}:** "Import .jar" is now **Import server**: it copies the whole folder next to the chosen `.jar` (with a confirmation showing the folder and its size) and reads `.mcmanager/config.json` to fill in the details, asking only for what is missing. New RAM and CPU line chart on each server's dashboard, plus a customizable two-column dashboard (console and chart on the left, other sections on the right; show/hide, reorder and move sections, card size, chart range). Fixed: changing the language now applies immediately without restarting the app, and languages with uppercase codes such as zh-CN can be downloaded. The language download window also has a Refresh list button.

**Highlights:** one-click server creation (Vanilla, Paper, Purpur, Folia, Leaf, Fabric, Velocity, custom jar), automatic jar and Java download, live console, multi-server dashboard, Modrinth plugins/mods, file manager with editor, playit.gg guide, system tray, auto start, crash restart, safe sequential shutdown, automatic updates, English/Vietnamese UI. No account, no data collection.

**Install (Windows):** download `mc-server-manager-Setup-{{VERSION}}.exe` below (Windows 10/11 x64). SmartScreen may warn because the build is unsigned: click *More info* then *Run anyway*.

**Install (Linux):** download `mc-server-manager-{{VERSION}}-linux-x64.AppImage`, run `chmod +x` on it, then double-click or run it. On Ubuntu 22.04+ you may need `libfuse2`.

The `latest*.yml` and `.blockmap` files are used by the built-in updater; you don't need to download them.

*Not an official Minecraft product; not approved by or associated with Mojang or Microsoft.*
