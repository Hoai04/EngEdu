// Hàm dùng chung: nhãn hiển thị, định dạng, kiểm tra dữ liệu, truy vấn thống kê.
const config = require('./config');

const LABELS = {
  danhMuc: { IELTS: 'IELTS', TOEIC: 'TOEIC', GIAO_TIEP: 'Giao tiếp', BUSINESS: 'Business English', THIEU_NHI: 'Thiếu nhi' },
  khoaHoc: { NHAP: 'Nháp', CHO_DUYET: 'Chờ duyệt', CAN_SUA: 'Cần chỉnh sửa', MO_DANG_KY: 'Đang mở đăng ký', AN: 'Đã ẩn' },
  dangKy: { CHO_THANH_TOAN: 'Chờ thanh toán', DA_KICH_HOAT: 'Đã kích hoạt', BI_TU_CHOI: 'Bị từ chối' },
  thanhToan: { CHO_THANH_TOAN: 'Chờ thanh toán', CHO_XAC_NHAN: 'Chờ xác nhận', DA_THANH_TOAN: 'Đã thanh toán', TU_CHOI: 'Từ chối' },
  danhGia: { CHO_DUYET: 'Chờ duyệt', HIEN_THI: 'Đang hiển thị', BI_AN: 'Bị ẩn' },
  tuVan: { MOI: 'Mới', CHUYEN_GV: 'Đã chuyển giáo viên', DA_DE_XUAT: 'Giáo viên đã đề xuất', HOAN_TAT: 'Hoàn tất' },
  taiKhoan: { HOAT_DONG: 'Hoạt động', BI_KHOA: 'Bị khóa' },
  gioiTinh: { NAM: 'Nam', NU: 'Nữ', KHAC: 'Khác' },
};

const TRINH_DO = ['Mất gốc', 'Cơ bản', 'Trung cấp', 'Khá', 'Nâng cao'];

// Tông màu badge theo trạng thái (khớp component Badge trong Figma)
const TONE = {
  NHAP: 'neutral', MOI: 'neutral', CHO_THANH_TOAN: 'neutral',
  CHO_DUYET: 'info', CHO_XAC_NHAN: 'info', CAN_SUA: 'info', CHUYEN_GV: 'info', DA_DE_XUAT: 'info',
  MO_DANG_KY: 'success', DA_KICH_HOAT: 'success', DA_THANH_TOAN: 'success', HIEN_THI: 'success', HOAN_TAT: 'success', HOAT_DONG: 'success',
  AN: 'danger', BI_TU_CHOI: 'danger', TU_CHOI: 'danger', BI_AN: 'danger', BI_KHOA: 'danger',
};

function label(group, value) {
  return (LABELS[group] && LABELS[group][value]) || value || '';
}

function badge(group, value) {
  return `<span class="badge badge-${TONE[value] || 'neutral'}">${escapeHtml(label(group, value))}</span>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const pad = (n) => String(n).padStart(2, '0');

function money(n) {
  return `${Number(n || 0).toLocaleString('vi-VN')}đ`;
}

/** Đọc ngày giờ từ CSDL ('YYYY-MM-DD' hoặc 'YYYY-MM-DD HH:MM:SS') theo giờ địa phương. */
function toDate(d) {
  if (!d) return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d;
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? null : x;
}

function date(d) {
  const x = toDate(d);
  if (!x) return '';
  return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()}`;
}

function datetime(d) {
  const x = toDate(d);
  if (!x) return '';
  return `${date(x)} ${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

/** Giá trị cho <input type="date"> */
function isoDate(d) {
  const x = toDate(d);
  if (!x) return '';
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

function age(d) {
  const x = toDate(d);
  if (!x) return '';
  const now = new Date();
  let a = now.getFullYear() - x.getFullYear();
  if (now < new Date(now.getFullYear(), x.getMonth(), x.getDate())) a -= 1;
  return a;
}

function stars(n) {
  const k = Math.round(Number(n) || 0);
  return '★'.repeat(k) + '☆'.repeat(5 - k);
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function vietQr(soTien, maDon) {
  const { bankId, accountNo, accountName } = config.bank;
  const q = new URLSearchParams({ amount: String(soTien), addInfo: maDon, accountName });
  return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?${q}`;
}

// ---- Kiểm tra dữ liệu
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
const isPhone = (s) => /^0\d{9}$/.test(String(s || ''));
const clean = (s, max) => {
  const v = String(s ?? '').trim();
  return max ? v.slice(0, max) : v;
};
const orNull = (s) => (s === undefined || s === null || String(s).trim() === '' ? null : String(s).trim());

/**
 * Biểu thức SQL đếm chỗ đã dùng của khóa học: học viên đã kích hoạt, đơn
 * đang chờ Admin xác nhận và đơn chờ thanh toán còn trong thời gian giữ chỗ.
 */
const SEATS_USED_SQL = `(
  SELECT COUNT(*) FROM dang_ky dk
  WHERE dk.khoa_hoc_id = kh.id AND (
    dk.trang_thai = 'DA_KICH_HOAT'
    OR (dk.trang_thai = 'CHO_THANH_TOAN' AND EXISTS (
      SELECT 1 FROM thanh_toan tt WHERE tt.dang_ky_id = dk.id AND (
        tt.trang_thai = 'CHO_XAC_NHAN'
        OR (tt.trang_thai = 'CHO_THANH_TOAN' AND tt.ngay_tao >= datetime(NOW(), '-${Number(config.holdMinutes)} minutes'))
      )
    ))
  )
)`;

/** Cột chung khi liệt kê khóa học: giáo viên, điểm đánh giá, số chỗ đã dùng. */
const COURSE_COLUMNS = `
  kh.*, tk.ho_ten AS giao_vien_ten,
  (SELECT ROUND(AVG(so_sao), 1) FROM danh_gia d WHERE d.khoa_hoc_id = kh.id AND d.trang_thai = 'HIEN_THI') AS diem_tb,
  (SELECT COUNT(*) FROM danh_gia d WHERE d.khoa_hoc_id = kh.id AND d.trang_thai = 'HIEN_THI') AS so_danh_gia,
  (SELECT COUNT(*) FROM bai_giang b WHERE b.khoa_hoc_id = kh.id) AS so_bai,
  ${SEATS_USED_SQL} AS cho_da_dung`;

const COURSE_FROM = `FROM khoa_hoc kh LEFT JOIN tai_khoan tk ON tk.id = kh.giao_vien_id`;

/** Ẩn nội dung gốc của lỗi ràng buộc CSDL, trả về thông báo dễ hiểu. */
function isDuplicate(err) {
  return !!err && /UNIQUE constraint failed/i.test(String(err.message || ''));
}

module.exports = {
  LABELS, TRINH_DO, label, badge, escapeHtml, money, date, datetime, isoDate, age, stars, initials, vietQr,
  isEmail, isPhone, clean, orNull, SEATS_USED_SQL, COURSE_COLUMNS, COURSE_FROM, isDuplicate,
};
