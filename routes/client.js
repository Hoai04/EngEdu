// Trang Client: khách vãng lai và khu vực học viên.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const h = require('../helpers');
const config = require('../config');
const { requireRole, flash } = require('../auth');
const { mountNotifications, mountPassword } = require('./shared');

const router = express.Router();
const student = requireRole('HOC_VIEN');

// ============================================================
// TRA CỨU (mọi người)
// ============================================================

router.get('/', async (req, res) => {
  const [stats, courses] = await Promise.all([
    db.one(`SELECT
      (SELECT COUNT(*) FROM khoa_hoc WHERE trang_thai = 'MO_DANG_KY') AS khoa_hoc,
      (SELECT COUNT(*) FROM tai_khoan WHERE vai_tro = 'GIAO_VIEN' AND trang_thai = 'HOAT_DONG') AS giao_vien,
      (SELECT COUNT(*) FROM tai_khoan WHERE vai_tro = 'HOC_VIEN') AS hoc_vien,
      (SELECT ROUND(AVG(so_sao), 1) FROM danh_gia WHERE trang_thai = 'HIEN_THI') AS diem_tb`),
    db.query(`SELECT ${h.COURSE_COLUMNS} ${h.COURSE_FROM}
      WHERE kh.trang_thai = 'MO_DANG_KY' ORDER BY kh.ngay_khai_giang IS NULL, kh.ngay_khai_giang, kh.id LIMIT 8`),
  ]);
  const categories = await db.query(`SELECT danh_muc, COUNT(*) AS n FROM khoa_hoc
    WHERE trang_thai = 'MO_DANG_KY' GROUP BY danh_muc`);
  res.render('client/home', { title: 'Trang chủ', stats, courses, categories });
});

