// Trang Admin (/admin): điều phối toàn bộ hệ thống.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const h = require('../helpers');
const { requireRole, flash, destroySessionsOf } = require('../auth');
const { mountNotifications } = require('./shared');

const router = express.Router();
router.use(requireRole('ADMIN'));
router.use(async (req, res, next) => {
  const c = await db.one(`SELECT
    (SELECT COUNT(*) FROM thanh_toan WHERE trang_thai = 'CHO_XAC_NHAN') AS thanh_toan,
    (SELECT COUNT(*) FROM danh_gia WHERE trang_thai = 'CHO_DUYET') AS danh_gia,
    (SELECT COUNT(*) FROM yeu_cau_tu_van WHERE trang_thai IN ('MOI', 'DA_DE_XUAT')) AS tu_van,
    (SELECT COUNT(*) FROM khoa_hoc WHERE trang_thai = 'CHO_DUYET') AS khoa_hoc`);
  res.locals.counts = { thanhToan: Number(c.thanh_toan), danhGia: Number(c.danh_gia), tuVan: Number(c.tu_van), khoaHoc: Number(c.khoa_hoc) };
  res.locals.role = 'admin';
  next();
});

const notFound = (res) => res.status(404).render('client/404', { title: 'Không tìm thấy trang' });

// ============================================================
// TỔNG QUAN & THỐNG KÊ
// ============================================================

async function revenueByMonth(months = 6) {
  const rows = await db.query(`SELECT DATE_FORMAT(ngay_xac_nhan, '%Y-%m') AS thang, SUM(so_tien) AS tong FROM thanh_toan
    WHERE trang_thai = 'DA_THANH_TOAN' AND ngay_xac_nhan >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL ? MONTH)
    GROUP BY thang`, [months - 1]);
  const out = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const r = rows.find((x) => x.thang === key);
    out.push({ thang: `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`, tong: Number(r ? r.tong : 0) });
  }
  return out;
}

router.get('/', async (req, res) => {
  const stats = await db.one(`SELECT
    (SELECT COALESCE(SUM(so_tien), 0) FROM thanh_toan WHERE trang_thai = 'DA_THANH_TOAN') AS doanh_thu,
    (SELECT COUNT(*) FROM dang_ky WHERE trang_thai = 'DA_KICH_HOAT') AS dang_ky,
    (SELECT COUNT(*) FROM tai_khoan WHERE vai_tro = 'HOC_VIEN') AS hoc_vien,
    (SELECT COUNT(*) FROM tai_khoan WHERE vai_tro = 'GIAO_VIEN') AS giao_vien,
    (SELECT COUNT(*) FROM khoa_hoc WHERE trang_thai = 'MO_DANG_KY') AS khoa_hoc,
    (SELECT ROUND(AVG(so_sao), 2) FROM danh_gia WHERE trang_thai = 'HIEN_THI') AS diem_tb`);
  res.render('admin/dashboard', { title: 'Tổng quan', stats, revenue: await revenueByMonth(6) });
});

router.get('/thong-ke', async (req, res) => {
  const [byCourse, byCategory, byTeacher] = await Promise.all([
    db.query(`SELECT kh.id, kh.ten, kh.danh_muc,
        (SELECT COUNT(*) FROM dang_ky dk WHERE dk.khoa_hoc_id = kh.id AND dk.trang_thai = 'DA_KICH_HOAT') AS dang_ky,
        (SELECT COALESCE(SUM(tt.so_tien), 0) FROM thanh_toan tt JOIN dang_ky dk ON dk.id = tt.dang_ky_id WHERE dk.khoa_hoc_id = kh.id AND tt.trang_thai = 'DA_THANH_TOAN') AS doanh_thu,
        (SELECT ROUND(AVG(so_sao), 1) FROM danh_gia d WHERE d.khoa_hoc_id = kh.id AND d.trang_thai = 'HIEN_THI') AS diem,
        (SELECT COUNT(*) FROM danh_gia d WHERE d.khoa_hoc_id = kh.id AND d.trang_thai = 'HIEN_THI') AS so_dg
      FROM khoa_hoc kh ORDER BY doanh_thu DESC, kh.ten`),
    db.query(`SELECT kh.danh_muc, COUNT(DISTINCT dk.id) AS dang_ky, COALESCE(SUM(tt.so_tien), 0) AS doanh_thu
      FROM khoa_hoc kh LEFT JOIN dang_ky dk ON dk.khoa_hoc_id = kh.id AND dk.trang_thai = 'DA_KICH_HOAT'
      LEFT JOIN thanh_toan tt ON tt.dang_ky_id = dk.id AND tt.trang_thai = 'DA_THANH_TOAN'
      GROUP BY kh.danh_muc ORDER BY doanh_thu DESC`),
    db.query(`SELECT tk.id, tk.ho_ten,
        (SELECT COUNT(*) FROM khoa_hoc kh WHERE kh.giao_vien_id = tk.id) AS khoa,
        (SELECT COUNT(DISTINCT dk.hoc_vien_id) FROM dang_ky dk JOIN khoa_hoc kh ON kh.id = dk.khoa_hoc_id WHERE kh.giao_vien_id = tk.id AND dk.trang_thai = 'DA_KICH_HOAT') AS hoc_vien,
        (SELECT ROUND(AVG(d.so_sao), 1) FROM danh_gia d JOIN khoa_hoc kh ON kh.id = d.khoa_hoc_id WHERE kh.giao_vien_id = tk.id AND d.trang_thai = 'HIEN_THI') AS diem
      FROM tai_khoan tk WHERE tk.vai_tro = 'GIAO_VIEN' ORDER BY hoc_vien DESC, tk.ho_ten`),
  ]);
  res.render('admin/stats', { title: 'Thống kê', byCourse, byCategory, byTeacher, revenue: await revenueByMonth(12) });
});

