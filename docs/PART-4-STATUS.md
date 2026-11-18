# FILE: docs/PART-4-STATUS.md
# PART 4 (P4) – Các trang của từng server

> **Lưu ý trung thực:** toàn bộ code chưa được chạy thử trong app thật (không có P1/P2/P3/P5 để ghép). Mình chỉ kiểm tra được cú pháp TypeScript (không có lỗi cú pháp) và kiểm tra mọi key `t('...')` trong code đều có trong `locales-src/p4.en.json`. Chưa chạy `tsc` đầy đủ, chưa chạy giao diện.

## Đã làm (theo thứ tự ưu tiên của prompt)
1. `hooks.ts`, `utils.ts`, `StatusBadge`, `VersionBadge`, **ServerDashboard** với ControlBox, StatsBox, ConsoleBox.
2. PlayersBox, SettingsBox (RamSelect, StorageSelect), ManageBox, IpBoxes (đặt trong Dashboard).
3. Trang **ServerIp** (hướng dẫn playit từng bước + phần tự mở cổng).
4. Trang **StartOptions**.
5. Trang **Properties** (`propertiesSchema.ts`).
6. Trang **Players**.
7. Console hoàn chỉnh (Tab gợi ý lệnh, lịch sử lệnh, nút Xuống cuối, Xóa, Sao chép), `locales-src/p4.en.json` (261 key), file STATUS này.

## Chưa làm
Không bỏ sót mục nào trong prompt. Những điểm đơn giản hóa nằm ở phần "Giả định" bên dưới.

## Giới hạn gợi ý lệnh (mục C)
- Lệnh của plugin/mod **chưa từng được gõ trong phiên này** sẽ không được gợi ý (app không có plugin hỗ trợ). Lệnh đã gõ một lần sẽ được gợi ý từ lần sau (danh sách này chỉ nằm trong bộ nhớ, mất khi mở lại app).
- Lịch sử lệnh giữ trong bộ nhớ (tối đa 100 lệnh mỗi server), cũng mất khi mở lại app.
- Gợi ý tham số chỉ có cho: whitelist, gamemode, difficulty, time (tham số đầu), weather và tên người chơi cho các lệnh liệt kê trong prompt (tp/teleport gợi ý cả tham số 1 và 2).

## API đã gọi và giả định về dữ liệu trả về
- `servers.get/list/getStats/getPlayers/getConsole/start/stop/restart/kill/acceptEula/updateSettings/setStartOptions/suggestFlags/exportStartScript/rename/duplicate/remove/sendCommand/getProperties/setProperties`.
- `content.getDefaultJava/playitStatus/playitStart/playitStop`; `files.list(id, '')`; `app.getSystemInfo/openExternal/openPath`.
- Sự kiện: `servers:changed`, `server:status`, `server:console`, `server:stats`, `server:players`, `download:progress` (taskId `playit-install`), `playit:status`. Luôn hủy đăng ký khi unmount và bỏ qua sự kiện của id khác.
- `servers.start` giả định ném `AppException('EULA_NOT_ACCEPTED')` khi chưa đồng ý EULA.
- `playersMax` của `servers.list()` dùng làm mức tối đa ban đầu; sau đó lấy từ `server:players.max`.
- `servers.getPlayers` giả định đã sắp xếp sẵn (online trước, A-Z) như prompt nói; trang Players không sắp xếp lại.
- Đường dẫn trả về từ `exportStartScript` giả định là đường dẫn tuyệt đối nằm trong userData hoặc dataDir (để `app.openPath` mở được thư mục chứa file).

## Giả định về UI kit của P3 (cần P3 xác nhận)
- `ProgressBar.value` là phần trăm **0–100**. Để đổi màu cảnh báo ở ≥90% dung lượng, mình bọc ProgressBar trong thẻ có biến `--accent: var(--warning)`; cách này chỉ hiệu quả nếu ProgressBar tô màu bằng `var(--accent)`. Nếu không, P3 nên thêm prop màu.
- `ConfirmDialog.message` nhận được **ReactNode** (dùng cho link EULA và ô tích "xóa luôn tệp dữ liệu"). Nếu P3 chỉ cho `string` thì cần mở rộng kiểu.
- `Button.icon` nhận ReactNode (mình truyền `<Icon size={14} />` của lucide-react); `Button` chấp nhận children rỗng khi chỉ có icon (nút xóa cờ).
- `Badge` dùng không truyền `color` (chỉ để hiện tên phần mềm); StatusBadge và VersionBadge tự vẽ thẻ `span` bằng biến CSS.
- `Modal.footer` là ReactNode; `Toggle` dùng được không có `label`; `TextInput type="number"` được hỗ trợ.
- `useToast`, `Spinner`… import từ `@/components/ui`, `useT` từ `@/i18n`; `t(key, params)` trả về chính key khi thiếu (mình dựa vào điều này để ẩn mô tả cờ/khóa không có chữ).

## Khác biệt nhỏ so với prompt
- `copyText(text)` trong `utils.ts` chỉ trả về `true/false` (hàm thường không dùng được hook toast). Toast `srv.dash.copied` nằm trong hook `useCopy()` ở `hooks.ts`.
- Màu nền VersionBadge dùng bảng 10 màu cố định (hsl) theo hash của `groupOf(mcVersion)` và chữ trắng, đúng yêu cầu bảng màu cố định; server custom dùng `var(--border)`.
- Nút **Xuất file chạy** bị vô hiệu khi còn thay đổi chưa lưu (script được tạo từ cấu hình đã lưu).
- Mô tả tiếng Anh của từng cờ JVM trong `srv.start.flag.<id>` mình viết theo hiểu biết chung về các cờ này; **chưa thấy giá trị thật do P1 tạo**, nên P1 hoặc người review nên đối chiếu lại mô tả cho đúng từng cờ (nhất là `aikar-flag`, `aikar-new`, các cờ g1-*).
- Trang Properties: ô số dùng kiểm tra số nguyên theo `min/max` trong schema; khóa `network-compression-threshold` không giới hạn (cho phép -1).

## Thư viện npm cần thêm
Không có (chỉ dùng react, react-router-dom, lucide-react đã có trong danh sách hợp đồng).

## Chỗ cần phần khác chỉnh
- P3: xác nhận các giả định UI kit ở trên; route `/server/:id`, `/players`, `/start`, `/ip`, `/properties` import mặc định từ đúng file (đã `export default`).
- P1: xác nhận `EULA_NOT_ACCEPTED`, thứ tự `getPlayers`, và danh sách id cờ (20 id trong prompt).
- P5: `app.openPath` phải cho phép mở thư mục chứa script xuất ra.
