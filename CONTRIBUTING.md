# Đóng góp cho My Server Manager

Cảm ơn bạn đã quan tâm. Quy trình ngắn gọn:

1. Fork kho, tạo nhánh từ `main` (ví dụ `fix/console-scroll`).
2. Cài đặt: `npm install`, chạy thử bằng `npm run dev`.
3. Trước khi mở Pull Request, chạy:
   ```bash
   npm run typecheck
   node tools/build-language.mjs --check
   ```
4. Mở Pull Request, mô tả thay đổi và cách bạn đã thử.

## Quy ước
- Sửa nhỏ, đúng phạm vi. Không đổi tên hàm công khai hay cấu trúc thư mục nếu không cần.
- Giao tiếp giữa renderer và main chỉ đi qua hợp đồng trong `src/shared/` (types, ipc, services). Đổi hợp đồng thì sửa cả hai phía.
- Mọi chữ trong giao diện đi qua `t('...')`. Thêm key mới vào `locales-src/app.en.json`, rồi chạy `node tools/build-language.mjs` để cập nhật `language/en.json`; bản dịch `vi`, `vi-en` thêm bằng `--missing` và `--merge` (xem README).
- Không thêm thư viện nếu không thật cần thiết.

## Phát hành
Chỉ người bảo trì phát hành: đổi `app_version` trong `config.toml` và đẩy lên `main`, workflow **Release** sẽ lo phần còn lại.

## Báo lỗi bảo mật
Không đăng công khai. Hãy liên hệ riêng với người bảo trì qua trang GitHub cá nhân.