// ============================================================
// THANH TOÁN
// ============================================================

const PAY_TABS = { 'cho-xac-nhan': 'CHO_XAC_NHAN', 'chua-chuyen': 'CHO_THANH_TOAN', 'da-thanh-toan': 'DA_THANH_TOAN', 'tu-choi': 'TU_CHOI' };

router.get('/thanh-toan', async (req, res) => {
  const tab = PAY_TABS[req.query.tab] ? req.query.tab : 'cho-xac-nhan';
  const items = await db.query(`SELECT tt.*, dk.trinh_do_hien_tai, dk.muc_tieu, dk.ghi_chu_hv, dk.ghi_chu_admin, dk.ly_do_tu_choi, dk.hoc_vien_id,
      hv.ho_ten AS hoc_vien_ten, hv.sdt AS hoc_vien_sdt, kh.ten AS khoa_hoc_ten, gv.ho_ten AS giao_vien_ten
    FROM thanh_toan tt JOIN dang_ky dk ON dk.id = tt.dang_ky_id JOIN tai_khoan hv ON hv.id = dk.hoc_vien_id
    JOIN khoa_hoc kh ON kh.id = dk.khoa_hoc_id LEFT JOIN tai_khoan gv ON gv.id = kh.giao_vien_id
    WHERE tt.trang_thai = ? ORDER BY tt.ngay_tao ${tab === 'cho-xac-nhan' || tab === 'chua-chuyen' ? 'ASC' : 'DESC'} LIMIT 200`, [PAY_TABS[tab]]);
  res.render('admin/payments', { title: 'Thanh toán', items, tab });
});

async function loadPayment(id, conn) {
  return db.one(`SELECT tt.*, dk.hoc_vien_id, dk.khoa_hoc_id, kh.ten AS khoa_hoc_ten, kh.giao_vien_id, hv.ho_ten AS hoc_vien_ten
    FROM thanh_toan tt JOIN dang_ky dk ON dk.id = tt.dang_ky_id JOIN khoa_hoc kh ON kh.id = dk.khoa_hoc_id
    JOIN tai_khoan hv ON hv.id = dk.hoc_vien_id WHERE tt.id = ? FOR UPDATE`, [id], conn);
}

router.post('/thanh-toan/:id/xac-nhan', async (req, res) => {
  const maGd = h.clean(req.body.ma_gd_ngan_hang, 50);
  const ghiChu = h.clean(req.body.ghi_chu_admin, 1000);
  if (!maGd) {
    flash(req, 'error', 'Vui lòng nhập mã giao dịch ngân hàng.');
    return res.redirect('/admin/thanh-toan');
  }
  let result;
  try {
    result = await db.transaction(async (conn) => {
      const p = await loadPayment(req.params.id, conn);
      if (!p || !['CHO_XAC_NHAN', 'CHO_THANH_TOAN'].includes(p.trang_thai)) return 'Đơn không ở trạng thái chờ xác nhận.';
      const used = await db.one('SELECT ma_don FROM thanh_toan WHERE ma_gd_ngan_hang = ? AND id <> ?', [maGd, p.id], conn);
      if (used) return `Mã giao dịch đã được dùng cho đơn ${used.ma_don}.`;
      await db.query("UPDATE thanh_toan SET trang_thai = 'DA_THANH_TOAN', ma_gd_ngan_hang = ?, ngay_xac_nhan = NOW() WHERE id = ?", [maGd, p.id], conn);
      await db.query(`UPDATE dang_ky SET trang_thai = 'DA_KICH_HOAT', ghi_chu_admin = ?, nguoi_duyet = ?, ngay_duyet = NOW(), ly_do_tu_choi = NULL
        WHERE id = ?`, [h.orNull(ghiChu), req.user.id, p.dang_ky_id], conn);
      await db.notify(p.hoc_vien_id, 'Khóa học đã được kích hoạt', `${p.khoa_hoc_ten} – đơn ${p.ma_don}`, `/hoc/${p.khoa_hoc_id}`, conn);
      await db.notify(p.giao_vien_id, 'Có học viên mới', `${p.hoc_vien_ten} vào lớp ${p.khoa_hoc_ten}${ghiChu ? ` – Ghi chú: ${ghiChu}` : ''}`,
        `/teacher/hoc-vien/${p.hoc_vien_id}`, conn);
      return null;
    });
  } catch (err) {
    if (h.isDuplicate(err)) result = 'Mã giao dịch đã được dùng cho đơn khác.';
    else throw err;
  }
  flash(req, result ? 'error' : 'success', result || 'Đã xác nhận thanh toán và kích hoạt khóa học.');
  res.redirect('/admin/thanh-toan');
});

router.post('/thanh-toan/:id/tu-choi', async (req, res) => {
  const lyDo = h.clean(req.body.ly_do, 500);
  if (!lyDo) {
    flash(req, 'error', 'Vui lòng nhập lý do từ chối.');
    return res.redirect('/admin/thanh-toan');
  }
  const err = await db.transaction(async (conn) => {
    const p = await loadPayment(req.params.id, conn);
    if (!p || !['CHO_XAC_NHAN', 'CHO_THANH_TOAN'].includes(p.trang_thai)) return 'Đơn không ở trạng thái chờ xác nhận.';
    await db.query("UPDATE thanh_toan SET trang_thai = 'TU_CHOI', ngay_xac_nhan = NOW() WHERE id = ?", [p.id], conn);
    await db.query("UPDATE dang_ky SET trang_thai = 'BI_TU_CHOI', ly_do_tu_choi = ?, nguoi_duyet = ?, ngay_duyet = NOW() WHERE id = ?",
      [lyDo, req.user.id, p.dang_ky_id], conn);
    await db.notify(p.hoc_vien_id, 'Thanh toán bị từ chối', `${p.ma_don}: ${lyDo}`, `/thanh-toan/${p.ma_don}`, conn);
    return null;
  });
  flash(req, err ? 'error' : 'success', err || 'Đã từ chối đơn và thông báo cho học viên.');
  res.redirect('/admin/thanh-toan');
});