router.get('/khoa-hoc', async (req, res) => {
  const { q = '', danh_muc = '', trinh_do = '', sap_xep = 'khai_giang' } = req.query;
  const where = ["kh.trang_thai = 'MO_DANG_KY'"];
  const params = [];
  if (q) {
    where.push('(kh.ten LIKE ? OR tk.ho_ten LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (h.LABELS.danhMuc[danh_muc]) { where.push('kh.danh_muc = ?'); params.push(danh_muc); }
  if (trinh_do) { where.push('kh.trinh_do = ?'); params.push(trinh_do); }
  const order = {
    khai_giang: 'kh.ngay_khai_giang IS NULL, kh.ngay_khai_giang',
    gia_tang: 'kh.gia ASC',
    gia_giam: 'kh.gia DESC',
    danh_gia: 'diem_tb IS NULL, diem_tb DESC',
  }[sap_xep] || 'kh.ngay_khai_giang';
  const courses = await db.query(
    `SELECT ${h.COURSE_COLUMNS} ${h.COURSE_FROM} WHERE ${where.join(' AND ')} ORDER BY ${order}, kh.id`,
    params,
  );
  const levels = await db.query("SELECT DISTINCT trinh_do FROM khoa_hoc WHERE trang_thai = 'MO_DANG_KY' AND trinh_do IS NOT NULL ORDER BY trinh_do");
  res.render('client/courses', { title: 'Khóa học', courses, levels: levels.map((l) => l.trinh_do), f: { q, danh_muc, trinh_do, sap_xep } });
});

/** Tình trạng của người xem đối với khóa học → quyết định nút ở khung đăng ký. */
async function viewerStatus(user, course) {
  if (!user) return { kind: course.cho_da_dung >= course.so_cho_toi_da ? 'full' : 'guest' };
  if (user.vai_tro !== 'HOC_VIEN') return { kind: 'staff' };
  const dk = await db.one('SELECT * FROM dang_ky WHERE hoc_vien_id = ? AND khoa_hoc_id = ?', [user.id, course.id]);
  if (dk) {
    if (dk.trang_thai === 'DA_KICH_HOAT') return { kind: 'active', dk };
    const tt = await db.one('SELECT * FROM thanh_toan WHERE dang_ky_id = ? ORDER BY id DESC LIMIT 1', [dk.id]);
    if (dk.trang_thai === 'CHO_THANH_TOAN' && tt) return { kind: 'pending', dk, tt };
    if (dk.trang_thai === 'BI_TU_CHOI') {
      return { kind: course.cho_da_dung >= course.so_cho_toi_da ? 'full' : 'rejected', dk };
    }
  }
  return { kind: course.cho_da_dung >= course.so_cho_toi_da ? 'full' : 'open' };
}

router.get('/khoa-hoc/:id', async (req, res, next) => {
  const course = await db.one(`SELECT ${h.COURSE_COLUMNS} ${h.COURSE_FROM} WHERE kh.id = ?`, [req.params.id]);
  if (!course) return next();
  const status = await viewerStatus(req.user, course);
  // Khóa học chưa mở chỉ hiện cho học viên đã có đăng ký
  if (course.trang_thai !== 'MO_DANG_KY' && !status.dk) return next();
  const tab = ['tong-quan', 'noi-dung', 'giao-vien', 'danh-gia'].includes(req.query.tab) ? req.query.tab : 'tong-quan';
  const [lessons, teacher, reviews, dist] = await Promise.all([
    db.query('SELECT id, chuong, tieu_de, thu_tu FROM bai_giang WHERE khoa_hoc_id = ? ORDER BY thu_tu, id', [course.id]),
    course.giao_vien_id ? db.one(`SELECT tk.ho_ten, tk.id, gv.* FROM giao_vien gv JOIN tai_khoan tk ON tk.id = gv.tai_khoan_id
      WHERE gv.tai_khoan_id = ?`, [course.giao_vien_id]) : null,
    db.query(`SELECT d.*, tk.ho_ten FROM danh_gia d JOIN tai_khoan tk ON tk.id = d.hoc_vien_id
      WHERE d.khoa_hoc_id = ? AND d.trang_thai = 'HIEN_THI' ORDER BY d.ngay_tao DESC`, [course.id]),
    db.query(`SELECT so_sao, COUNT(*) AS n FROM danh_gia WHERE khoa_hoc_id = ? AND trang_thai = 'HIEN_THI' GROUP BY so_sao`, [course.id]),
  ]);
  const distribution = [5, 4, 3, 2, 1].map((s) => ({ sao: s, n: Number((dist.find((d) => d.so_sao === s) || {}).n || 0) }));
  res.render('client/course-detail', { title: course.ten, course, status, tab, lessons, teacher, reviews, distribution });
});

router.get('/giao-vien', async (req, res) => {
  const teachers = await db.query(`SELECT tk.id, tk.ho_ten, gv.*,
      (SELECT COUNT(*) FROM khoa_hoc kh WHERE kh.giao_vien_id = tk.id AND kh.trang_thai = 'MO_DANG_KY') AS so_khoa
    FROM giao_vien gv JOIN tai_khoan tk ON tk.id = gv.tai_khoan_id
    WHERE tk.trang_thai = 'HOAT_DONG' ORDER BY tk.ho_ten`);
  res.render('client/teachers', { title: 'Giáo viên', teachers });
});

router.get('/giao-vien/:id', async (req, res, next) => {
  const teacher = await db.one(`SELECT tk.id, tk.ho_ten, gv.* FROM giao_vien gv JOIN tai_khoan tk ON tk.id = gv.tai_khoan_id
    WHERE tk.id = ? AND tk.trang_thai = 'HOAT_DONG'`, [req.params.id]);
  if (!teacher) return next();
  const courses = await db.query(`SELECT ${h.COURSE_COLUMNS} ${h.COURSE_FROM}
    WHERE kh.giao_vien_id = ? AND kh.trang_thai = 'MO_DANG_KY' ORDER BY kh.ngay_khai_giang`, [teacher.id]);
  const rating = await db.one(`SELECT ROUND(AVG(d.so_sao), 1) AS diem, COUNT(*) AS n FROM danh_gia d
    JOIN khoa_hoc kh ON kh.id = d.khoa_hoc_id WHERE kh.giao_vien_id = ? AND d.trang_thai = 'HIEN_THI'`, [teacher.id]);
  res.render('client/teacher-detail', { title: teacher.ho_ten, teacher, courses, rating });
});

router.get('/danh-gia', async (req, res) => {
  const sao = Number(req.query.sao) || 0;
  const params = [];
  let extra = '';
  if (sao >= 1 && sao <= 5) { extra = ' AND d.so_sao = ?'; params.push(sao); }
  const reviews = await db.query(`SELECT d.*, tk.ho_ten, kh.ten AS khoa_hoc_ten, kh.id AS khoa_hoc_id, gv.ho_ten AS giao_vien_ten
    FROM danh_gia d JOIN tai_khoan tk ON tk.id = d.hoc_vien_id JOIN khoa_hoc kh ON kh.id = d.khoa_hoc_id
    LEFT JOIN tai_khoan gv ON gv.id = kh.giao_vien_id
    WHERE d.trang_thai = 'HIEN_THI'${extra} ORDER BY d.ngay_tao DESC LIMIT 100`, params);
  const summary = await db.one("SELECT ROUND(AVG(so_sao), 1) AS diem, COUNT(*) AS n FROM danh_gia WHERE trang_thai = 'HIEN_THI'");
  res.render('client/reviews', { title: 'Đánh giá', reviews, summary, sao });
});

router.get('/gioi-thieu', (req, res) => res.render('client/about', { title: 'Giới thiệu' }));
router.get('/hoi-dap', (req, res) => res.render('client/faq', { title: 'Hỏi đáp' }));

// ---------- Tư vấn (khách hoặc học viên)
async function openCourses() {
  return db.query("SELECT id, ten FROM khoa_hoc WHERE trang_thai = 'MO_DANG_KY' ORDER BY ten");
}

router.get('/tu-van', async (req, res) => {
  const v = { ho_ten: '', sdt: '', email: '', khoa_hoc_id: req.query.khoa_hoc || '', noi_dung: '' };
  if (req.user && req.user.vai_tro === 'HOC_VIEN') Object.assign(v, { ho_ten: req.user.ho_ten, sdt: req.user.sdt || '', email: req.user.email });
  res.render('client/consult', { title: 'Tư vấn', v, errors: {}, courses: await openCourses(), done: false });
});

router.post('/tu-van', async (req, res) => {
  const v = {
    ho_ten: h.clean(req.body.ho_ten, 100), sdt: h.clean(req.body.sdt, 15), email: h.clean(req.body.email, 100),
    khoa_hoc_id: h.clean(req.body.khoa_hoc_id), noi_dung: h.clean(req.body.noi_dung, 1000),
  };
  const errors = {};
  if (!v.ho_ten) errors.ho_ten = 'Vui lòng nhập họ tên';
  if (!h.isPhone(v.sdt)) errors.sdt = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0';
  if (v.email && !h.isEmail(v.email)) errors.email = 'Email không hợp lệ';
  let khoaHocId = null;
  if (v.khoa_hoc_id) {
    const c = await db.one("SELECT id FROM khoa_hoc WHERE id = ? AND trang_thai = 'MO_DANG_KY'", [v.khoa_hoc_id]);
    if (!c) errors.khoa_hoc_id = 'Khóa học không hợp lệ'; else khoaHocId = c.id;
  }
  if (Object.keys(errors).length) {
    return res.status(400).render('client/consult', { title: 'Tư vấn', v, errors, courses: await openCourses(), done: false });
  }
  await db.transaction(async (conn) => {
    await db.query('INSERT INTO yeu_cau_tu_van (ho_ten, sdt, email, khoa_hoc_id, noi_dung) VALUES (?, ?, ?, ?, ?)',
      [v.ho_ten, v.sdt, h.orNull(v.email), khoaHocId, v.noi_dung], conn);
    await db.notifyAdmin('Yêu cầu tư vấn mới', `${v.ho_ten} – ${v.sdt}`, '/admin/tu-van', conn);
  });
  res.render('client/consult', { title: 'Tư vấn', v: {}, errors: {}, courses: [], done: true });
});

// ---------- Đăng ký tài khoản học viên
router.get('/dang-ky', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('client/register', { title: 'Đăng ký tài khoản', v: {}, errors: {} });
});

router.post('/dang-ky', async (req, res) => {
  if (req.user) return res.redirect('/');
  // Mọi tham số vai_tro gửi kèm đều bị bỏ qua: tài khoản tự đăng ký luôn là HOC_VIEN.
  const v = {
    ho_ten: h.clean(req.body.ho_ten, 100),
    email: h.clean(req.body.email, 100).toLowerCase(),
    sdt: h.clean(req.body.sdt, 15),
  };
  const mk = String(req.body.mat_khau || '');
  const errors = {};
  if (!v.ho_ten) errors.ho_ten = 'Vui lòng nhập họ tên';
  if (!h.isEmail(v.email)) errors.email = 'Email không hợp lệ';
  if (!h.isPhone(v.sdt)) errors.sdt = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0';
  if (mk.length < 8) errors.mat_khau = 'Mật khẩu tối thiểu 8 ký tự';
  else if (mk !== req.body.nhap_lai) errors.nhap_lai = 'Hai mật khẩu không khớp';
  if (!errors.email && (await db.one('SELECT id FROM tai_khoan WHERE email = ?', [v.email]))) errors.email = 'Email đã được sử dụng';
  if (Object.keys(errors).length) return res.status(400).render('client/register', { title: 'Đăng ký tài khoản', v, errors });

  const hash = await bcrypt.hash(mk, 10);
  let id;
  try {
    id = await db.transaction(async (conn) => {
      const r = await db.query("INSERT INTO tai_khoan (email, mat_khau, ho_ten, sdt, vai_tro) VALUES (?, ?, ?, ?, 'HOC_VIEN')",
        [v.email, hash, v.ho_ten, v.sdt], conn);
      await db.query('INSERT INTO hoc_vien (tai_khoan_id) VALUES (?)', [r.insertId], conn);
      await db.notifyAdmin('Học viên mới đăng ký', `${v.ho_ten} (${v.email})`, `/admin/hoc-vien/${r.insertId}`, conn);
      return r.insertId;
    });
  } catch (err) {
    if (h.isDuplicate(err)) return res.status(400).render('client/register', { title: 'Đăng ký tài khoản', v, errors: { email: 'Email đã được sử dụng' } });
    throw err;
  }
  const returnTo = req.session.returnTo;
  req.session.regenerate(() => {
    req.session.user = { id, vai_tro: 'HOC_VIEN' };
    flash(req, 'success', 'Tạo tài khoản thành công. Hãy bổ sung thông tin cá nhân để giáo viên hiểu bạn hơn.');
    req.session.save(() => res.redirect(returnTo && returnTo.startsWith('/dang-ky-hoc') ? returnTo : '/tai-khoan'));
  });
});

// ============================================================
// HỌC VIÊN – ĐĂNG KÝ KHÓA HỌC VÀ THANH TOÁN
// ============================================================

async function loadOpenCourse(id, conn) {
  return db.one(`SELECT ${h.COURSE_COLUMNS} ${h.COURSE_FROM} WHERE kh.id = ? AND kh.trang_thai = 'MO_DANG_KY'`, [id], conn);
}

router.get('/dang-ky-hoc/:id', student, async (req, res, next) => {
  const course = await loadOpenCourse(req.params.id);
  if (!course) return next();
  const status = await viewerStatus(req.user, course);
  if (status.kind === 'active') return res.redirect(`/hoc/${course.id}`);
  if (status.kind === 'pending') return res.redirect(`/thanh-toan/${status.tt.ma_don}`);
  if (status.kind === 'full') {
    flash(req, 'error', 'Khóa học đã đủ học viên.');
    return res.redirect(`/khoa-hoc/${course.id}`);
  }
  const profile = await db.one('SELECT * FROM hoc_vien WHERE tai_khoan_id = ?', [req.user.id]);
  const v = {
    trinh_do_hien_tai: status.dk?.trinh_do_hien_tai || profile?.trinh_do || '',
    muc_tieu: status.dk?.muc_tieu || profile?.muc_tieu || '',
    ghi_chu_hv: status.dk?.ghi_chu_hv || '',
  };
  res.render('client/enroll', { title: 'Đăng ký khóa học', course, v, errors: {}, rejected: status.kind === 'rejected' ? status.dk : null });
});

router.post('/dang-ky-hoc/:id', student, async (req, res, next) => {
  const v = {
    trinh_do_hien_tai: h.clean(req.body.trinh_do_hien_tai, 50),
    muc_tieu: h.clean(req.body.muc_tieu, 500),
    ghi_chu_hv: h.clean(req.body.ghi_chu_hv, 1000),
  };
  const errors = {};
  if (!v.trinh_do_hien_tai) errors.trinh_do_hien_tai = 'Vui lòng chọn trình độ hiện tại';
  if (!v.muc_tieu) errors.muc_tieu = 'Vui lòng nhập mục tiêu học';

  const course0 = await loadOpenCourse(req.params.id);
  if (!course0) return next();
  if (Object.keys(errors).length) return res.status(400).render('client/enroll', { title: 'Đăng ký khóa học', course: course0, v, errors, rejected: null });

  // Giao dịch CSDL: khóa dòng khóa học, kiểm tra chỗ, tạo DANG_KY + THANH_TOAN.
  const result = await db.transaction(async (conn) => {
    await db.query('SELECT id FROM khoa_hoc WHERE id = ? FOR UPDATE', [course0.id], conn);
    const course = await loadOpenCourse(course0.id, conn);
    if (!course) return { error: 'Khóa học không còn mở đăng ký.' };
    const dk = await db.one('SELECT * FROM dang_ky WHERE hoc_vien_id = ? AND khoa_hoc_id = ?', [req.user.id, course.id], conn);
    if (dk && dk.trang_thai === 'DA_KICH_HOAT') return { redirect: `/hoc/${course.id}` };
    if (dk && dk.trang_thai === 'CHO_THANH_TOAN') {
      const tt = await db.one('SELECT ma_don FROM thanh_toan WHERE dang_ky_id = ? ORDER BY id DESC LIMIT 1', [dk.id], conn);
      return { redirect: `/thanh-toan/${tt.ma_don}` };
    }
    if (Number(course.cho_da_dung) >= Number(course.so_cho_toi_da)) return { error: 'Khóa học đã đủ học viên.' };

    let dangKyId;
    if (dk) { // Đăng ký trước bị từ chối → cho đăng ký lại trên cùng bản ghi
      await db.query(`UPDATE dang_ky SET trinh_do_hien_tai = ?, muc_tieu = ?, ghi_chu_hv = ?, trang_thai = 'CHO_THANH_TOAN',
        ly_do_tu_choi = NULL, ghi_chu_admin = NULL, nguoi_duyet = NULL, ngay_duyet = NULL, ngay_dang_ky = NOW() WHERE id = ?`,
      [v.trinh_do_hien_tai, v.muc_tieu, v.ghi_chu_hv, dk.id], conn);
      dangKyId = dk.id;
    } else {
      const r = await db.query(`INSERT INTO dang_ky (hoc_vien_id, khoa_hoc_id, trinh_do_hien_tai, muc_tieu, ghi_chu_hv)
        VALUES (?, ?, ?, ?, ?)`, [req.user.id, course.id, v.trinh_do_hien_tai, v.muc_tieu, v.ghi_chu_hv], conn);
      dangKyId = r.insertId;
    }
    const t = await db.query('INSERT INTO thanh_toan (dang_ky_id, so_tien) VALUES (?, ?)', [dangKyId, course.gia], conn);
    const maDon = `KH${100000 + t.insertId}`;
    await db.query('UPDATE thanh_toan SET ma_don = ? WHERE id = ?', [maDon, t.insertId], conn);
    // Lưu lại trình độ/mục tiêu vào hồ sơ nếu hồ sơ còn trống
    await db.query(`UPDATE hoc_vien SET trinh_do = COALESCE(NULLIF(trinh_do, ''), ?), muc_tieu = COALESCE(NULLIF(muc_tieu, ''), ?)
      WHERE tai_khoan_id = ?`, [v.trinh_do_hien_tai, v.muc_tieu.slice(0, 255), req.user.id], conn);
    return { redirect: `/thanh-toan/${maDon}` };
  });

  if (result.error) {
    flash(req, 'error', result.error);
    return res.redirect(`/khoa-hoc/${course0.id}`);
  }
  res.redirect(result.redirect);
});

async function loadOrder(maDon, userId) {
  return db.one(`SELECT tt.*, dk.hoc_vien_id, dk.khoa_hoc_id, dk.trang_thai AS dk_trang_thai, dk.ly_do_tu_choi,
      kh.ten AS khoa_hoc_ten, gv.ho_ten AS giao_vien_ten,
      (tt.ngay_tao >= NOW() - INTERVAL ${Number(config.holdMinutes)} MINUTE) AS con_giu_cho,
      GREATEST(0, ${Number(config.holdMinutes) * 60} - TIMESTAMPDIFF(SECOND, tt.ngay_tao, NOW())) AS giay_con_lai
    FROM thanh_toan tt JOIN dang_ky dk ON dk.id = tt.dang_ky_id JOIN khoa_hoc kh ON kh.id = dk.khoa_hoc_id
    LEFT JOIN tai_khoan gv ON gv.id = kh.giao_vien_id
    WHERE tt.ma_don = ? AND dk.hoc_vien_id = ?`, [maDon, userId]);
}

router.get('/thanh-toan/:maDon', student, async (req, res, next) => {
  const order = await loadOrder(req.params.maDon, req.user.id);
  if (!order) return next();
  res.render('client/payment', { title: `Thanh toán ${order.ma_don}`, order, qr: h.vietQr(order.so_tien, order.ma_don), bank: config.bank });
});

router.post('/thanh-toan/:maDon/da-chuyen-khoan', student, async (req, res, next) => {
  const order = await loadOrder(req.params.maDon, req.user.id);
  if (!order) return next();
  if (order.trang_thai === 'CHO_THANH_TOAN') {
    await db.transaction(async (conn) => {
      const r = await db.query("UPDATE thanh_toan SET trang_thai = 'CHO_XAC_NHAN' WHERE id = ? AND trang_thai = 'CHO_THANH_TOAN'", [order.id], conn);
      if (r.affectedRows) {
        await db.notifyAdmin('Đơn cần xác nhận', `${order.ma_don} – ${req.user.ho_ten} – ${h.money(order.so_tien)}`, '/admin/thanh-toan', conn);
      }
    });
  }
  res.redirect(`/thanh-toan/${order.ma_don}`);
});

/** Giữ chỗ lại khi đơn chờ thanh toán đã quá thời gian giữ chỗ. */
router.post('/thanh-toan/:maDon/giu-cho', student, async (req, res, next) => {
  const order = await loadOrder(req.params.maDon, req.user.id);
  if (!order) return next();
  if (order.trang_thai === 'CHO_THANH_TOAN' && !Number(order.con_giu_cho)) {
    const ok = await db.transaction(async (conn) => {
      await db.query('SELECT id FROM khoa_hoc WHERE id = ? FOR UPDATE', [order.khoa_hoc_id], conn);
      const c = await loadOpenCourse(order.khoa_hoc_id, conn);
      if (!c || Number(c.cho_da_dung) >= Number(c.so_cho_toi_da)) return false;
      await db.query('UPDATE thanh_toan SET ngay_tao = NOW() WHERE id = ?', [order.id], conn);
      return true;
    });
    if (!ok) flash(req, 'error', 'Khóa học đã đủ học viên, không thể giữ chỗ lại.');
  }
  res.redirect(`/thanh-toan/${order.ma_don}`);
});

/** Trang thanh toán gọi mỗi 5 giây để tự cập nhật trạng thái. */
router.get('/thanh-toan/:maDon/trang-thai', student, async (req, res) => {
  const order = await loadOrder(req.params.maDon, req.user.id);
  if (!order) return res.status(404).json({ error: 'not_found' });
  res.json({ trang_thai: order.trang_thai, dang_ky: order.dk_trang_thai });
});

// ============================================================
// HỌC VIÊN – TÀI KHOẢN
// ============================================================

router.get('/tai-khoan', student, async (req, res) => {
  const profile = await db.one('SELECT * FROM hoc_vien WHERE tai_khoan_id = ?', [req.user.id]);
  res.render('client/account-profile', { title: 'Thông tin cá nhân', v: { ...req.user, ...profile }, errors: {} });
});

router.post('/tai-khoan', student, async (req, res) => {
  const v = {
    ho_ten: h.clean(req.body.ho_ten, 100), sdt: h.clean(req.body.sdt, 15), ngay_sinh: h.orNull(req.body.ngay_sinh),
    gioi_tinh: h.LABELS.gioiTinh[req.body.gioi_tinh] ? req.body.gioi_tinh : null,
    trinh_do: h.clean(req.body.trinh_do, 50), nghe_nghiep: h.clean(req.body.nghe_nghiep, 100),
    noi_hoc_lam: h.clean(req.body.noi_hoc_lam, 150), dia_chi: h.clean(req.body.dia_chi, 255), muc_tieu: h.clean(req.body.muc_tieu, 255),
  };
  const errors = {};
  if (!v.ho_ten) errors.ho_ten = 'Vui lòng nhập họ tên';
  if (!h.isPhone(v.sdt)) errors.sdt = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0';
  if (v.ngay_sinh && (Number.isNaN(Date.parse(v.ngay_sinh)) || new Date(v.ngay_sinh) > new Date())) errors.ngay_sinh = 'Ngày sinh không hợp lệ';
  if (Object.keys(errors).length) {
    return res.status(400).render('client/account-profile', { title: 'Thông tin cá nhân', v: { ...v, email: req.user.email, ngay_tao: req.user.ngay_tao }, errors });
  }
  await db.transaction(async (conn) => {
    await db.query('UPDATE tai_khoan SET ho_ten = ?, sdt = ? WHERE id = ?', [v.ho_ten, v.sdt, req.user.id], conn);
    await db.query(`UPDATE hoc_vien SET ngay_sinh = ?, gioi_tinh = ?, trinh_do = ?, nghe_nghiep = ?, noi_hoc_lam = ?, dia_chi = ?, muc_tieu = ?
      WHERE tai_khoan_id = ?`, [v.ngay_sinh, v.gioi_tinh, h.orNull(v.trinh_do), h.orNull(v.nghe_nghiep), h.orNull(v.noi_hoc_lam),
      h.orNull(v.dia_chi), h.orNull(v.muc_tieu), req.user.id], conn);
  });
  flash(req, 'success', 'Đã lưu thông tin cá nhân.');
  res.redirect('/tai-khoan');
});

router.get('/tai-khoan/khoa-hoc', student, async (req, res) => {
  const items = await db.query(`SELECT dk.*, kh.ten, kh.danh_muc, kh.ngay_khai_giang, kh.trinh_do, gv.ho_ten AS giao_vien_ten,
      (SELECT COUNT(*) FROM bai_giang b WHERE b.khoa_hoc_id = kh.id) AS so_bai,
      (SELECT COUNT(*) FROM tien_do_hoc td JOIN bai_giang b ON b.id = td.bai_giang_id WHERE b.khoa_hoc_id = kh.id AND td.hoc_vien_id = dk.hoc_vien_id) AS da_hoc,
      (SELECT ma_don FROM thanh_toan tt WHERE tt.dang_ky_id = dk.id ORDER BY tt.id DESC LIMIT 1) AS ma_don,
      (SELECT trang_thai FROM thanh_toan tt WHERE tt.dang_ky_id = dk.id ORDER BY tt.id DESC LIMIT 1) AS tt_trang_thai
    FROM dang_ky dk JOIN khoa_hoc kh ON kh.id = dk.khoa_hoc_id LEFT JOIN tai_khoan gv ON gv.id = kh.giao_vien_id
    WHERE dk.hoc_vien_id = ? ORDER BY dk.ngay_dang_ky DESC`, [req.user.id]);
  res.render('client/account-courses', { title: 'Khóa học của tôi', items });
});

router.get('/tai-khoan/thanh-toan', student, async (req, res) => {
  const items = await db.query(`SELECT tt.*, kh.ten AS khoa_hoc_ten, dk.ly_do_tu_choi FROM thanh_toan tt
    JOIN dang_ky dk ON dk.id = tt.dang_ky_id JOIN khoa_hoc kh ON kh.id = dk.khoa_hoc_id
    WHERE dk.hoc_vien_id = ? ORDER BY tt.ngay_tao DESC, tt.id DESC`, [req.user.id]);
  res.render('client/account-payments', { title: 'Lịch sử thanh toán', items });
});

router.get('/tai-khoan/danh-gia', student, async (req, res) => {
  const items = await db.query(`SELECT d.*, kh.ten AS khoa_hoc_ten FROM danh_gia d JOIN khoa_hoc kh ON kh.id = d.khoa_hoc_id
    WHERE d.hoc_vien_id = ? ORDER BY d.ngay_tao DESC`, [req.user.id]);
  res.render('client/account-reviews', { title: 'Đánh giá của tôi', items });
});

router.use('/tai-khoan', student);
mountPassword(router, '/tai-khoan/mat-khau', 'client/account-password');
router.use('/thong-bao', student);
mountNotifications(router, 'client/account-notifications');

// ============================================================
// HỌC ONLINE VÀ ĐÁNH GIÁ
// ============================================================

/** Chỉ học viên có đăng ký "Đã kích hoạt" mới vào học và đánh giá được. */
async function activeEnrollment(req, res, next) {
  const dk = await db.one(`SELECT dk.*, kh.ten, kh.giao_vien_id, gv.ho_ten AS giao_vien_ten FROM dang_ky dk
    JOIN khoa_hoc kh ON kh.id = dk.khoa_hoc_id LEFT JOIN tai_khoan gv ON gv.id = kh.giao_vien_id
    WHERE dk.hoc_vien_id = ? AND dk.khoa_hoc_id = ?`, [req.user.id, req.params.id]);
  if (!dk || dk.trang_thai !== 'DA_KICH_HOAT') {
    flash(req, 'error', 'Chỉ học viên đã kích hoạt khóa học mới vào học và đánh giá được.');
    return res.redirect(dk ? '/tai-khoan/khoa-hoc' : `/khoa-hoc/${req.params.id}`);
  }
  req.enrollment = dk;
  next();
}

function embedUrl(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

router.get('/hoc/:id', student, activeEnrollment, async (req, res) => {
  const lessons = await db.query(`SELECT b.*, (td.hoc_vien_id IS NOT NULL) AS da_hoc FROM bai_giang b
    LEFT JOIN tien_do_hoc td ON td.bai_giang_id = b.id AND td.hoc_vien_id = ?
    WHERE b.khoa_hoc_id = ? ORDER BY b.thu_tu, b.id`, [req.user.id, req.params.id]);
  let current = lessons.find((l) => String(l.id) === String(req.query.bai));
  if (!current) current = lessons.find((l) => !Number(l.da_hoc)) || lessons[0] || null;
  const done = lessons.filter((l) => Number(l.da_hoc)).length;
  res.render('client/learn', {
    title: req.enrollment.ten, dk: req.enrollment, lessons, current, done, embed: current ? embedUrl(current.video_url) : null,
  });
});

router.post('/hoc/:id/hoan-thanh/:baiId', student, activeEnrollment, async (req, res) => {
  const bai = await db.one('SELECT id FROM bai_giang WHERE id = ? AND khoa_hoc_id = ?', [req.params.baiId, req.params.id]);
  if (bai) {
    await db.query('INSERT IGNORE INTO tien_do_hoc (hoc_vien_id, bai_giang_id) VALUES (?, ?)', [req.user.id, bai.id]);
  }
  res.redirect(`/hoc/${req.params.id}?bai=${req.params.baiId}`);
});

router.get('/hoc/:id/danh-gia', student, activeEnrollment, async (req, res) => {
  const review = await db.one('SELECT * FROM danh_gia WHERE hoc_vien_id = ? AND khoa_hoc_id = ?', [req.user.id, req.params.id]);
  res.render('client/review-form', { title: 'Đánh giá khóa học', dk: req.enrollment, review, v: review || {}, errors: {} });
});

router.post('/hoc/:id/danh-gia', student, activeEnrollment, async (req, res) => {
  const soSao = Number(req.body.so_sao);
  const noiDung = String(req.body.noi_dung || '').trim();
  const errors = {};
  if (!(soSao >= 1 && soSao <= 5 && Number.isInteger(soSao))) errors.so_sao = 'Vui lòng chọn số sao';
  if (noiDung.length > 1000) errors.noi_dung = 'Nhận xét tối đa 1000 ký tự';
  const review = await db.one('SELECT * FROM danh_gia WHERE hoc_vien_id = ? AND khoa_hoc_id = ?', [req.user.id, req.params.id]);
  if (Object.keys(errors).length) {
    return res.status(400).render('client/review-form', { title: 'Đánh giá khóa học', dk: req.enrollment, review, v: { so_sao: soSao, noi_dung: noiDung }, errors });
  }
  await db.transaction(async (conn) => {
    if (review) {
      // Sửa đánh giá → quay về "Chờ duyệt" và xóa phản hồi cũ của giáo viên
      await db.query(`UPDATE danh_gia SET so_sao = ?, noi_dung = ?, trang_thai = 'CHO_DUYET', phan_hoi_gv = NULL, ly_do_an = NULL,
        ngay_tao = NOW() WHERE id = ?`, [soSao, h.orNull(noiDung), review.id], conn);
    } else {
      await db.query('INSERT INTO danh_gia (hoc_vien_id, khoa_hoc_id, so_sao, noi_dung) VALUES (?, ?, ?, ?)',
        [req.user.id, req.params.id, soSao, h.orNull(noiDung)], conn);
    }
    await db.notifyAdmin('Đánh giá mới chờ duyệt', `${req.user.ho_ten} – ${req.enrollment.ten} – ${soSao} sao`, '/admin/danh-gia', conn);
  });
  flash(req, 'success', 'Đã gửi đánh giá. Đánh giá sẽ hiển thị sau khi được duyệt.');
  res.redirect(`/hoc/${req.params.id}/danh-gia`);
});

router.post('/hoc/:id/danh-gia/xoa', student, activeEnrollment, async (req, res) => {
  await db.query('DELETE FROM danh_gia WHERE hoc_vien_id = ? AND khoa_hoc_id = ?', [req.user.id, req.params.id]);
  flash(req, 'success', 'Đã xóa đánh giá.');
  res.redirect(`/hoc/${req.params.id}/danh-gia`);
});

module.exports = router;
