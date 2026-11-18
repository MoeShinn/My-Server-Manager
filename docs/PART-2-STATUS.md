# PART-2-STATUS (P2: Tải về, nội dung, trang Plugin/Mod)

**Nói thật: CHƯA chạy thử với mạng thật và chưa chạy trong Electron.** Đã làm: biên dịch sạch bằng `tsc --strict` (main và renderer, renderer dùng stub UI kit giả của P3), và chạy thử các hàm thuần (`compareMcVersion`, `groupOf`, `pickJavaMajor`, parser playit). Mọi nguồn API ngoài chỉ được viết theo tài liệu trong prompt.

## Việc đã xong (theo thứ tự ưu tiên)
1. **Nền tảng**: `http.ts` (30s, thử lại 2 lần, 429 chờ `Retry-After`), `allowedHosts.ts`, `download.ts` (`.part`, 150ms, hash, thử lại 3 lần, 60s im lặng, hủy theo taskId), `dataJson.ts` (cache 6 giờ, fallback cache cũ rồi bản đóng gói), `compare.ts`, `getDefaultJava`, quản lí Java (`listJava`, `installJava`, `removeJava`, `ensureJava`, `getJavaExecutable`), `listVersions` + `downloadServerJar` cho vanilla, paper, purpur, fabric.
2. **folia, velocity, leaf**: danh sách và tải (folia/velocity dùng chung Fill v3 với paper).
3. **Modrinth**: `searchContent`, `listInstalledContent`, `installContent`, `removeContent` + trang `PluginsMods`.
4. **playit agent**: `playitStatus/Start/Stop`, `shutdown`, parser tách riêng.
5. **Nâng cao**: tải kèm thư viện phụ thuộc `required` (đệ quy tối đa 3 tầng), tab Đã cài.
6. `locales-src/p2.en.json` và file này.

Đã cài ĐỦ mọi hàm của `ContentApi` và `ContentService`. Không có hàm nào bỏ dở.

## Nguồn đọc phòng thủ vì chưa chắc hình dạng JSON
- **Leaf (chắc chắn nhất là chưa chắc)**: thử `/versions/{v}/builds` (có `channel`, `downloads.application.name/sha256`) rồi lùi về `/versions/{v}` (builds là số hoặc object). Build có `channel` chứa experimental/alpha/beta thì `stable: false`; nếu API chỉ trả số thì mọi build bị coi là stable. Nếu cả API lỗi thì lùi về GitHub Releases `Winds-Studio/Leaf`: đoán số phiên bản MC bằng regex từ tag/tên file, chỉ lấy release mới nhất cho mỗi phiên bản, `build` có dạng `gh:<tag>`. **Cần kiểm tra với dữ liệu thật.**
- **PaperMC Fill v3**: `versions` là object theo nhóm (chấp nhận cả mảng phẳng); `downloads['server:default']` (không có thì lấy mục đầu có `url`).
- **Purpur**: `builds` là `{ latest, all }` (chấp nhận cả mảng). Không kiểm hash. Mỗi phiên bản chỉ cache tối đa 50 build mới nhất.
- **Fabric**: chỉ liệt kê bản release từ 1.14 trở lên (endpoint server jar không có cho bản cũ hơn, đây là giả định của tui).
- **GitHub playit**: đọc trường `digest` (sha256) nếu có.

## Phần playit nào là ĐOÁN (cần kiểm tra với agent thật)
- `playit/parser.ts`: link claim `https://playit.gg/claim/<mã>` thì chắc; nhận biết "đã kết nối" là **đoán** theo các từ running, connected, registered (loại trừ dòng có disconnected, failed, error).
- Heuristic "có file `*.toml` trong `<userData>/playit/` thì coi là running" cũng là **đoán**. Nếu agent đã claim từ trước thì state sẽ thành `running` sau tối đa ~3 giây dù chưa chắc đã kết nối.
- Agent bản mới có thể là giao diện TUI cần terminal thật, khi đó stdout có thể không in gì đọc được.
- Tên file Windows được chọn theo quy tắc trong prompt (chứa windows, x86_64/amd64/x64, `.exe`, ưu tiên `signed`).

## Thư viện npm cần thêm
Không cần thêm gì ngoài danh sách hợp đồng. Dùng `extract-zip` đã có sẵn trong hợp đồng, `fetch` có sẵn của Node 20, `lucide-react` và `react-router-dom` cũng đã có.

## Giả định đã dùng
- `ProgressBar.value` là **phần trăm 0-100**, `null` là không rõ tổng dung lượng.
- Thư mục server luôn nằm trong `<serversDir>`: tui dùng `ServerConfig.folder` nếu nó nằm trong `serversDir`, không thì dùng `<serversDir>/<serverId>`.
- `downloadServerJar` với `mcVersion` null (khác custom) sẽ ném `INVALID_INPUT`. `listVersions('custom')` trả mảng rỗng.
- `removeJava` không ném lỗi nếu thư mục không tồn tại. `removeContent` bỏ qua file đã mất, nhưng nếu file bị khóa (EBUSY/EPERM) thì ném `SERVER_RUNNING`.
- `cancelDownload` gọi khi chưa có tải nào đang chạy sẽ nhớ yêu cầu hủy 30 giây, lần `downloadFile` kế tiếp cùng taskId sẽ ném `CANCELLED` một lần.
- Host đích sau chuyển hướng cũng bị kiểm tra theo `allowedHosts.ts`. **Nếu Leaf hoặc nguồn nào chuyển hướng sang CDN lạ thì tải sẽ bị chặn**: thêm host đó vào `allowedHosts.ts`.
- Java dùng URL từ data.json cho mọi host https (theo prompt); tar.gz giải nén bằng lệnh `tar` có sẵn của hệ điều hành.
- Tải plugin/mod ghi file `.part` ngay trong thư mục `plugins`/`mods` trong lúc tải (xóa nếu lỗi).
- `plugins.*` có thêm vài key ngoài danh sách tối thiểu: `filter.title`, `filter.valuePlaceholder`, `kind.plugins`, `kind.mods`, `software.custom`, `anyVersion`, `installedToast`, `removedToast`.

## Chỗ cần phần khác chỉnh
- **P3**: bốn file `src/shared/*` trong thư mục này chỉ là bản chép y nguyên từ hợp đồng (bản của P3 là bản chính thức). Cần alias `@/` và `@shared/` cho renderer. UI kit cần nhận `title`, `aria-label` trên `Button` (props của button) và `Button` không có children vẫn hoạt động (nút tải chỉ có biểu tượng). Cần mã lỗi `errors.*` cho mọi `ErrorCode`.
- **P1**: khi gọi `ensureJava` / `downloadServerJar` hãy bắt `AppException` code `CANCELLED`. `ServerConfig` của server phải được ghi ra `.mcmanager/config.json` ngay khi tạo xong, vì P2 đọc từ đó.
- **P5**: `data.json` cần `javaDownloads` đúng khóa chuỗi, `pluginLoaders` cho từng software, như hợp đồng.
- **P5**: `tools/build-language.mjs` cần gộp `locales-src/p2.en.json`.