// ============================================================
// ĐÁNH GIÁ
// ============================================================

const REVIEW_TABS = { 'cho-duyet': 'CHO_DUYET', 'hien-thi': 'HIEN_THI', 'bi-an': 'BI_AN' };

router.get('/danh-gia', async (req, res) => {
  const tab = REVIEW_TABS[req.query.tab] ? req.query.tab : 'cho-duyet';
  const sao = Number(req.query.sao) || 0;
  const params = [REVIEW_TABS[tab]];
  let extra = '';
  if (sao >= 1 && sao <= 5) { extra = ' AND d.so_sao = ?'; params.push(sao); }
  const items = await db.query(`SELECT d.*, hv.ho_ten, kh.ten AS khoa_hoc_ten, gv.ho_ten AS giao_vien_ten FROM danh_gia d
    JOIN tai_khoan hv ON hv.id = d.hoc_vien_id JOIN khoa_hoc kh ON kh.id = d.khoa_hoc_id LEFT JOIN tai_khoan gv ON gv.id = kh.giao_vien_id
    WHERE d.trang_thai = ?${extra} ORDER BY d.ngay_tao DESC LIMIT 200`, params);
  res.render('admin/reviews', { title: 'Đánh giá', items, tab, sao });
});

async function approveReviews(ids) {
  const list = ids.map(Number).filter(Boolean);
  if (!list.length) return 0;
  return db.transaction(async (conn) => {
    const rows = await db.query(`SELECT d.id, d.hoc_vien_id, kh.giao_vien_id, kh.ten, kh.id AS khoa_hoc_id FROM danh_gia d
      JOIN khoa_hoc kh ON kh.id = d.khoa_hoc_id WHERE d.id IN (?) AND d.trang_thai = 'CHO_DUYET'`, [list], conn);
    for (const r of rows) {
      await db.query("UPDATE danh_gia SET trang_thai = 'HIEN_THI', ly_do_an = NULL WHERE id = ?", [r.id], conn);
      await db.notify(r.giao_vien_id, 'Khóa học có đánh giá mới', r.ten, '/teacher/danh-gia', conn);
      await db.notify(r.hoc_vien_id, 'Đánh giá đã hiển thị', r.ten, `/khoa-hoc/${r.khoa_hoc_id}?tab=danh-gia`, conn);
    }
    return rows.length;
  });
}

router.post('/danh-gia/duyet-nhieu', async (req, res) => {
  const ids = [].concat(req.body.ids || []);
  const n = await approveReviews(ids);
  flash(req, n ? 'success' : 'error', n ? `Đã duyệt ${n} đánh giá.` : 'Chưa chọn đánh giá nào.');
  res.redirect('/admin/danh-gia');
});

router.post('/danh-gia/:id/duyet', async (req, res) => {
  await approveReviews([req.params.id]);
  flash(req, 'success', 'Đã duyệt đánh giá.');
  res.redirect(req.get('Referer') || '/admin/danh-gia');
});

router.post('/danh-gia/:id/an', async (req, res) => {
  const lyDo = h.clean(req.body.ly_do, 500) || 'Vi phạm quy định nội dung';
  const d = await db.one('SELECT d.*, kh.ten FROM danh_gia d JOIN khoa_hoc kh ON kh.id = d.khoa_hoc_id WHERE d.id = ?', [req.params.id]);
  if (!d) return notFound(res);
  await db.transaction(async (conn) => {
    await db.query("UPDATE danh_gia SET trang_thai = 'BI_AN', ly_do_an = ? WHERE id = ?", [lyDo, d.id], conn);
    await db.notify(d.hoc_vien_id, 'Đánh giá bị ẩn', `${d.ten}: ${lyDo}`, '/tai-khoan/danh-gia', conn);
  });
  flash(req, 'success', 'Đã ẩn đánh giá.');
  res.redirect(req.get('Referer') || '/admin/danh-gia');
});

router.post('/danh-gia/:id/hien', async (req, res) => {
  await db.query("UPDATE danh_gia SET trang_thai = 'HIEN_THI', ly_do_an = NULL WHERE id = ? AND trang_thai = 'BI_AN'", [req.params.id]);
  flash(req, 'success', 'Đã hiển thị lại đánh giá.');
  res.redirect(req.get('Referer') || '/admin/danh-gia?tab=bi-an');
});

router.post('/danh-gia/:id/xoa', async (req, res) => {
  await db.query('DELETE FROM danh_gia WHERE id = ?', [req.params.id]);
  flash(req, 'success', 'Đã xóa đánh giá.');
  res.redirect(req.get('Referer') || '/admin/danh-gia');
});

// ============================================================
// YÊU CẦU TƯ VẤN
// ============================================================

const CONSULT_TABS = { moi: 'MOI', 'chuyen-gv': 'CHUYEN_GV', 'da-de-xuat': 'DA_DE_XUAT', 'hoan-tat': 'HOAN_TAT' };

