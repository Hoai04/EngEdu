// Trang Giáo viên (/teacher): khóa học được phân công, bài giảng, học viên, đánh giá, tư vấn.
const express = require('express');
const db = require('../db');
const h = require('../helpers');
const { requireRole, flash } = require('../auth');
const { mountNotifications, mountPassword } = require('./shared');

const router = express.Router();
router.use(requireRole('GIAO_VIEN'));
router.use(async (req, res, next) => {
  // Số việc cần làm hiển thị trên sidebar
  const c = await db.one(`SELECT
    (SELECT COUNT(*) FROM danh_gia d JOIN khoa_hoc kh ON kh.id = d.khoa_hoc_id
      WHERE kh.giao_vien_id = ? AND d.trang_thai = 'HIEN_THI' AND d.phan_hoi_gv IS NULL) AS danh_gia,
    (SELECT COUNT(*) FROM yeu_cau_tu_van WHERE giao_vien_id = ? AND trang_thai = 'CHUYEN_GV') AS tu_van`, [req.user.id, req.user.id]);
  res.locals.counts = { danhGia: Number(c.danh_gia), tuVan: Number(c.tu_van) };
  res.locals.role = 'teacher';
  next();
});

/** Khóa học phải thuộc giáo viên đang đăng nhập (bước kiemTraPhanCong). */
async function ownCourse(req, res, next) {
  const course = await db.one(`SELECT ${h.COURSE_COLUMNS} ${h.COURSE_FROM} WHERE kh.id = ? AND kh.giao_vien_id = ?`,
    [req.params.id, req.user.id]);
  if (!course) return res.status(404).render('client/404', { title: 'Không tìm thấy trang' });
  req.course = course;
  next();
}

router.get('/', async (req, res) => {
  const stats = await db.one(`SELECT
    (SELECT COUNT(*) FROM khoa_hoc WHERE giao_vien_id = ?) AS khoa_hoc,
    (SELECT COUNT(DISTINCT dk.hoc_vien_id) FROM dang_ky dk JOIN khoa_hoc kh ON kh.id = dk.khoa_hoc_id
      WHERE kh.giao_vien_id = ? AND dk.trang_thai = 'DA_KICH_HOAT') AS hoc_vien,
    (SELECT ROUND(AVG(d.so_sao), 1) FROM danh_gia d JOIN khoa_hoc kh ON kh.id = d.khoa_hoc_id
      WHERE kh.giao_vien_id = ? AND d.trang_thai = 'HIEN_THI') AS diem_tb`, [req.user.id, req.user.id, req.user.id]);
  const newStudents = await db.query(`SELECT dk.*, tk.ho_ten, kh.ten AS khoa_hoc_ten FROM dang_ky dk
    JOIN khoa_hoc kh ON kh.id = dk.khoa_hoc_id JOIN tai_khoan tk ON tk.id = dk.hoc_vien_id
    WHERE kh.giao_vien_id = ? AND dk.trang_thai = 'DA_KICH_HOAT' ORDER BY dk.ngay_duyet DESC LIMIT 8`, [req.user.id]);
  res.render('teacher/dashboard', { title: 'Tổng quan', stats, newStudents });
});

// ---------- Khóa học & bài giảng
router.get('/khoa-hoc', async (req, res) => {
  const courses = await db.query(`SELECT ${h.COURSE_COLUMNS},
      (SELECT COUNT(*) FROM dang_ky x WHERE x.khoa_hoc_id = kh.id AND x.trang_thai = 'DA_KICH_HOAT') AS so_hoc_vien
    ${h.COURSE_FROM} WHERE kh.giao_vien_id = ? ORDER BY FIELD(kh.trang_thai, 'CAN_SUA', 'NHAP', 'CHO_DUYET', 'MO_DANG_KY', 'AN'), kh.ngay_khai_giang`, [req.user.id]);
  res.render('teacher/courses', { title: 'Khóa học của tôi', courses });
});

router.get('/khoa-hoc/:id', ownCourse, async (req, res) => {
  const tab = req.query.tab === 'hoc-vien' ? 'hoc-vien' : 'bai-giang';
  const lessons = await db.query('SELECT * FROM bai_giang WHERE khoa_hoc_id = ? ORDER BY thu_tu, id', [req.course.id]);
  const students = await db.query(`SELECT dk.*, tk.ho_ten, tk.email, tk.sdt,
      (SELECT COUNT(*) FROM tien_do_hoc td JOIN bai_giang b ON b.id = td.bai_giang_id WHERE b.khoa_hoc_id = dk.khoa_hoc_id AND td.hoc_vien_id = dk.hoc_vien_id) AS da_hoc
    FROM dang_ky dk JOIN tai_khoan tk ON tk.id = dk.hoc_vien_id
    WHERE dk.khoa_hoc_id = ? AND dk.trang_thai = 'DA_KICH_HOAT' ORDER BY tk.ho_ten`, [req.course.id]);
  const editing = lessons.find((l) => String(l.id) === String(req.query.sua)) || null;
  const nextOrder = lessons.reduce((m, l) => Math.max(m, l.thu_tu), 0) + 1;
  res.render('teacher/course-detail', {
    title: req.course.ten, course: req.course, tab, lessons, students, editing,
    v: editing || { chuong: lessons.length ? lessons[lessons.length - 1].chuong : '', thu_tu: nextOrder }, errors: {},
  });
});

