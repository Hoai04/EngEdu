# EngEdu – Hệ thống đăng ký khóa học tiếng Anh

Bài tập lớn môn **Phân tích và thiết kế hệ thống thông tin quản lý**.
Website động gồm 3 phân hệ dùng chung một CSDL và một trang đăng nhập:

| Phân hệ | Đường dẫn | Người dùng |
|---|---|---|
| Client | `/` | Khách vãng lai, Học viên |
| Giáo viên | `/teacher` | Giáo viên (do Admin cấp tài khoản) |
| Quản trị | `/admin` | Admin (tài khoản cố định trong cấu hình) |

**Công nghệ:** Node.js 22 · Express 5 · EJS · **SQLite** (module `node:sqlite` có sẵn trong Node.js) · express-session · bcryptjs · VietQR.

> Không cần cài hệ quản trị CSDL. Toàn bộ dữ liệu nằm trong một file `data/engedu.db`, tự tạo khi chạy.
> Bản dùng MySQL 8.4 vẫn được giữ ở nhánh [`mysql`](https://github.com/Hoai04/EngEdu/tree/mysql).

---

## 1. Cài đặt và chạy (Windows / macOS / Linux)

### Bước 1 – Cài Node.js
Tải **Node.js 22 LTS** tại https://nodejs.org và cài mặc định. Mở terminal gõ `node -v`, cần **v22.13 trở lên**.

### Bước 2 – Tải mã nguồn
Vào https://github.com/Hoai04/EngEdu → **Code → Download ZIP** → giải nén.
(Hoặc `git clone https://github.com/Hoai04/EngEdu.git` nếu đã cài Git.)

### Bước 3 – Cài thư viện, tạo dữ liệu mẫu, chạy
Mở thư mục dự án bằng VS Code → **Terminal → New Terminal**, gõ lần lượt:

```bash
npm install      # cài Express, EJS, express-session, bcryptjs
npm run seed     # tạo data/engedu.db với 10 giáo viên, 16 học viên, 14 khóa học... (XÓA dữ liệu cũ)
npm start        # mở http://localhost:3000
```

Bấm **Ctrl + C** trong terminal để tắt máy chủ.

### Mở web cho người khác truy cập (một lệnh)
Cài Cloudflare Tunnel một lần: `winget install --id Cloudflare.cloudflared` (mở lại terminal sau khi cài). Sau đó chỉ cần:

```bash
npm run public
```

hoặc **bấm đúp file `chay-web.bat`** (Windows; lần đầu tự cài thư viện và tạo dữ liệu mẫu). Lệnh này chạy web và mở tunnel cùng lúc, rồi in ra link `https://...trycloudflare.com` để gửi cho mọi người. Giữ cửa sổ mở; bấm **Ctrl + C** để tắt. Mỗi lần chạy lại, link sẽ đổi.

### Tài khoản mẫu

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Admin | `admin@engedu.vn` | `Admin@123` (đổi trong `config.local.js`) |
| Giáo viên | `lan.nguyen@engedu.vn`, `minh.tran@engedu.vn`… | `12345678` |
| Học viên | `an.le@example.com`, `binh.pham@example.com`… | `12345678` |

Tất cả dùng chung trang `/dang-nhap`; hệ thống tự chuyển trang theo vai trò.

**Quên mật khẩu:** ở trang đăng nhập bấm **Quên mật khẩu?**, nhập email + số điện thoại đã đăng ký. Nếu khớp, hệ thống cho đặt mật khẩu mới qua liên kết dùng một lần (hết hạn sau 15 phút), đồng thời đăng xuất mọi phiên cũ. Sai 5 lần sẽ bị tạm khóa 15 phút. Admin cũng có thể đặt lại mật khẩu cho học viên và giáo viên. Mật khẩu Admin chỉ đổi trong `config.local.js`.

### Xem dữ liệu trong CSDL
Mở file `data/engedu.db` bằng [DB Browser for SQLite](https://sqlitebrowser.org) hoặc tiện ích **SQLite Viewer** trong VS Code.

### Cấu hình (không bắt buộc)
Sao chép `config.local.example.js` thành `config.local.js` để đổi cổng, tài khoản Admin, số tài khoản ngân hàng trên mã QR hoặc vị trí file CSDL.
Có thể dùng biến môi trường: `PORT`, `DB_FILE`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET`.

---

## 2. Cấu trúc mã nguồn

| Tệp / thư mục | Vai trò |
|---|---|
| `app.js` | Khởi động máy chủ, phiên đăng nhập, biến dùng chung cho giao diện |
| `config.js`, `config.local.js` | Cấu hình chung; file CSDL và tài khoản Admin cố định |
| `schema.sql` | Lược đồ CSDL: 11 bảng nghiệp vụ + `sessions`, khóa ngoại, UNIQUE, CHECK, chỉ mục |
| `db.js` | Kết nối SQLite, hàm `transaction()`, gửi thông báo, đồng bộ Admin cố định |
| `session-store.js` | Lưu phiên đăng nhập vào bảng `sessions` (không mất khi khởi động lại) |
| `auth.js` | Đăng nhập chung, tạm khóa 15 phút sau 5 lần sai, phân quyền theo vai trò |
| `helpers.js` | Nhãn trạng thái, định dạng tiền/ngày, kiểm tra dữ liệu, truy vấn sĩ số |
| `routes/client.js` | Trang Client và khu vực học viên |
| `routes/teacher.js` | Trang Giáo viên |
| `routes/admin.js` | Trang Admin |
| `routes/shared.js` | Thông báo, đổi mật khẩu dùng chung |
| `seed.js` | Dữ liệu mẫu |
| `scripts/test.js` | Kiểm thử tự động bằng yêu cầu HTTP |
| `views/` | Giao diện EJS: `client/`, `teacher/`, `admin/`, `partials/` |
| `public/css/style.css` | Giao diện thống nhất 3 màu (#2F5F8F, #1F2937, trắng), font Be Vietnam Pro |

### Ánh xạ thiết kế CSDL sang SQLite

| Thiết kế (báo cáo) | Hiện thực trong SQLite |
|---|---|
| `INT AUTO_INCREMENT` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `ENUM('A','B',…)` | `TEXT CHECK (cot IN ('A','B',…))` |
| `DATETIME DEFAULT CURRENT_TIMESTAMP` | `DATETIME DEFAULT (datetime('now','localtime'))` |
| `BOOLEAN` | `BOOLEAN` lưu 0/1 + `CHECK` |
| UNIQUE, FOREIGN KEY, CHECK | Giữ nguyên (bật `PRAGMA foreign_keys = ON`) |
| Giao dịch InnoDB | `BEGIN IMMEDIATE … COMMIT / ROLLBACK`, các giao dịch chạy lần lượt |

---

## 3. Chức năng và CRUD theo vai trò

**Khách vãng lai:** xem/tìm/lọc khóa học, chi tiết khóa học (4 tab), giáo viên, đánh giá, giới thiệu, hỏi đáp; gửi yêu cầu tư vấn; đăng ký tài khoản.

**Học viên:** quản lý thông tin cá nhân; đăng ký khóa học → thanh toán QR VietQR (giữ chỗ 15 phút, tự kiểm tra trạng thái mỗi 5 giây); khóa học của tôi; lịch sử thanh toán; học online + đánh dấu hoàn thành bài; **thêm / sửa / xóa đánh giá**; thông báo; đổi mật khẩu.

**Giáo viên:** dashboard; khóa học được phân công; **thêm / sửa / xóa bài giảng**; gửi duyệt nội dung; danh sách và hồ sơ học viên trong lớp (không thấy địa chỉ, thanh toán); phản hồi đánh giá; đánh giá trình độ cho yêu cầu tư vấn; cập nhật SĐT và giới thiệu; thông báo; đổi mật khẩu.

**Admin:** dashboard + thống kê (doanh thu 6/12 tháng, theo khóa học, danh mục, giáo viên); **thêm / sửa / ẩn / mở lại / xóa khóa học**, phân công giáo viên, duyệt hoặc yêu cầu chỉnh sửa nội dung; **cấp / sửa / khóa / mở khóa / đặt lại mật khẩu giáo viên**; xem, khóa / mở khóa học viên; xác nhận hoặc từ chối thanh toán; duyệt (từng mục hoặc hàng loạt) / ẩn / hiển thị lại / xóa đánh giá; chuyển và hoàn tất yêu cầu tư vấn.

### Các luồng liên tác nhân (khớp biểu đồ hoạt động và trạng thái trong báo cáo)

| Luồng | Trạng thái |
|---|---|
| Đăng ký – thanh toán | `CHO_THANH_TOAN` → `CHO_XAC_NHAN` → `DA_THANH_TOAN` + `DA_KICH_HOAT` / `TU_CHOI` + `BI_TU_CHOI` → đăng ký lại |
| Đánh giá | `CHO_DUYET` → `HIEN_THI` ⇄ `BI_AN`; sửa đánh giá → về `CHO_DUYET` và xóa phản hồi cũ |
| Mở khóa học | `NHAP` → `CHO_DUYET` ⇄ `CAN_SUA` → `MO_DANG_KY` ⇄ `AN`; chỉ xóa được khi chưa có đăng ký |
| Tư vấn | `MOI` → (`CHUYEN_GV` → `DA_DE_XUAT`) → `HOAN_TAT` |
| Tài khoản | `HOAT_DONG` ⇄ `BI_KHOA` (phiên đang mở bị hủy); tạm khóa đăng nhập 15 phút sau 5 lần sai |

Các thao tác ghi nhiều bảng (đăng ký – thanh toán, xác nhận thanh toán, cấp tài khoản, đăng ký tài khoản) chạy trong **một giao dịch CSDL**. Mọi thay đổi trạng thái đều gửi **thông báo** cho bên cần xử lý tiếp.

---

## 4. Kiểm thử

Mở 2 cửa sổ terminal:
```bash
npm run seed && npm start   # cửa sổ 1
npm test                    # cửa sổ 2
```
`scripts/test.js` chạy 104 kiểm tra trên 22 nhóm: đăng nhập, quên mật khẩu, phân quyền, tải 66 trang của 4 vai trò, đăng ký tài khoản, đăng ký học – thanh toán, liên tác nhân, bảo vệ thông tin, từ chối – đăng ký lại, sĩ số, đánh giá, mở khóa học, quản lý giáo viên, Admin cố định, tư vấn, thông báo. Bộ kiểm thử tạo thêm dữ liệu, chạy lại `npm run seed` để làm sạch.

---

## 5. Làm việc nhóm với GitHub

```bash
git clone https://github.com/Hoai04/EngEdu.git
cd EngEdu
git checkout -b ten-ban/tinh-nang     # làm việc trên nhánh riêng
# ... sửa code ...
git add .
git commit -m "Mô tả thay đổi"
git push -u origin ten-ban/tinh-nang  # rồi tạo Pull Request trên GitHub
```

Không đẩy `node_modules/`, `config.local.js` và `data/*.db` (đã có trong `.gitignore`).