router.get('/tu-van', async (req, res) => {
  const tab = CONSULT_TABS[req.query.tab] ? req.query.tab : 'tat-ca';
  const where = tab === 'tat-ca' ? "y.trang_thai <> 'HOAN_TAT'" : 'y.trang_thai = ?';
  const items = await db.query(`SELECT y.*, kh.ten AS khoa_hoc_ten, gv.ho_ten AS giao_vien_ten FROM yeu_cau_tu_van y
    LEFT JOIN khoa_hoc kh ON kh.id = y.khoa_hoc_id LEFT JOIN tai_khoan gv ON gv.id = y.giao_vien_id
    WHERE ${where} ORDER BY y.ngay_tao DESC LIMIT 200`, tab === 'tat-ca' ? [] : [CONSULT_TABS[tab]]);
  const teachers = await db.query(`SELECT tk.id, tk.ho_ten, gv.chuyen_mon FROM tai_khoan tk JOIN giao_vien gv ON gv.tai_khoan_id = tk.id
    WHERE tk.trang_thai = 'HOAT_DONG' ORDER BY tk.ho_ten`);
  res.render('admin/consults', { title: 'Yêu cầu tư vấn', items, tab, teachers });
});

router.post('/tu-van/:id/chuyen', async (req, res) => {
  const y = await db.one("SELECT * FROM yeu_cau_tu_van WHERE id = ? AND trang_thai IN ('MOI', 'CHUYEN_GV')", [req.params.id]);
  const gv = await db.one("SELECT id, ho_ten FROM tai_khoan WHERE id = ? AND vai_tro = 'GIAO_VIEN' AND trang_thai = 'HOAT_DONG'", [req.body.giao_vien_id]);
  if (!y || !gv) {
    flash(req, 'error', 'Vui lòng chọn giáo viên hợp lệ.');
    return res.redirect('/admin/tu-van');
  }
  await db.transaction(async (conn) => {
    await db.query("UPDATE yeu_cau_tu_van SET trang_thai = 'CHUYEN_GV', giao_vien_id = ? WHERE id = ?", [gv.id, y.id], conn);
    await db.notify(gv.id, 'Yêu cầu kiểm tra trình độ', `${y.ho_ten} – ${y.sdt}`, '/teacher/tu-van', conn);
  });
  flash(req, 'success', `Đã chuyển cho ${gv.ho_ten}.`);
  res.redirect('/admin/tu-van');
});

router.post('/tu-van/:id/hoan-tat', async (req, res) => {
  const ketQua = h.clean(req.body.ket_qua, 2000);
  const y = await db.one("SELECT * FROM yeu_cau_tu_van WHERE id = ? AND trang_thai <> 'HOAN_TAT'", [req.params.id]);
  if (!y) return notFound(res);
  if (!ketQua) {
    flash(req, 'error', 'Vui lòng ghi kết quả tư vấn trước khi hoàn tất.');
    return res.redirect('/admin/tu-van');
  }
  await db.query("UPDATE yeu_cau_tu_van SET trang_thai = 'HOAN_TAT', ket_qua = ? WHERE id = ?", [ketQua, y.id]);
  flash(req, 'success', 'Đã hoàn tất yêu cầu tư vấn.');
  res.redirect('/admin/tu-van');
});

// ============================================================
// KHÓA HỌC
// ============================================================

const COURSE_TABS = { 'cho-duyet': 'CHO_DUYET', nhap: 'NHAP', 'can-sua': 'CAN_SUA', 'dang-mo': 'MO_DANG_KY', 'da-an': 'AN' };

async function activeTeachers() {
  return db.query(`SELECT tk.id, tk.ho_ten, gv.chuyen_mon FROM tai_khoan tk JOIN giao_vien gv ON gv.tai_khoan_id = tk.id
    WHERE tk.trang_thai = 'HOAT_DONG' ORDER BY tk.ho_ten`);
}

router.get('/khoa-hoc', async (req, res) => {
  const tab = COURSE_TABS[req.query.tab] ? req.query.tab : 'tat-ca';
  const q = h.clean(req.query.q, 100);
  const where = [];
  const params = [];
  if (tab !== 'tat-ca') { where.push('kh.trang_thai = ?'); params.push(COURSE_TABS[tab]); }
  if (q) { where.push('(kh.ten LIKE ? OR tk.ho_ten LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const courses = await db.query(`SELECT ${h.COURSE_COLUMNS},
      (SELECT COUNT(*) FROM dang_ky x WHERE x.khoa_hoc_id = kh.id AND x.trang_thai = 'DA_KICH_HOAT') AS so_hoc_vien
    ${h.COURSE_FROM} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY FIELD(kh.trang_thai, 'CHO_DUYET', 'CAN_SUA', 'NHAP', 'MO_DANG_KY', 'AN'), kh.ngay_khai_giang DESC`, params);
  res.render('admin/courses', { title: 'Khóa học', courses, tab, q });
});

function courseInput(body) {
  const v = {
    ten: h.clean(body.ten, 200), danh_muc: body.danh_muc, trinh_do: h.clean(body.trinh_do, 50), gia: body.gia,
    lich_hoc: h.clean(body.lich_hoc, 200), thoi_luong: h.clean(body.thoi_luong, 50), ngay_khai_giang: h.orNull(body.ngay_khai_giang),
    so_cho_toi_da: body.so_cho_toi_da, giao_vien_id: body.giao_vien_id, mo_ta: h.clean(body.mo_ta, 5000), anh: h.clean(body.anh, 255),
  };
  const errors = {};
  if (!v.ten) errors.ten = 'Vui lòng nhập tên khóa học';
  if (!h.LABELS.danhMuc[v.danh_muc]) errors.danh_muc = 'Vui lòng chọn danh mục';
  const gia = Number(v.gia);
  if (!Number.isInteger(gia) || gia < 0) errors.gia = 'Học phí là số nguyên không âm (VNĐ)';
  const so = Number(v.so_cho_toi_da);
  if (!Number.isInteger(so) || so < 1 || so > 500) errors.so_cho_toi_da = 'Sĩ số từ 1 đến 500';
  if (v.ngay_khai_giang && Number.isNaN(Date.parse(v.ngay_khai_giang))) errors.ngay_khai_giang = 'Ngày không hợp lệ';
  if (!v.giao_vien_id) errors.giao_vien_id = 'Vui lòng phân công giáo viên';
  if (v.anh && !/^(https?:\/\/|\/)/i.test(v.anh)) errors.anh = 'Đường dẫn ảnh không hợp lệ';
  return { v, errors, gia, so };
}

router.get('/khoa-hoc/them', async (req, res) => {
  res.render('admin/course-form', { title: 'Thêm khóa học', v: { so_cho_toi_da: 20 }, errors: {}, teachers: await activeTeachers(), course: null });
});

router.post('/khoa-hoc/them', async (req, res) => {
  const { v, errors, gia, so } = courseInput(req.body);
  const gv = v.giao_vien_id && await db.one("SELECT id FROM tai_khoan WHERE id = ? AND vai_tro = 'GIAO_VIEN' AND trang_thai = 'HOAT_DONG'", [v.giao_vien_id]);
  if (v.giao_vien_id && !gv) errors.giao_vien_id = 'Giáo viên không hợp lệ';
  if (Object.keys(errors).length) {
    return res.status(400).render('admin/course-form', { title: 'Thêm khóa học', v, errors, teachers: await activeTeachers(), course: null });
  }
  const id = await db.transaction(async (conn) => {
    const r = await db.query(`INSERT INTO khoa_hoc (ten, danh_muc, mo_ta, anh, trinh_do, gia, lich_hoc, thoi_luong, ngay_khai_giang, so_cho_toi_da, giao_vien_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [v.ten, v.danh_muc, h.orNull(v.mo_ta), h.orNull(v.anh), h.orNull(v.trinh_do), gia,
      h.orNull(v.lich_hoc), h.orNull(v.thoi_luong), v.ngay_khai_giang, so, gv.id], conn);
    await db.notify(gv.id, 'Bạn được phân công khóa học', v.ten, `/teacher/khoa-hoc/${r.insertId}`, conn);
    return r.insertId;
  });
  flash(req, 'success', 'Đã tạo khóa học ở trạng thái Nháp và thông báo cho giáo viên.');
  res.redirect(`/admin/khoa-hoc/${id}`);
});

