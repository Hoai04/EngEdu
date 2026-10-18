# EngEdu – Hệ thống đăng ký khóa học tiếng Anh

Bài tập lớn môn **Phân tích và thiết kế hệ thống thông tin quản lý**.
Website động gồm 3 phân hệ dùng chung một CSDL MySQL và một trang đăng nhập:

| Phân hệ | Đường dẫn | Người dùng |
|---|---|---|
| Client | `/` | Khách vãng lai, Học viên |
| Giáo viên | `/teacher` | Giáo viên (do Admin cấp tài khoản) |
| Quản trị | `/admin` | Admin (tài khoản cố định trong cấu hình) |

**Công nghệ:** Node.js 22 · Express 5 · EJS · MySQL 8.4 (utf8mb4, InnoDB) · express-session + express-mysql-session · bcryptjs · VietQR.

---

## 1. Cài đặt nhanh (Windows / macOS / Linux)

### Bước 1 – Cài phần mềm
- [Node.js 22 LTS](https://nodejs.org)
- [MySQL Server 8.4](https://dev.mysql.com/downloads/mysql/) (kèm MySQL Workbench nếu muốn xem dữ liệu)

### Bước 2 – Tạo CSDL và tài khoản riêng cho ứng dụng
Mở MySQL Workbench (hoặc `mysql -u root -p`) và chạy:

```sql
CREATE DATABASE khoa_hoc_tieng_anh CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'engedu'@'localhost' IDENTIFIED BY 'engedu';
GRANT ALL PRIVILEGES ON khoa_hoc_tieng_anh.* TO 'engedu'@'localhost';
FLUSH PRIVILEGES;
```

Các bảng **tự được tạo** từ `schema.sql` mỗi khi khởi động (lệnh `CREATE TABLE IF NOT EXISTS`).

### Bước 3 – Tải mã nguồn và cài thư viện
```bash
git clone https://github.com/<tai-khoan>/<ten-repo>.git engedu
cd engedu
npm install
```

### Bước 4 – Cấu hình (tùy chọn)
Sao chép `config.local.example.js` thành `config.local.js` rồi sửa mật khẩu MySQL, tài khoản Admin, số tài khoản ngân hàng hiện trên mã QR.
File `config.local.js` không bị đẩy lên GitHub. Có thể dùng biến môi trường thay thế: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PORT`, `SESSION_SECRET`.

### Bước 5 – Tạo dữ liệu mẫu và chạy
```bash
npm run seed     # XÓA dữ liệu cũ, tạo 10 giáo viên, 16 học viên, 14 khóa học...
npm start        # mở http://localhost:3000
```

### Tài khoản mẫu

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Admin | `admin@engedu.vn` | `Admin@123` (đổi trong `config.local.js`) |
| Giáo viên | `lan.nguyen@engedu.vn`, `minh.tran@engedu.vn`… | `12345678` |
| Học viên | `an.le@example.com`, `binh.pham@example.com`… | `12345678` |

Tất cả dùng chung trang `/dang-nhap`; hệ thống tự chuyển trang theo vai trò.

---

## 2. Cấu trúc mã nguồn

| Tệp / thư mục | Vai trò |
|---|---|
| `app.js` | Khởi động máy chủ, phiên đăng nhập (lưu bảng `sessions`), biến dùng chung cho giao diện |
| `config.js`, `config.local.js` | Cấu hình chung; thông tin CSDL và tài khoản Admin cố định |
| `schema.sql` | Lược đồ CSDL: 11 bảng nghiệp vụ + `sessions`, khóa ngoại, UNIQUE, CHECK |
| `db.js` | Pool MySQL, hàm `transaction()`, gửi thông báo, đồng bộ Admin cố định |
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

Mở 2 cửa sổ dòng lệnh:
```bash
npm run seed && npm start   # cửa sổ 1
npm test                    # cửa sổ 2
```
`scripts/test.js` chạy 91 kiểm tra trên 21 nhóm: đăng nhập, phân quyền, tải 66 trang của 4 vai trò, đăng ký tài khoản, đăng ký học – thanh toán, liên tác nhân, bảo vệ thông tin, từ chối – đăng ký lại, sĩ số, đánh giá, mở khóa học, quản lý giáo viên, Admin cố định, tư vấn, thông báo. Bộ kiểm thử tạo thêm dữ liệu, chạy lại `npm run seed` để làm sạch.

---

## 5. Đẩy mã nguồn lên GitHub (cho thành viên nhóm)

```bash
git clone https://github.com/<tai-khoan>/<ten-repo>.git
cd <ten-repo>
git checkout -b ten-ban/tinh-nang     # làm việc trên nhánh riêng
# ... sửa code ...
git add .
git commit -m "Mô tả thay đổi"
git push -u origin ten-ban/tinh-nang  # rồi tạo Pull Request trên GitHub
```

Không đẩy `node_modules/` và `config.local.js` (đã có trong `.gitignore`).
