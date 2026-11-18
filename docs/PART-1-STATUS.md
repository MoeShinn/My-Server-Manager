# PART 1 (P1) - Lõi quản lí server: STATUS

## Đã làm xong (đủ mọi hàm của EngineApi và EngineService)
- store: nạp đồng bộ `servers/*/.mcmanager/config.json`, điền mặc định, ghi nguyên tử; list/get/create/rename/remove/duplicate/importFolder.
- updateSettings (kiểm tra đủ luật, tự đổi bộ cờ nếu người dùng chưa chỉnh), setStartOptions, suggestFlags, exportStartScript.
- start/stop/kill/restart, console (bộ đệm vòng, ANSI, mức log), sendCommand, sự kiện trạng thái, acceptEula.
- stopAllSequential, stopAll, startAll, startAutoStartServers, tự khởi động lại khi crash (10 giây, tối đa 3 lần / 10 phút).
- getProperties/setProperties (giữ comment và thứ tự, đồng bộ `server-port` hai chiều), getPlayers + sự kiện players.
- getStats + `server:stats` mỗi 3 giây, giới hạn dung lượng (cảnh báo 90%, dừng êm 100%, từ chối start).
- isPortFree, suggestPort, recoverOrphans (chế độ hạn chế).
- `locales-src/p1.en.json` đủ 11 key bắt buộc.

## Đã test chưa
- `tsc --noEmit` (strict) sạch với toàn bộ file engine.
- Đã chạy thử bằng "java giả" (script shell in log giống Paper) trên Linux: tạo, EULA, start, nhận `Done (`, đếm player (bỏ qua tin chat giả), gửi lệnh, đổi properties, stop, crash (mã 1), đổi RAM tự sinh lại cờ, nhân bản, xuất script, stopAllSequential, xóa (cả hai kiểu), import. Tất cả qua.
- **CHƯA** chạy với Java Minecraft thật, **CHƯA** test trên Windows (taskkill, tasklist, khóa file), chưa test recoverOrphans, tự restart sau crash (hẹn giờ 10 giây), giới hạn dung lượng, Velocity.

## Chưa làm / hạn chế
- Velocity: cổng chỉ được đồng bộ vào `velocity.toml` (dòng `bind`) từ lần start thứ 2, vì file này do Velocity tự sinh lần đầu.
- Server nhận lại (adopted): không có người chơi online (không biết trạng thái cũ), không gửi lệnh được (ném `UNKNOWN`), khi tiến trình biến mất luôn tính là `stopped`.

## Thư viện npm cần thêm
```
npm i pidusage
npm i -D @types/pidusage
```
Cần `esModuleInterop: true` trong tsconfig (dùng `import pidusage from 'pidusage'`). Bundle main phải để `pidusage` là external (electron-vite xử lí mặc định).

## Giả định
- File trong engine import `src/shared` bằng đường dẫn tương đối (không phụ thuộc alias `@shared`).
- `ServerConfig.folder` luôn được tính lại từ `serversDir` + id khi nạp/lưu. Đổi `dataDir` có hiệu lực sau khi khởi động lại app.
- `kill` không xếp hàng sau khóa của server (để vẫn diệt được lúc restart đang chờ). `stop` gọi lúc restart đang chạy sẽ chờ restart xong.
- Mặc định khi tạo: autoStart false, autoRestartOnCrash false, storageLimitMb = 10240 nếu không truyền (null = không giới hạn). Import: storageLimitMb null, RAM = min(2048, nửa tổng RAM).
- Dòng hệ thống có `text = textKey` (không viết chữ cứng); params: started {name, ram, port}, stopped/crashed {code}, autoRestart {attempt, max, seconds}, autoRestartGaveUp {max}, storageWarning {percent, used, limit}, storageExceeded {used, limit}, startFailed {code = ErrorCode}.
- `engine.startFailed` chỉ hiện mã lỗi; P4 có thể hiển thị thêm `t('errors.' + code)` nếu muốn.
- importFolder: thư mục là con trực tiếp của serversDir thì dùng tại chỗ (đổi tên thư mục nếu tên không hợp lệ làm id); thư mục khác thì sao chép.
- Khi quá trình thoát app đang chạy (stopAllSequential), start và auto-restart bị chặn (CANCELLED) và được mở lại khi xong.

## Chỗ cần phần khác chỉnh
- P3: gọi `engine.recoverOrphans()` rồi `engine.startAutoStartServers()` lúc mở app; cấu hình bundler để `pidusage` là external.
- P4: hiển thị console theo `line.textKey ? t(textKey, params) : line.text`.