async function loadCourse(id) {
  return db.one(`SELECT ${h.COURSE_COLUMNS},
      (SELECT COUNT(*) FROM dang_ky x WHERE x.khoa_hoc_id = kh.id) AS tong_dang_ky,
      (SELECT COUNT(*) FROM dang_ky x WHERE x.khoa_hoc_id = kh.id AND x.trang_thai = 'DA_KICH_HOAT') AS so_hoc_vien
    ${h.COURSE_FROM} WHERE kh.id = ?`, [id]);
}

router.get('/khoa-hoc/:id', async (req, res) => {
  const course = await loadCourse(req.params.id);
  if (!course) return notFound(res);
  const lessons = await db.query('SELECT * FROM bai_giang WHERE khoa_hoc_id = ? ORDER BY thu_tu, id', [course.id]);
  const students = await db.query(`SELECT dk.*, tk.ho_ten, tk.email FROM dang_ky dk JOIN tai_khoan tk ON tk.id = dk.hoc_vien_id
    WHERE dk.khoa_hoc_id = ? ORDER BY dk.ngay_dang_ky DESC`, [course.id]);
  res.render('admin/course-detail', {
    title: course.ten, course, lessons, students, teachers: await activeTeachers(), v: { ...course, ngay_khai_giang: h.isoDate(course.ngay_khai_giang) }, errors: {},
    tab: ['chinh-sua', 'noi-dung', 'hoc-vien'].includes(req.query.tab) ? req.query.tab : 'noi-dung',
  });
});

router.post('/khoa-hoc/:id', async (req, res) => {
  const course = await loadCourse(req.params.id);
  if (!course) return notFound(res);
  const { v, errors, gia, so } = courseInput(req.body);
  const gv = v.giao_vien_id && await db.one("SELECT id FROM tai_khoan WHERE id = ? AND vai_tro = 'GIAO_VIEN' AND trang_thai = 'HOAT_DONG'", [v.giao_vien_id]);
  if (v.giao_vien_id && !gv) errors.giao_vien_id = 'Giáo viên không hợp lệ';
  if (!errors.so_cho_toi_da && so < Number(course.so_hoc_vien)) errors.so_cho_toi_da = `Đã có ${course.so_hoc_vien} học viên, không thể giảm sĩ số thấp hơn`;
  if (Object.keys(errors).length) {
    const lessons = await db.query('SELECT * FROM bai_giang WHERE khoa_hoc_id = ? ORDER BY thu_tu, id', [course.id]);
    return res.status(400).render('admin/course-detail', { title: course.ten, course, lessons, students: [], teachers: await activeTeachers(), v, errors, tab: 'chinh-sua' });
  }
  await db.transaction(async (conn) => {
    await db.query(`UPDATE khoa_hoc SET ten = ?, danh_muc = ?, mo_ta = ?, anh = ?, trinh_do = ?, gia = ?, lich_hoc = ?, thoi_luong = ?,
      ngay_khai_giang = ?, so_cho_toi_da = ?, giao_vien_id = ? WHERE id = ?`, [v.ten, v.danh_muc, h.orNull(v.mo_ta), h.orNull(v.anh),
      h.orNull(v.trinh_do), gia, h.orNull(v.lich_hoc), h.orNull(v.thoi_luong), v.ngay_khai_giang, so, gv.id, course.id], conn);
    if (String(course.giao_vien_id) !== String(gv.id)) {
      await db.notify(gv.id, 'Bạn được phân công khóa học', v.ten, `/teacher/khoa-hoc/${course.id}`, conn);
    }
  });
  flash(req, 'success', 'Đã lưu khóa học.');
  res.redirect(`/admin/khoa-hoc/${course.id}?tab=chinh-sua`);
});