function lessonInput(body) {
  const v = {
    chuong: h.clean(body.chuong, 100), tieu_de: h.clean(body.tieu_de, 200),
    video_url: h.clean(body.video_url, 255), tai_lieu_url: h.clean(body.tai_lieu_url, 255), thu_tu: Number.parseInt(body.thu_tu, 10) || 0,
  };
  const errors = {};
  if (!v.tieu_de) errors.tieu_de = 'Vui lòng nhập tiêu đề bài';
  if (v.video_url && !/^https?:\/\//i.test(v.video_url)) errors.video_url = 'Đường dẫn phải bắt đầu bằng http:// hoặc https://';
  if (v.tai_lieu_url && !/^https?:\/\//i.test(v.tai_lieu_url)) errors.tai_lieu_url = 'Đường dẫn phải bắt đầu bằng http:// hoặc https://';
  return { v, errors };
}

async function rerenderLessons(req, res, v, errors, editing) {
  const lessons = await db.query('SELECT * FROM bai_giang WHERE khoa_hoc_id = ? ORDER BY thu_tu, id', [req.course.id]);
  res.status(400).render('teacher/course-detail', {
    title: req.course.ten, course: req.course, tab: 'bai-giang', lessons, students: [], editing, v, errors,
  });
}

router.post('/khoa-hoc/:id/bai-giang', ownCourse, async (req, res) => {
  const { v, errors } = lessonInput(req.body);
  if (Object.keys(errors).length) return rerenderLessons(req, res, v, errors, null);
  await db.query('INSERT INTO bai_giang (khoa_hoc_id, chuong, tieu_de, video_url, tai_lieu_url, thu_tu) VALUES (?, ?, ?, ?, ?, ?)',
    [req.course.id, h.orNull(v.chuong), v.tieu_de, h.orNull(v.video_url), h.orNull(v.tai_lieu_url), v.thu_tu]);
  flash(req, 'success', 'Đã thêm bài giảng.');
  res.redirect(`/teacher/khoa-hoc/${req.course.id}`);
});

router.post('/khoa-hoc/:id/bai-giang/:baiId', ownCourse, async (req, res) => {
  const bai = await db.one('SELECT * FROM bai_giang WHERE id = ? AND khoa_hoc_id = ?', [req.params.baiId, req.course.id]);
  if (!bai) return res.status(404).render('client/404', { title: 'Không tìm thấy trang' });
  const { v, errors } = lessonInput(req.body);
  if (Object.keys(errors).length) return rerenderLessons(req, res, { ...v, id: bai.id }, errors, bai);
  await db.query('UPDATE bai_giang SET chuong = ?, tieu_de = ?, video_url = ?, tai_lieu_url = ?, thu_tu = ? WHERE id = ?',
    [h.orNull(v.chuong), v.tieu_de, h.orNull(v.video_url), h.orNull(v.tai_lieu_url), v.thu_tu, bai.id]);
  flash(req, 'success', 'Đã cập nhật bài giảng.');
  res.redirect(`/teacher/khoa-hoc/${req.course.id}`);
});

router.post('/khoa-hoc/:id/bai-giang/:baiId/xoa', ownCourse, async (req, res) => {
  await db.query('DELETE FROM bai_giang WHERE id = ? AND khoa_hoc_id = ?', [req.params.baiId, req.course.id]);
  flash(req, 'success', 'Đã xóa bài giảng.');
  res.redirect(`/teacher/khoa-hoc/${req.course.id}`);
});

router.post('/khoa-hoc/:id/gui-duyet', ownCourse, async (req, res) => {
  const c = req.course;
  if (!['NHAP', 'CAN_SUA'].includes(c.trang_thai)) {
    flash(req, 'error', 'Chỉ gửi duyệt khi khóa học ở trạng thái Nháp hoặc Cần chỉnh sửa.');
  } else if (Number(c.so_bai) < 1) {
    flash(req, 'error', 'Khóa học cần ít nhất 1 bài giảng trước khi gửi duyệt.');
  } else {
    await db.transaction(async (conn) => {
      await db.query("UPDATE khoa_hoc SET trang_thai = 'CHO_DUYET' WHERE id = ?", [c.id], conn);
      await db.notifyAdmin('Khóa học chờ duyệt', `${c.ten} – ${req.user.ho_ten}`, `/admin/khoa-hoc/${c.id}`, conn);
    });
    flash(req, 'success', 'Đã gửi duyệt nội dung khóa học.');
  }
  res.redirect(`/teacher/khoa-hoc/${c.id}`);
});

// ---------- Học viên (chỉ học viên đã kích hoạt trong lớp của mình)
router.get('/hoc-vien', async (req, res) => {
  const q = h.clean(req.query.q, 100);
  const params = [req.user.id];
  let extra = '';
  if (q) { extra = ' AND (tk.ho_ten LIKE ? OR tk.email LIKE ? OR tk.sdt LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const students = await db.query(`SELECT tk.id, tk.ho_ten, tk.email, tk.sdt, hv.trinh_do,
      GROUP_CONCAT(kh.ten, ', ') AS khoa_hoc, MAX(dk.ngay_duyet) AS ngay_vao
    FROM dang_ky dk JOIN khoa_hoc kh ON kh.id = dk.khoa_hoc_id JOIN tai_khoan tk ON tk.id = dk.hoc_vien_id
    JOIN hoc_vien hv ON hv.tai_khoan_id = tk.id
    WHERE kh.giao_vien_id = ? AND dk.trang_thai = 'DA_KICH_HOAT'${extra}
    GROUP BY tk.id, tk.ho_ten, tk.email, tk.sdt, hv.trinh_do ORDER BY tk.ho_ten`, params);
  res.render('teacher/students', { title: 'Học viên', students, q });
});

router.get('/hoc-vien/:id', async (req, res) => {
  // Bước 1: học viên có học lớp của giáo viên? Không → 404 (không tiết lộ sự tồn tại)
  const enrollments = await db.query(`SELECT dk.id, dk.khoa_hoc_id, dk.trinh_do_hien_tai, dk.muc_tieu, dk.ghi_chu_hv, dk.ghi_chu_admin, dk.ngay_duyet,
      kh.ten AS khoa_hoc_ten,
      (SELECT COUNT(*) FROM bai_giang b WHERE b.khoa_hoc_id = kh.id) AS so_bai,
      (SELECT COUNT(*) FROM tien_do_hoc td JOIN bai_giang b ON b.id = td.bai_giang_id WHERE b.khoa_hoc_id = kh.id AND td.hoc_vien_id = dk.hoc_vien_id) AS da_hoc
    FROM dang_ky dk JOIN khoa_hoc kh ON kh.id = dk.khoa_hoc_id
    WHERE dk.hoc_vien_id = ? AND kh.giao_vien_id = ? AND dk.trang_thai = 'DA_KICH_HOAT' ORDER BY dk.ngay_duyet DESC`, [req.params.id, req.user.id]);
  if (!enrollments.length) return res.status(404).render('client/404', { title: 'Không tìm thấy trang' });
  // Chỉ lấy thông tin được phép: KHÔNG lấy địa chỉ, KHÔNG lấy thông tin thanh toán
  const student = await db.one(`SELECT tk.id, tk.ho_ten, tk.email, tk.sdt, hv.ngay_sinh, hv.gioi_tinh, hv.trinh_do, hv.nghe_nghiep, hv.noi_hoc_lam, hv.muc_tieu
    FROM tai_khoan tk JOIN hoc_vien hv ON hv.tai_khoan_id = tk.id WHERE tk.id = ?`, [req.params.id]);
  const reviews = await db.query(`SELECT khoa_hoc_id, so_sao, noi_dung, trang_thai FROM danh_gia WHERE hoc_vien_id = ? AND khoa_hoc_id IN (?)`,
    [student.id, enrollments.map((e) => e.khoa_hoc_id)]);
  res.render('teacher/student-detail', { title: student.ho_ten, student, enrollments, reviews });
});

// ---------- Đánh giá
router.get('/danh-gia', async (req, res) => {
  const tab = req.query.tab === 'da' ? 'da' : 'chua';
  const reviews = await db.query(`SELECT d.*, tk.ho_ten, kh.ten AS khoa_hoc_ten FROM danh_gia d
    JOIN khoa_hoc kh ON kh.id = d.khoa_hoc_id JOIN tai_khoan tk ON tk.id = d.hoc_vien_id
    WHERE kh.giao_vien_id = ? AND d.trang_thai = 'HIEN_THI' AND d.phan_hoi_gv IS ${tab === 'da' ? 'NOT ' : ''}NULL
    ORDER BY d.ngay_tao DESC`, [req.user.id]);
  res.render('teacher/reviews', { title: 'Đánh giá', reviews, tab });
});

router.post('/danh-gia/:id/phan-hoi', async (req, res) => {
  const text = h.clean(req.body.phan_hoi_gv, 1000);
  // Kiểm tra đánh giá thuộc khóa học của giáo viên (không phản hồi lớp khác)
  const d = await db.one(`SELECT d.*, kh.ten FROM danh_gia d JOIN khoa_hoc kh ON kh.id = d.khoa_hoc_id
    WHERE d.id = ? AND kh.giao_vien_id = ? AND d.trang_thai = 'HIEN_THI'`, [req.params.id, req.user.id]);
  if (!d) return res.status(404).render('client/404', { title: 'Không tìm thấy trang' });
  if (!text) {
    flash(req, 'error', 'Vui lòng nhập nội dung phản hồi.');
  } else {
    await db.transaction(async (conn) => {
      await db.query('UPDATE danh_gia SET phan_hoi_gv = ? WHERE id = ?', [text, d.id], conn);
      await db.notify(d.hoc_vien_id, 'Giáo viên đã trả lời đánh giá', d.ten, `/khoa-hoc/${d.khoa_hoc_id}?tab=danh-gia`, conn);
    });
    flash(req, 'success', 'Đã lưu phản hồi.');
  }
  res.redirect(`/teacher/danh-gia${d.phan_hoi_gv ? '?tab=da' : ''}`);
});

// ---------- Đánh giá trình độ (yêu cầu tư vấn được Admin chuyển)
router.get('/tu-van', async (req, res) => {
  const items = await db.query(`SELECT y.*, kh.ten AS khoa_hoc_ten FROM yeu_cau_tu_van y LEFT JOIN khoa_hoc kh ON kh.id = y.khoa_hoc_id
    WHERE y.giao_vien_id = ? ORDER BY FIELD(y.trang_thai, 'CHUYEN_GV', 'DA_DE_XUAT', 'HOAN_TAT'), y.ngay_tao DESC`, [req.user.id]);
  const courses = await db.query("SELECT id, ten FROM khoa_hoc WHERE trang_thai = 'MO_DANG_KY' ORDER BY ten");
  res.render('teacher/consults', { title: 'Đánh giá trình độ', items, courses });
});

router.post('/tu-van/:id/de-xuat', async (req, res) => {
  const text = h.clean(req.body.ket_qua_gv, 2000);
  const y = await db.one("SELECT * FROM yeu_cau_tu_van WHERE id = ? AND giao_vien_id = ? AND trang_thai = 'CHUYEN_GV'", [req.params.id, req.user.id]);
  if (!y) return res.status(404).render('client/404', { title: 'Không tìm thấy trang' });
  if (!text) {
    flash(req, 'error', 'Vui lòng nhập nhận xét trình độ và khóa học đề xuất.');
    return res.redirect('/teacher/tu-van');
  }
  await db.transaction(async (conn) => {
    await db.query("UPDATE yeu_cau_tu_van SET ket_qua_gv = ?, trang_thai = 'DA_DE_XUAT' WHERE id = ?", [text, y.id], conn);
    await db.notifyAdmin('Giáo viên đã đề xuất khóa học', `${y.ho_ten} – ${req.user.ho_ten}`, '/admin/tu-van', conn);
  });
  flash(req, 'success', 'Đã gửi đề xuất cho Admin.');
  res.redirect('/teacher/tu-van');
});

// ---------- Hồ sơ cá nhân (giáo viên chỉ được sửa SĐT và phần giới thiệu)
router.get('/ho-so', async (req, res) => {
  const profile = await db.one('SELECT * FROM giao_vien WHERE tai_khoan_id = ?', [req.user.id]);
  res.render('teacher/profile', { title: 'Hồ sơ', profile, v: { sdt: req.user.sdt, gioi_thieu: profile.gioi_thieu }, errors: {} });
});

router.post('/ho-so', async (req, res) => {
  const v = { sdt: h.clean(req.body.sdt, 15), gioi_thieu: h.clean(req.body.gioi_thieu, 3000) };
  const errors = {};
  if (!h.isPhone(v.sdt)) errors.sdt = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0';
  if (Object.keys(errors).length) {
    const profile = await db.one('SELECT * FROM giao_vien WHERE tai_khoan_id = ?', [req.user.id]);
    return res.status(400).render('teacher/profile', { title: 'Hồ sơ', profile, v, errors });
  }
  await db.transaction(async (conn) => {
    await db.query('UPDATE tai_khoan SET sdt = ? WHERE id = ?', [v.sdt, req.user.id], conn);
    await db.query('UPDATE giao_vien SET gioi_thieu = ? WHERE tai_khoan_id = ?', [h.orNull(v.gioi_thieu), req.user.id], conn);
  });
  flash(req, 'success', 'Đã cập nhật hồ sơ.');
  res.redirect('/teacher/ho-so');
});

mountPassword(router, '/mat-khau', 'teacher/password');
mountNotifications(router, 'teacher/notifications', '/teacher');

module.exports = router;