/** Chuyển trạng thái khóa học theo biểu đồ trạng thái (from → to). */
async function moveCourse(req, res, from, to, message, opts = {}) {
  const course = await loadCourse(req.params.id);
  if (!course) return notFound(res);
  if (!from.includes(course.trang_thai)) {
    flash(req, 'error', 'Thao tác không hợp lệ với trạng thái hiện tại của khóa học.');
    return res.redirect(`/admin/khoa-hoc/${course.id}`);
  }
  if (opts.requireNote && !h.clean(req.body.ghi_chu_duyet)) {
    flash(req, 'error', 'Vui lòng ghi rõ nội dung cần chỉnh sửa.');
    return res.redirect(`/admin/khoa-hoc/${course.id}`);
  }
  await db.transaction(async (conn) => {
    await db.query('UPDATE khoa_hoc SET trang_thai = ?, ghi_chu_duyet = ? WHERE id = ?',
      [to, opts.requireNote ? h.clean(req.body.ghi_chu_duyet, 2000) : (to === 'MO_DANG_KY' ? null : course.ghi_chu_duyet), course.id], conn);
    if (opts.notify) await db.notify(course.giao_vien_id, opts.notify, course.ten, `/teacher/khoa-hoc/${course.id}`, conn);
  });
  flash(req, 'success', message);
  return res.redirect(`/admin/khoa-hoc/${course.id}`);
}

router.post('/khoa-hoc/:id/duyet', (req, res) => moveCourse(req, res, ['CHO_DUYET'], 'MO_DANG_KY', 'Đã duyệt và mở đăng ký.', { notify: 'Khóa học đã mở đăng ký' }));
router.post('/khoa-hoc/:id/yeu-cau-sua', (req, res) => moveCourse(req, res, ['CHO_DUYET'], 'CAN_SUA', 'Đã yêu cầu giáo viên chỉnh sửa.', { requireNote: true, notify: 'Khóa học cần chỉnh sửa' }));
router.post('/khoa-hoc/:id/an', (req, res) => moveCourse(req, res, ['MO_DANG_KY'], 'AN', 'Đã ẩn / đóng đăng ký khóa học.'));
router.post('/khoa-hoc/:id/mo-lai', (req, res) => moveCourse(req, res, ['AN'], 'MO_DANG_KY', 'Đã mở lại khóa học.'));

router.post('/khoa-hoc/:id/xoa', async (req, res) => {
  const course = await loadCourse(req.params.id);
  if (!course) return notFound(res);
  // Chỉ xóa được khi chưa có đăng ký; nếu đã có học viên thì chỉ được ẩn để giữ lịch sử
  if (Number(course.tong_dang_ky) > 0) {
    flash(req, 'error', 'Khóa học đã có đăng ký, chỉ có thể ẩn để giữ lịch sử.');
    return res.redirect(`/admin/khoa-hoc/${course.id}`);
  }
  await db.transaction(async (conn) => {
    await db.query('UPDATE yeu_cau_tu_van SET khoa_hoc_id = NULL WHERE khoa_hoc_id = ?', [course.id], conn);
    await db.query('DELETE FROM khoa_hoc WHERE id = ?', [course.id], conn);
  });
  flash(req, 'success', `Đã xóa khóa học "${course.ten}".`);
  res.redirect('/admin/khoa-hoc');
});

// ============================================================
// GIÁO VIÊN
// ============================================================

function teacherInput(body, isNew) {
  const v = {
    ho_ten: h.clean(body.ho_ten, 100), email: h.clean(body.email, 100).toLowerCase(), sdt: h.clean(body.sdt, 15),
    ngay_sinh: h.orNull(body.ngay_sinh), gioi_tinh: h.LABELS.gioiTinh[body.gioi_tinh] ? body.gioi_tinh : null,
    chuyen_mon: h.clean(body.chuyen_mon, 100), hoc_vi: h.clean(body.hoc_vi, 100), chung_chi: h.clean(body.chung_chi, 255),
    kinh_nghiem_nam: body.kinh_nghiem_nam, ngay_vao_lam: h.orNull(body.ngay_vao_lam), gioi_thieu: h.clean(body.gioi_thieu, 3000),
  };
  const errors = {};
  if (!v.ho_ten) errors.ho_ten = 'Vui lòng nhập họ tên';
  if (!h.isEmail(v.email)) errors.email = 'Email không hợp lệ';
  if (v.sdt && !h.isPhone(v.sdt)) errors.sdt = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0';
  if (!v.chuyen_mon) errors.chuyen_mon = 'Vui lòng nhập chuyên môn';
  const kn = Number(v.kinh_nghiem_nam || 0);
  if (!Number.isInteger(kn) || kn < 0 || kn > 60) errors.kinh_nghiem_nam = 'Số năm kinh nghiệm từ 0 đến 60';
  for (const k of ['ngay_sinh', 'ngay_vao_lam']) if (v[k] && Number.isNaN(Date.parse(v[k]))) errors[k] = 'Ngày không hợp lệ';
  if (isNew) {
    v.mat_khau = String(body.mat_khau || '');
    if (v.mat_khau.length < 8) errors.mat_khau = 'Mật khẩu ban đầu tối thiểu 8 ký tự';
  }
  return { v, errors, kn };
}

router.get('/giao-vien', async (req, res) => {
  const q = h.clean(req.query.q, 100);
  const params = [];
  let extra = '';
  if (q) { extra = ' AND (tk.ho_ten LIKE ? OR tk.email LIKE ? OR tk.sdt LIKE ? OR gv.chuyen_mon LIKE ?)'; params.push(...Array(4).fill(`%${q}%`)); }
  const teachers = await db.query(`SELECT tk.id, tk.ho_ten, tk.email, tk.sdt, tk.trang_thai, gv.chuyen_mon, gv.kinh_nghiem_nam,
      (SELECT COUNT(*) FROM khoa_hoc kh WHERE kh.giao_vien_id = tk.id) AS so_khoa,
      (SELECT COUNT(DISTINCT dk.hoc_vien_id) FROM dang_ky dk JOIN khoa_hoc kh ON kh.id = dk.khoa_hoc_id WHERE kh.giao_vien_id = tk.id AND dk.trang_thai = 'DA_KICH_HOAT') AS so_hv
    FROM tai_khoan tk JOIN giao_vien gv ON gv.tai_khoan_id = tk.id WHERE tk.vai_tro = 'GIAO_VIEN'${extra} ORDER BY tk.ho_ten`, params);
  res.render('admin/teachers', { title: 'Giáo viên', teachers, q });
});

router.get('/giao-vien/them', (req, res) => {
  res.render('admin/teacher-form', { title: 'Thêm giáo viên', v: { kinh_nghiem_nam: 0 }, errors: {}, teacher: null });
});

router.post('/giao-vien/them', async (req, res) => {
  const { v, errors, kn } = teacherInput(req.body, true);
  if (!errors.email && await db.one('SELECT id FROM tai_khoan WHERE email = ?', [v.email])) errors.email = 'Email đã được sử dụng';
  if (Object.keys(errors).length) return res.status(400).render('admin/teacher-form', { title: 'Thêm giáo viên', v, errors, teacher: null });
  const hash = await bcrypt.hash(v.mat_khau, 10);
  let id;
  try {
    // Tạo TAI_KHOAN và GIAO_VIEN trong một giao dịch: không có tài khoản giáo viên thiếu hồ sơ
    id = await db.transaction(async (conn) => {
      const r = await db.query("INSERT INTO tai_khoan (email, mat_khau, ho_ten, sdt, vai_tro) VALUES (?, ?, ?, ?, 'GIAO_VIEN')",
        [v.email, hash, v.ho_ten, h.orNull(v.sdt)], conn);
      await db.query(`INSERT INTO giao_vien (tai_khoan_id, ngay_sinh, gioi_tinh, chuyen_mon, hoc_vi, chung_chi, kinh_nghiem_nam, gioi_thieu, ngay_vao_lam)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [r.insertId, v.ngay_sinh, v.gioi_tinh, v.chuyen_mon, h.orNull(v.hoc_vi), h.orNull(v.chung_chi), kn,
        h.orNull(v.gioi_thieu), v.ngay_vao_lam], conn);
      await db.notify(r.insertId, 'Chào mừng bạn đến với EngEdu', 'Vui lòng đổi mật khẩu ban đầu và cập nhật phần giới thiệu.', '/teacher/mat-khau', conn);
      return r.insertId;
    });
  } catch (err) {
    if (h.isDuplicate(err)) return res.status(400).render('admin/teacher-form', { title: 'Thêm giáo viên', v, errors: { email: 'Email đã được sử dụng' }, teacher: null });
    throw err;
  }
  flash(req, 'success', `Đã cấp tài khoản giáo viên. Gửi cho giáo viên email ${v.email} và mật khẩu ban đầu để đăng nhập.`);
  res.redirect(`/admin/giao-vien/${id}`);
});

async function loadTeacher(id) {
  return db.one(`SELECT tk.id, tk.ho_ten, tk.email, tk.sdt, tk.trang_thai, tk.ngay_tao, gv.* FROM tai_khoan tk
    JOIN giao_vien gv ON gv.tai_khoan_id = tk.id WHERE tk.id = ? AND tk.vai_tro = 'GIAO_VIEN'`, [id]);
}

router.get('/giao-vien/:id', async (req, res) => {
  const teacher = await loadTeacher(req.params.id);
  if (!teacher) return notFound(res);
  const courses = await db.query(`SELECT ${h.COURSE_COLUMNS} ${h.COURSE_FROM} WHERE kh.giao_vien_id = ? ORDER BY kh.ngay_khai_giang DESC`, [teacher.id]);
  const tab = req.query.tab === 'chinh-sua' ? 'chinh-sua' : 'thong-tin';
  res.render('admin/teacher-detail', {
    title: teacher.ho_ten, teacher, courses, tab, errors: {},
    v: { ...teacher, ngay_sinh: h.isoDate(teacher.ngay_sinh), ngay_vao_lam: h.isoDate(teacher.ngay_vao_lam) },
  });
});

router.post('/giao-vien/:id', async (req, res) => {
  const teacher = await loadTeacher(req.params.id);
  if (!teacher) return notFound(res);
  const { v, errors, kn } = teacherInput(req.body, false);
  if (!errors.email && await db.one('SELECT id FROM tai_khoan WHERE email = ? AND id <> ?', [v.email, teacher.id])) errors.email = 'Email đã được sử dụng';
  if (Object.keys(errors).length) {
    return res.status(400).render('admin/teacher-detail', { title: teacher.ho_ten, teacher, courses: [], tab: 'chinh-sua', v, errors });
  }
  await db.transaction(async (conn) => {
    await db.query('UPDATE tai_khoan SET ho_ten = ?, email = ?, sdt = ? WHERE id = ?', [v.ho_ten, v.email, h.orNull(v.sdt), teacher.id], conn);
    await db.query(`UPDATE giao_vien SET ngay_sinh = ?, gioi_tinh = ?, chuyen_mon = ?, hoc_vi = ?, chung_chi = ?, kinh_nghiem_nam = ?, gioi_thieu = ?, ngay_vao_lam = ?
      WHERE tai_khoan_id = ?`, [v.ngay_sinh, v.gioi_tinh, v.chuyen_mon, h.orNull(v.hoc_vi), h.orNull(v.chung_chi), kn, h.orNull(v.gioi_thieu), v.ngay_vao_lam, teacher.id], conn);
  });
  flash(req, 'success', 'Đã lưu hồ sơ giáo viên.');
  res.redirect(`/admin/giao-vien/${teacher.id}`);
});

router.post('/giao-vien/:id/dat-lai-mat-khau', async (req, res) => {
  const teacher = await loadTeacher(req.params.id);
  if (!teacher) return notFound(res);
  const mk = String(req.body.mat_khau_moi || '');
  if (mk.length < 8) {
    flash(req, 'error', 'Mật khẩu mới tối thiểu 8 ký tự.');
  } else {
    await db.transaction(async (conn) => {
      await db.query('UPDATE tai_khoan SET mat_khau = ? WHERE id = ?', [await bcrypt.hash(mk, 10), teacher.id], conn);
      await db.notify(teacher.id, 'Mật khẩu đã được đặt lại', 'Admin đã đặt lại mật khẩu của bạn. Hãy đổi mật khẩu sau khi đăng nhập.', '/teacher/mat-khau', conn);
    });
    flash(req, 'success', 'Đã đặt lại mật khẩu giáo viên.');
  }
  res.redirect(`/admin/giao-vien/${teacher.id}`);
});

// ============================================================
// KHÓA / MỞ KHÓA TÀI KHOẢN (giáo viên và học viên; Admin cố định không khóa được)
// ============================================================

async function setLock(req, res, role, back, lock) {
  const acc = await db.one('SELECT id, vai_tro, ho_ten FROM tai_khoan WHERE id = ? AND vai_tro = ?', [req.params.id, role]);
  if (!acc) return notFound(res);
  await db.query('UPDATE tai_khoan SET trang_thai = ? WHERE id = ?', [lock ? 'BI_KHOA' : 'HOAT_DONG', acc.id]);
  if (lock) await destroySessionsOf(acc.id);
  flash(req, 'success', `${lock ? 'Đã khóa' : 'Đã mở khóa'} tài khoản ${acc.ho_ten}.`);
  res.redirect(`${back}/${acc.id}`);
}

router.post('/giao-vien/:id/khoa', (req, res) => setLock(req, res, 'GIAO_VIEN', '/admin/giao-vien', true));
router.post('/giao-vien/:id/mo-khoa', (req, res) => setLock(req, res, 'GIAO_VIEN', '/admin/giao-vien', false));
router.post('/hoc-vien/:id/khoa', (req, res) => setLock(req, res, 'HOC_VIEN', '/admin/hoc-vien', true));
router.post('/hoc-vien/:id/mo-khoa', (req, res) => setLock(req, res, 'HOC_VIEN', '/admin/hoc-vien', false));

// ============================================================
// HỌC VIÊN
// ============================================================

router.get('/hoc-vien', async (req, res) => {
  const q = h.clean(req.query.q, 100);
  const params = [];
  let extra = '';
  if (q) { extra = ' AND (tk.ho_ten LIKE ? OR tk.email LIKE ? OR tk.sdt LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const students = await db.query(`SELECT tk.id, tk.ho_ten, tk.email, tk.sdt, tk.trang_thai, tk.ngay_tao, hv.trinh_do,
      (SELECT COUNT(*) FROM dang_ky dk WHERE dk.hoc_vien_id = tk.id AND dk.trang_thai = 'DA_KICH_HOAT') AS so_khoa,
      (SELECT COALESCE(SUM(tt.so_tien), 0) FROM thanh_toan tt JOIN dang_ky dk ON dk.id = tt.dang_ky_id WHERE dk.hoc_vien_id = tk.id AND tt.trang_thai = 'DA_THANH_TOAN') AS da_tra
    FROM tai_khoan tk JOIN hoc_vien hv ON hv.tai_khoan_id = tk.id WHERE tk.vai_tro = 'HOC_VIEN'${extra} ORDER BY tk.ngay_tao DESC`, params);
  res.render('admin/students', { title: 'Học viên', students, q });
});

router.get('/hoc-vien/:id', async (req, res) => {
  const student = await db.one(`SELECT tk.id, tk.ho_ten, tk.email, tk.sdt, tk.trang_thai, tk.ngay_tao, hv.* FROM tai_khoan tk
    JOIN hoc_vien hv ON hv.tai_khoan_id = tk.id WHERE tk.id = ? AND tk.vai_tro = 'HOC_VIEN'`, [req.params.id]);
  if (!student) return notFound(res);
  const [enrollments, payments, reviews] = await Promise.all([
    db.query(`SELECT dk.*, kh.ten, gv.ho_ten AS giao_vien_ten FROM dang_ky dk JOIN khoa_hoc kh ON kh.id = dk.khoa_hoc_id
      LEFT JOIN tai_khoan gv ON gv.id = kh.giao_vien_id WHERE dk.hoc_vien_id = ? ORDER BY dk.ngay_dang_ky DESC`, [student.id]),
    db.query(`SELECT tt.*, kh.ten AS khoa_hoc_ten FROM thanh_toan tt JOIN dang_ky dk ON dk.id = tt.dang_ky_id JOIN khoa_hoc kh ON kh.id = dk.khoa_hoc_id
      WHERE dk.hoc_vien_id = ? ORDER BY tt.ngay_tao DESC`, [student.id]),
    db.query(`SELECT d.*, kh.ten AS khoa_hoc_ten FROM danh_gia d JOIN khoa_hoc kh ON kh.id = d.khoa_hoc_id WHERE d.hoc_vien_id = ? ORDER BY d.ngay_tao DESC`, [student.id]),
  ]);
  const tab = ['thong-tin', 'khoa-hoc', 'thanh-toan', 'danh-gia'].includes(req.query.tab) ? req.query.tab : 'thong-tin';
  res.render('admin/student-detail', { title: student.ho_ten, student, enrollments, payments, reviews, tab });
});

mountNotifications(router, 'admin/notifications', '/admin');

module.exports = router;
