// Kiểm thử tự động: gửi yêu cầu HTTP tới máy chủ đang chạy, dùng tài khoản dữ liệu mẫu.
// Cách chạy:  npm run seed  →  npm start  →  (cửa sổ khác) npm test
// Lưu ý: bộ kiểm thử TẠO thêm dữ liệu (học viên, khóa học, đơn...). Chạy lại npm run seed để làm sạch.
const db = require('../db');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PW = '12345678';
const results = [];
let failures = 0;

class Client {
  constructor(name) { this.name = name; this.cookies = {}; }
  cookieHeader() { return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; '); }
  store(res) {
    for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      this.cookies[pair.slice(0, i)] = pair.slice(i + 1);
    }
  }
  async req(method, path, form) {
    const res = await fetch(BASE + path, {
      method, redirect: 'manual',
      headers: { cookie: this.cookieHeader(), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    this.store(res);
    const text = await res.text();
    return { status: res.status, location: res.headers.get('location'), text };
  }
  get(p) { return this.req('GET', p); }
  post(p, f = {}) { return this.req('POST', p, f); }
  async follow(p) {
    let r = await this.get(p);
    for (let i = 0; i < 5 && r.location; i += 1) r = await this.get(r.location);
    return r;
  }
  async login(email, password = PW) {
    return this.post('/dang-nhap', { email, mat_khau: password });
  }
}

function check(group, name, ok, detail = '') {
  results.push({ group, name, ok: !!ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✓' : '  ✗'} [${group}] ${name}${!ok && detail ? ` — ${detail}` : ''}`);
}

const one = (sql, p) => db.one(sql, p);

async function main() {
  const ids = {
    admin: (await one("SELECT id FROM tai_khoan WHERE vai_tro = 'ADMIN'")).id,
    lan: (await one("SELECT id FROM tai_khoan WHERE email = 'lan.nguyen@engedu.vn'")).id,
    minh: (await one("SELECT id FROM tai_khoan WHERE email = 'minh.tran@engedu.vn'")).id,
    an: (await one("SELECT id FROM tai_khoan WHERE email = 'an.le@example.com'")).id,
    binh: (await one("SELECT id FROM tai_khoan WHERE email = 'binh.pham@example.com'")).id,
  };
  const ieltsF = (await one("SELECT id FROM khoa_hoc WHERE ten = 'IELTS Foundation 5.0+'")).id;
  const toeic450 = (await one("SELECT id FROM khoa_hoc WHERE ten = 'TOEIC 450+ cho người mất gốc'")).id;
  const toeic650 = (await one("SELECT id FROM khoa_hoc WHERE ten = 'TOEIC 650+ cấp tốc'")).id;
  const giaoTiep = (await one("SELECT id FROM khoa_hoc WHERE ten = 'Giao tiếp cho người mất gốc'")).id;
  const starterKid = (await one("SELECT id FROM khoa_hoc WHERE ten = 'Cambridge Starters cho bé'")).id;
  const draft = (await one("SELECT id FROM khoa_hoc WHERE trang_thai = 'NHAP' LIMIT 1")).id;
  const stamp = Date.now().toString().slice(-6);

  const guest = new Client('guest');
  const student = new Client('student');
  const teacher = new Client('teacher');
  const admin = new Client('admin');

  // ------------------------------------------------------------ 1. Đăng nhập & phân quyền
  console.log('\n1. Đăng nhập và phân quyền');
  let r = await student.login('an.le@example.com');
  check('Đăng nhập', 'Học viên về trang Client', r.status === 302 && r.location === '/', r.location);
  r = await teacher.login('lan.nguyen@engedu.vn');
  check('Đăng nhập', 'Giáo viên chuyển đến /teacher', r.location === '/teacher', r.location);
  r = await admin.login('admin@engedu.vn', process.env.ADMIN_PASSWORD || 'Admin@123');
  check('Đăng nhập', 'Admin chuyển đến /admin', r.location === '/admin', r.location);
  r = await guest.login('an.le@example.com', 'sai-mat-khau');
  check('Đăng nhập', 'Sai mật khẩu báo lỗi', r.status === 400 && r.text.includes('Email hoặc mật khẩu không đúng'));
  r = await guest.get('/admin');
  check('Phân quyền', 'Khách vào /admin bị chuyển về đăng nhập', r.location === '/dang-nhap');
  r = await student.get('/admin/thanh-toan');
  check('Phân quyền', 'Học viên vào /admin bị chặn', r.status === 302 && r.location === '/');
  r = await student.get('/teacher');
  check('Phân quyền', 'Học viên vào /teacher bị chặn', r.status === 302 && r.location === '/');
  r = await teacher.get('/admin');
  check('Phân quyền', 'Giáo viên vào /admin bị chặn', r.location === '/teacher');
  r = await admin.get('/tai-khoan');
  check('Phân quyền', 'Admin vào khu vực học viên bị chặn', r.location === '/admin');
  r = await teacher.get(`/teacher/hoc-vien/${ids.binh}`);
  check('Phân quyền', 'Giáo viên xem học viên ngoài lớp → 404', r.status === 404);
  const minhCourse = (await one('SELECT id FROM khoa_hoc WHERE giao_vien_id = ? LIMIT 1', [ids.minh])).id;
  r = await teacher.get(`/teacher/khoa-hoc/${minhCourse}`);
  check('Phân quyền', 'Giáo viên mở khóa học của người khác → 404', r.status === 404);
  // Đăng nhập lại về trang đang xem dở
  const returning = new Client('returning');
  await returning.get(`/dang-ky-hoc/${toeic450}`);
  r = await returning.login('an.le@example.com');
  check('Đăng nhập', 'Học viên quay lại trang đang xem dở', r.location === `/dang-ky-hoc/${toeic450}`, r.location);
  // Tạm khóa 15 phút sau 5 lần sai
  const lockEmail = `khoa${stamp}@example.com`;
  const bad = new Client('bad');
  for (let i = 0; i < 5; i += 1) r = await bad.login(lockEmail, 'sai');
  check('Bảo mật', 'Sai 5 lần → tạm khóa 15 phút', r.text.includes('15 phút'));

  // ------------------------------------------------------------ 2. Tải trang
  console.log('\n2. Tải trang của từng vai trò');
  const pages = {
    guest: ['/', '/khoa-hoc', '/khoa-hoc?danh_muc=IELTS', '/khoa-hoc?q=TOEIC&sap_xep=gia_tang', `/khoa-hoc/${ieltsF}`, `/khoa-hoc/${ieltsF}?tab=noi-dung`,
      `/khoa-hoc/${ieltsF}?tab=giao-vien`, `/khoa-hoc/${ieltsF}?tab=danh-gia`, '/giao-vien', `/giao-vien/${ids.lan}`, '/danh-gia', '/danh-gia?sao=5', '/gioi-thieu', '/hoi-dap',
      '/tu-van', '/dang-ky', '/dang-nhap'],
    student: ['/', '/tai-khoan', '/tai-khoan/khoa-hoc', '/tai-khoan/thanh-toan', '/tai-khoan/danh-gia', '/tai-khoan/mat-khau', '/thong-bao',
      `/hoc/${ieltsF}`, `/hoc/${ieltsF}/danh-gia`, `/dang-ky-hoc/${toeic450}`, `/khoa-hoc/${ieltsF}`],
    teacher: ['/teacher', '/teacher/khoa-hoc', `/teacher/khoa-hoc/${ieltsF}`, `/teacher/khoa-hoc/${ieltsF}?tab=hoc-vien`, '/teacher/hoc-vien', `/teacher/hoc-vien/${ids.an}`,
      '/teacher/danh-gia', '/teacher/danh-gia?tab=da', '/teacher/tu-van', '/teacher/ho-so', '/teacher/mat-khau', '/teacher/thong-bao'],
    admin: ['/admin', '/admin/thong-ke', '/admin/thanh-toan', '/admin/thanh-toan?tab=da-thanh-toan', '/admin/thanh-toan?tab=tu-choi', '/admin/danh-gia',
      '/admin/danh-gia?tab=hien-thi', '/admin/danh-gia?tab=bi-an', '/admin/tu-van', '/admin/tu-van?tab=hoan-tat', '/admin/khoa-hoc', '/admin/khoa-hoc?tab=nhap',
      '/admin/khoa-hoc/them', `/admin/khoa-hoc/${ieltsF}`, `/admin/khoa-hoc/${ieltsF}?tab=chinh-sua`, `/admin/khoa-hoc/${ieltsF}?tab=hoc-vien`, '/admin/giao-vien',
      '/admin/giao-vien/them', `/admin/giao-vien/${ids.lan}`, `/admin/giao-vien/${ids.lan}?tab=chinh-sua`, '/admin/hoc-vien', `/admin/hoc-vien/${ids.an}`,
      `/admin/hoc-vien/${ids.an}?tab=khoa-hoc`, `/admin/hoc-vien/${ids.an}?tab=thanh-toan`, `/admin/hoc-vien/${ids.an}?tab=danh-gia`, '/admin/thong-bao'],
  };
  const clients = { guest, student, teacher, admin };
  let total = 0;
  let okCount = 0;
  for (const [role, list] of Object.entries(pages)) {
    for (const p of list) {
      total += 1;
      r = await clients[role].get(p);
      if (r.status === 200) okCount += 1; else console.log(`    ${role} ${p} → ${r.status} ${r.location || ''}`);
    }
  }
  check('Tải trang', `${okCount}/${total} trang trả về 200`, okCount === total);
  r = await guest.get(`/khoa-hoc/${draft}`);
  check('Tải trang', 'Khóa học Nháp không hiện trên Client', r.status === 404);

  // ------------------------------------------------------------ 3. Đăng ký tài khoản
  console.log('\n3. Đăng ký tài khoản học viên');
  const newEmail = `hv${stamp}@example.com`;
  const newbie = new Client('newbie');
  r = await newbie.post('/dang-ky', { ho_ten: 'Học Viên Mới', email: newEmail, sdt: '0987654321', mat_khau: PW, nhap_lai: PW, vai_tro: 'ADMIN' });
  check('Đăng ký', 'Tạo tài khoản và đăng nhập ngay', r.status === 302 && r.location === '/tai-khoan', `${r.status} ${r.location}`);
  const nb = await one('SELECT t.id, t.vai_tro, h.tai_khoan_id AS hv FROM tai_khoan t LEFT JOIN hoc_vien h ON h.tai_khoan_id = t.id WHERE t.email = ?', [newEmail]);
  check('Đăng ký', 'Tham số vai_tro=ADMIN bị bỏ qua (luôn là HOC_VIEN, có hồ sơ)', nb && nb.vai_tro === 'HOC_VIEN' && nb.hv);
  r = await new Client('dup').post('/dang-ky', { ho_ten: 'Trùng', email: newEmail, sdt: '0987654321', mat_khau: PW, nhap_lai: PW });
  check('Đăng ký', 'Email trùng bị chặn', r.status === 400 && r.text.includes('Email đã được sử dụng'));
  r = await new Client('bad2').post('/dang-ky', { ho_ten: '', email: 'x', sdt: '12', mat_khau: '1', nhap_lai: '2' });
  check('Đăng ký', 'Dữ liệu sai báo lỗi dưới từng trường', r.status === 400 && r.text.includes('Email không hợp lệ') && r.text.includes('Số điện thoại gồm 10 chữ số'));
  r = await newbie.post('/tai-khoan', { ho_ten: 'Học Viên Mới', sdt: '0987654321', ngay_sinh: '2004-01-01', gioi_tinh: 'NU', trinh_do: 'Cơ bản', nghe_nghiep: 'Sinh viên', noi_hoc_lam: 'ĐH Test', dia_chi: 'Số 9 Phố Bí Mật', muc_tieu: 'TOEIC 450' });
  check('Hồ sơ', 'Học viên cập nhật thông tin cá nhân', r.location === '/tai-khoan');

  // ------------------------------------------------------------ 4. Đăng ký khóa học – thanh toán
  console.log('\n4. Đăng ký khóa học và thanh toán');
  r = await newbie.post(`/dang-ky-hoc/${toeic450}`, { trinh_do_hien_tai: '', muc_tieu: '' });
  check('Đăng ký học', 'Thiếu trình độ/mục tiêu báo lỗi', r.status === 400);
  r = await newbie.post(`/dang-ky-hoc/${toeic450}`, { trinh_do_hien_tai: 'Cơ bản', muc_tieu: 'TOEIC 450 ra trường', ghi_chu_hv: 'Em yếu nghe' });
  const maDon = (r.location || '').split('/').pop();
  check('Đăng ký học', 'Tạo DANG_KY + THANH_TOAN, chuyển đến trang QR', /^\/thanh-toan\/KH\d+$/.test(r.location || ''), r.location);
  r = await newbie.get(`/thanh-toan/${maDon}`);
  check('Thanh toán', 'Trang QR VietQR có số tiền và mã đơn', r.status === 200 && r.text.includes('img.vietqr.io') && r.text.includes(maDon));
  r = await newbie.post(`/dang-ky-hoc/${toeic450}`, { trinh_do_hien_tai: 'Cơ bản', muc_tieu: 'x' });
  check('Đăng ký học', 'Đã có đơn chờ → chuyển về đơn cũ', r.location === `/thanh-toan/${maDon}`);
  r = await student.get(`/thanh-toan/${maDon}`);
  check('Bảo mật', 'Học viên khác không xem được đơn', r.status === 404);
  await newbie.post(`/thanh-toan/${maDon}/da-chuyen-khoan`);
  let pay = await one('SELECT * FROM thanh_toan WHERE ma_don = ?', [maDon]);
  check('Thanh toán', '"Tôi đã chuyển khoản" → Chờ xác nhận', pay.trang_thai === 'CHO_XAC_NHAN');
  r = await newbie.get(`/thanh-toan/${maDon}/trang-thai`);
  check('Thanh toán', 'API kiểm tra trạng thái mỗi 5 giây', JSON.parse(r.text).trang_thai === 'CHO_XAC_NHAN');
  r = await newbie.get(`/hoc/${toeic450}`);
  check('Thanh toán', 'Chưa kích hoạt thì chưa vào học được', r.status === 302);
  const usedGd = (await one("SELECT ma_gd_ngan_hang FROM thanh_toan WHERE ma_gd_ngan_hang IS NOT NULL LIMIT 1")).ma_gd_ngan_hang;
  r = await admin.post(`/admin/thanh-toan/${pay.id}/xac-nhan`, { ma_gd_ngan_hang: usedGd, ghi_chu_admin: 'x' });
  pay = await one('SELECT * FROM thanh_toan WHERE id = ?', [pay.id]);
  check('Thanh toán', 'Mã giao dịch đã dùng cho đơn khác bị chặn', pay.trang_thai === 'CHO_XAC_NHAN');
  r = await admin.post(`/admin/thanh-toan/${pay.id}/xac-nhan`, { ma_gd_ngan_hang: `FT${stamp}001`, ghi_chu_admin: 'Học viên cần luyện nghe nhiều' });
  pay = await one('SELECT * FROM thanh_toan WHERE id = ?', [pay.id]);
  const dk = await one('SELECT * FROM dang_ky WHERE id = ?', [pay.dang_ky_id]);
  check('Thanh toán', 'Admin xác nhận → Đã thanh toán + Đã kích hoạt (một giao dịch)', pay.trang_thai === 'DA_THANH_TOAN' && dk.trang_thai === 'DA_KICH_HOAT' && dk.nguoi_duyet === ids.admin);
  r = await newbie.get(`/hoc/${toeic450}`);
  check('Thanh toán', 'Học viên vào học được', r.status === 200);
  r = await newbie.get(`/thanh-toan/${maDon}`);
  check('Thanh toán', 'Trang thanh toán hiển thị "Thanh toán thành công"', r.text.includes('Thanh toán thành công'));
  const firstLesson = (await one('SELECT id FROM bai_giang WHERE khoa_hoc_id = ? ORDER BY thu_tu LIMIT 1', [toeic450])).id;
  await newbie.post(`/hoc/${toeic450}/hoan-thanh/${firstLesson}`);
  check('Học online', 'Đánh dấu hoàn thành bài lưu tiến độ', !!(await one('SELECT 1 AS x FROM tien_do_hoc WHERE hoc_vien_id = ? AND bai_giang_id = ?', [nb.id, firstLesson])));

  // ------------------------------------------------------------ 5. Liên tác nhân
  console.log('\n5. Liên tác nhân Học viên → Admin → Giáo viên');
  const minh = new Client('minh');
  await minh.login('minh.tran@engedu.vn');
  r = await minh.get('/teacher');
  check('Liên tác nhân', 'Giáo viên thấy học viên mới trên Dashboard', r.text.includes('Học Viên Mới'));
  r = await minh.get(`/teacher/hoc-vien/${nb.id}`);
  check('Liên tác nhân', 'Giáo viên thấy ghi chú của Admin và của học viên', r.text.includes('Học viên cần luyện nghe nhiều') && r.text.includes('Em yếu nghe'));
  const tb = await one("SELECT COUNT(*) AS n FROM thong_bao WHERE tai_khoan_id = ? AND tieu_de = 'Có học viên mới'", [ids.minh]);
  check('Liên tác nhân', 'Giáo viên nhận thông báo học viên mới', Number(tb.n) >= 1);
  const tbHv = await one("SELECT COUNT(*) AS n FROM thong_bao WHERE tai_khoan_id = ? AND tieu_de = 'Khóa học đã được kích hoạt'", [nb.id]);
  check('Liên tác nhân', 'Học viên nhận thông báo kích hoạt', Number(tbHv.n) === 1);

  // ------------------------------------------------------------ 6. Bảo vệ thông tin
  console.log('\n6. Bảo vệ thông tin học viên');
  check('Bảo vệ thông tin', 'Giáo viên không thấy địa chỉ học viên', !r.text.includes('Số 9 Phố Bí Mật'));
  check('Bảo vệ thông tin', 'Giáo viên không thấy mã đơn / số tiền', !r.text.includes(maDon) && !r.text.includes('1.500.000'));
  r = await admin.get(`/admin/hoc-vien/${nb.id}`);
  check('Bảo vệ thông tin', 'Admin thấy địa chỉ học viên', r.text.includes('Số 9 Phố Bí Mật'));

  // ------------------------------------------------------------ 7. Từ chối thanh toán → đăng ký lại
  console.log('\n7. Từ chối thanh toán và đăng ký lại');
  r = await newbie.post(`/dang-ky-hoc/${giaoTiep}`, { trinh_do_hien_tai: 'Cơ bản', muc_tieu: 'Giao tiếp' });
  const maDon2 = r.location.split('/').pop();
  const pay2 = await one('SELECT * FROM thanh_toan WHERE ma_don = ?', [maDon2]);
  r = await admin.post(`/admin/thanh-toan/${pay2.id}/tu-choi`, { ly_do: 'Không nhận được giao dịch' });
  const dk2 = await one('SELECT * FROM dang_ky WHERE id = ?', [pay2.dang_ky_id]);
  check('Từ chối', 'Admin từ chối kèm lý do → Bị từ chối', dk2.trang_thai === 'BI_TU_CHOI' && dk2.ly_do_tu_choi === 'Không nhận được giao dịch');
  r = await newbie.post(`/dang-ky-hoc/${giaoTiep}`, { trinh_do_hien_tai: 'Cơ bản', muc_tieu: 'Giao tiếp lần 2' });
  const dk2b = await one('SELECT * FROM dang_ky WHERE id = ?', [pay2.dang_ky_id]);
  check('Từ chối', 'Học viên đăng ký lại → Chờ thanh toán, đơn mới', dk2b.trang_thai === 'CHO_THANH_TOAN' && r.location !== `/thanh-toan/${maDon2}`);

  // ------------------------------------------------------------ 8. Hết chỗ
  console.log('\n8. Sĩ số');
  const full = await one(`SELECT kh.so_cho_toi_da, (SELECT COUNT(*) FROM dang_ky d WHERE d.khoa_hoc_id = kh.id) AS n FROM khoa_hoc kh WHERE kh.id = ?`, [toeic650]);
  r = await newbie.post(`/dang-ky-hoc/${toeic650}`, { trinh_do_hien_tai: 'Trung cấp', muc_tieu: 'TOEIC 650' });
  r = await student.post(`/dang-ky-hoc/${toeic650}`, { trinh_do_hien_tai: 'Trung cấp', muc_tieu: 'TOEIC 650' });
  const after = await one('SELECT COUNT(*) AS n FROM dang_ky WHERE khoa_hoc_id = ?', [toeic650]);
  check('Sĩ số', `Không vượt sĩ số tối đa (${full.so_cho_toi_da})`, Number(after.n) <= Number(full.so_cho_toi_da) && r.location === `/khoa-hoc/${toeic650}`, `${after.n}`);

  // ------------------------------------------------------------ 9. Đánh giá
  console.log('\n9. Đánh giá khóa học');
  r = await newbie.post(`/hoc/${giaoTiep}/danh-gia`, { so_sao: '5', noi_dung: 'x' });
  check('Đánh giá', 'Chưa kích hoạt không được đánh giá', r.status === 302 && !(await one('SELECT id FROM danh_gia WHERE hoc_vien_id = ? AND khoa_hoc_id = ?', [nb.id, giaoTiep])));
  r = await newbie.post(`/hoc/${toeic450}/danh-gia`, { so_sao: '', noi_dung: 'x' });
  check('Đánh giá', 'Chưa chọn sao báo lỗi', r.status === 400);
  r = await newbie.post(`/hoc/${toeic450}/danh-gia`, { so_sao: '4', noi_dung: 'a'.repeat(1001) });
  check('Đánh giá', 'Nhận xét quá 1000 ký tự báo lỗi', r.status === 400);
  await newbie.post(`/hoc/${toeic450}/danh-gia`, { so_sao: '4', noi_dung: `Thầy giảng dễ hiểu ${stamp}` });
  let rv = await one('SELECT * FROM danh_gia WHERE hoc_vien_id = ? AND khoa_hoc_id = ?', [nb.id, toeic450]);
  check('Đánh giá', 'Đánh giá mới vào danh sách Chờ duyệt', rv && rv.trang_thai === 'CHO_DUYET');
  r = await guest.get(`/khoa-hoc/${toeic450}?tab=danh-gia`);
  check('Đánh giá', 'Chưa duyệt thì không hiển thị công khai', !r.text.includes(`Thầy giảng dễ hiểu ${stamp}`));
  r = await minh.post(`/teacher/danh-gia/${rv.id}/phan-hoi`, { phan_hoi_gv: 'sớm' });
  check('Đánh giá', 'Giáo viên không phản hồi được đánh giá chưa duyệt', r.status === 404);
  await admin.post(`/admin/danh-gia/${rv.id}/duyet`);
  rv = await one('SELECT * FROM danh_gia WHERE id = ?', [rv.id]);
  check('Đánh giá', 'Admin duyệt → Đang hiển thị', rv.trang_thai === 'HIEN_THI');
  r = await minh.get('/teacher/danh-gia');
  check('Đánh giá', 'Giáo viên thấy đánh giá đã duyệt', r.text.includes(`Thầy giảng dễ hiểu ${stamp}`));
  r = await teacher.post(`/teacher/danh-gia/${rv.id}/phan-hoi`, { phan_hoi_gv: 'Không phải lớp tôi' });
  check('Đánh giá', 'Giáo viên lớp khác không phản hồi được', r.status === 404);
  await minh.post(`/teacher/danh-gia/${rv.id}/phan-hoi`, { phan_hoi_gv: `Cảm ơn em ${stamp}` });
  r = await guest.get(`/khoa-hoc/${toeic450}?tab=danh-gia`);
  check('Đánh giá', 'Đánh giá và phản hồi hiển thị công khai', r.text.includes(`Thầy giảng dễ hiểu ${stamp}`) && r.text.includes(`Cảm ơn em ${stamp}`));
  await newbie.post(`/hoc/${toeic450}/danh-gia`, { so_sao: '3', noi_dung: 'Sửa lại' });
  rv = await one('SELECT * FROM danh_gia WHERE id = ?', [rv.id]);
  check('Đánh giá', 'Sửa đánh giá → Chờ duyệt, xóa phản hồi cũ', rv.trang_thai === 'CHO_DUYET' && rv.phan_hoi_gv === null);
  await admin.post(`/admin/danh-gia/${rv.id}/an`, { ly_do: 'Thử ẩn' });
  rv = await one('SELECT * FROM danh_gia WHERE id = ?', [rv.id]);
  check('Đánh giá', 'Admin ẩn kèm lý do', rv.trang_thai === 'BI_AN' && rv.ly_do_an === 'Thử ẩn');
  await admin.post(`/admin/danh-gia/${rv.id}/hien`);
  rv = await one('SELECT * FROM danh_gia WHERE id = ?', [rv.id]);
  check('Đánh giá', 'Admin hiển thị lại', rv.trang_thai === 'HIEN_THI');

  // ------------------------------------------------------------ 10. Mở khóa học mới
  console.log('\n10. Mở khóa học mới (Admin → Giáo viên → Admin)');
  r = await admin.post('/admin/khoa-hoc/them', { ten: '', danh_muc: '', gia: '-1', so_cho_toi_da: '0' });
  check('Mở khóa học', 'Dữ liệu sai báo lỗi từng trường', r.status === 400 && r.text.includes('Vui lòng nhập tên khóa học'));
  r = await admin.post('/admin/khoa-hoc/them', { ten: `IELTS Test ${stamp}`, danh_muc: 'IELTS', trinh_do: 'Trung cấp', gia: '3000000', so_cho_toi_da: '10',
    lich_hoc: 'Tối T2', thoi_luong: '1 tháng', ngay_khai_giang: '2027-01-10', giao_vien_id: String(ids.lan), mo_ta: 'Khóa học kiểm thử' });
  const newCourse = Number((r.location || '').split('/').pop());
  let kh = await one('SELECT * FROM khoa_hoc WHERE id = ?', [newCourse]);
  check('Mở khóa học', 'Admin tạo khóa học ở trạng thái Nháp', kh && kh.trang_thai === 'NHAP');
  r = await teacher.post(`/teacher/khoa-hoc/${newCourse}/gui-duyet`);
  kh = await one('SELECT * FROM khoa_hoc WHERE id = ?', [newCourse]);
  check('Mở khóa học', 'Không gửi duyệt được khóa học rỗng', kh.trang_thai === 'NHAP');
  r = await teacher.post(`/teacher/khoa-hoc/${newCourse}/bai-giang`, { chuong: 'Mở đầu', tieu_de: 'Bài 1', video_url: 'ftp://x', thu_tu: '1' });
  check('Mở khóa học', 'Đường dẫn video sai báo lỗi', r.status === 400);
  await teacher.post(`/teacher/khoa-hoc/${newCourse}/bai-giang`, { chuong: 'Mở đầu', tieu_de: 'Bài 1', video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', thu_tu: '1' });
  const bai = await one('SELECT * FROM bai_giang WHERE khoa_hoc_id = ?', [newCourse]);
  check('Mở khóa học', 'Giáo viên thêm bài giảng', !!bai);
  await teacher.post(`/teacher/khoa-hoc/${newCourse}/bai-giang/${bai.id}`, { chuong: 'Mở đầu', tieu_de: 'Bài 1 (sửa)', thu_tu: '1' });
  check('Mở khóa học', 'Giáo viên sửa bài giảng', (await one('SELECT tieu_de FROM bai_giang WHERE id = ?', [bai.id])).tieu_de === 'Bài 1 (sửa)');
  r = await minh.post(`/teacher/khoa-hoc/${newCourse}/bai-giang`, { tieu_de: 'Chen ngang' });
  check('Mở khóa học', 'Giáo viên khác không thêm bài vào khóa không được phân công', r.status === 404);
  await teacher.post(`/teacher/khoa-hoc/${newCourse}/gui-duyet`);
  kh = await one('SELECT * FROM khoa_hoc WHERE id = ?', [newCourse]);
  check('Mở khóa học', 'Gửi duyệt → Chờ duyệt', kh.trang_thai === 'CHO_DUYET');
  await admin.post(`/admin/khoa-hoc/${newCourse}/yeu-cau-sua`, { ghi_chu_duyet: 'Thêm bài Listening' });
  kh = await one('SELECT * FROM khoa_hoc WHERE id = ?', [newCourse]);
  check('Mở khóa học', 'Admin yêu cầu chỉnh sửa kèm ghi chú', kh.trang_thai === 'CAN_SUA' && kh.ghi_chu_duyet === 'Thêm bài Listening');
  await teacher.post(`/teacher/khoa-hoc/${newCourse}/bai-giang`, { chuong: 'Listening', tieu_de: 'Bài 2', thu_tu: '2' });
  await teacher.post(`/teacher/khoa-hoc/${newCourse}/gui-duyet`);
  await admin.post(`/admin/khoa-hoc/${newCourse}/duyet`);
  kh = await one('SELECT * FROM khoa_hoc WHERE id = ?', [newCourse]);
  check('Mở khóa học', 'Admin duyệt → Đang mở đăng ký', kh.trang_thai === 'MO_DANG_KY');
  r = await guest.get('/khoa-hoc');
  check('Mở khóa học', 'Khóa học xuất hiện trên trang Client', r.text.includes(`IELTS Test ${stamp}`));
  await newbie.post(`/dang-ky-hoc/${newCourse}`, { trinh_do_hien_tai: 'Trung cấp', muc_tieu: 'x' });
  await admin.post(`/admin/khoa-hoc/${newCourse}/xoa`);
  check('Mở khóa học', 'Khóa học đã có đăng ký không xóa được', !!(await one('SELECT id FROM khoa_hoc WHERE id = ?', [newCourse])));
  await admin.post(`/admin/khoa-hoc/${newCourse}/an`);
  r = await guest.get(`/khoa-hoc/${newCourse}`);
  check('Mở khóa học', 'Admin ẩn khóa học → không còn hiện trên Client', r.status === 404);

  // ------------------------------------------------------------ 11. Quản lý giáo viên
  console.log('\n11. Quản lý giáo viên');
  const gvEmail = `gv${stamp}@engedu.vn`;
  r = await admin.post('/admin/giao-vien/them', { ho_ten: 'Giáo Viên Test', email: 'lan.nguyen@engedu.vn', chuyen_mon: 'IELTS', kinh_nghiem_nam: '3', mat_khau: 'MatKhau123' });
  check('Quản lý GV', 'Email đã dùng bị chặn', r.status === 400 && r.text.includes('Email đã được sử dụng'));
  r = await admin.post('/admin/giao-vien/them', { ho_ten: 'Giáo Viên Test', email: gvEmail, sdt: '0912345678', chuyen_mon: 'IELTS', hoc_vi: 'Thạc sĩ', kinh_nghiem_nam: '3', mat_khau: 'MatKhau123' });
  const gv = await one('SELECT t.id, t.vai_tro, g.chuyen_mon FROM tai_khoan t JOIN giao_vien g ON g.tai_khoan_id = t.id WHERE t.email = ?', [gvEmail]);
  check('Quản lý GV', 'Cấp tài khoản: tạo TAI_KHOAN + GIAO_VIEN', gv && gv.vai_tro === 'GIAO_VIEN');
  const newT = new Client('newT');
  r = await newT.login(gvEmail, 'MatKhau123');
  check('Quản lý GV', 'Giáo viên mới đăng nhập vào /teacher', r.location === '/teacher');
  await admin.post(`/admin/giao-vien/${gv.id}`, { ho_ten: 'Giáo Viên Đã Sửa', email: gvEmail, sdt: '0912345678', chuyen_mon: 'TOEIC', kinh_nghiem_nam: '4' });
  check('Quản lý GV', 'Admin sửa hồ sơ giáo viên', (await one('SELECT chuyen_mon FROM giao_vien WHERE tai_khoan_id = ?', [gv.id])).chuyen_mon === 'TOEIC');
  await newT.post('/teacher/ho-so', { sdt: '0911111111', gioi_thieu: 'Xin chào' });
  check('Quản lý GV', 'Giáo viên tự cập nhật SĐT và giới thiệu', (await one('SELECT sdt FROM tai_khoan WHERE id = ?', [gv.id])).sdt === '0911111111');
  await admin.post(`/admin/giao-vien/${gv.id}/dat-lai-mat-khau`, { mat_khau_moi: 'MatKhauMoi9' });
  check('Quản lý GV', 'Đặt lại mật khẩu, giáo viên nhận thông báo', !!(await one("SELECT id FROM thong_bao WHERE tai_khoan_id = ? AND tieu_de = 'Mật khẩu đã được đặt lại'", [gv.id])));
  await admin.post(`/admin/giao-vien/${gv.id}/khoa`);
  r = await newT.get('/teacher');
  check('Quản lý GV', 'Khóa tài khoản → phiên đang mở bị hủy', r.status === 302 && r.location === '/dang-nhap');
  r = await new Client('locked').login(gvEmail, 'MatKhauMoi9');
  check('Quản lý GV', 'Tài khoản bị khóa không đăng nhập được', r.text.includes('Tài khoản đã bị khóa'));
  await admin.post(`/admin/giao-vien/${gv.id}/mo-khoa`);
  r = await new Client('unlocked').login(gvEmail, 'MatKhauMoi9');
  check('Quản lý GV', 'Mở khóa → đăng nhập lại được', r.location === '/teacher');
  const pwT = new Client('pwT');
  await pwT.login(gvEmail, 'MatKhauMoi9');
  r = await pwT.post('/teacher/mat-khau', { mat_khau_cu: 'sai', mat_khau_moi: 'MatKhau456', nhap_lai: 'MatKhau456' });
  check('Đổi mật khẩu', 'Sai mật khẩu hiện tại báo lỗi', r.status === 400);
  await pwT.post('/teacher/mat-khau', { mat_khau_cu: 'MatKhauMoi9', mat_khau_moi: 'MatKhau456', nhap_lai: 'MatKhau456' });
  r = await new Client('pw2').login(gvEmail, 'MatKhau456');
  check('Đổi mật khẩu', 'Đăng nhập bằng mật khẩu mới', r.location === '/teacher');

  // ------------------------------------------------------------ 12. Admin cố định
  console.log('\n12. Admin cố định');
  r = await admin.post(`/admin/giao-vien/${ids.admin}/khoa`);
  const adm = await one('SELECT trang_thai FROM tai_khoan WHERE id = ?', [ids.admin]);
  check('Admin cố định', 'Không khóa được tài khoản Admin', r.status === 404 && adm.trang_thai === 'HOAT_DONG');
  r = await admin.post(`/admin/hoc-vien/${ids.admin}/khoa`);
  check('Admin cố định', 'Không khóa Admin qua mục học viên', r.status === 404);
  await admin.post(`/admin/hoc-vien/${nb.id}/khoa`);
  r = await newbie.get('/tai-khoan');
  check('Quản lý HV', 'Khóa học viên → bị đăng xuất', r.location === '/dang-nhap');
  await admin.post(`/admin/hoc-vien/${nb.id}/mo-khoa`);

  // ------------------------------------------------------------ 13. Tư vấn
  console.log('\n13. Tư vấn và đánh giá trình độ');
  r = await guest.post('/tu-van', { ho_ten: 'Khách', sdt: '123', email: '' });
  check('Tư vấn', 'SĐT sai báo lỗi', r.status === 400);
  await guest.post('/tu-van', { ho_ten: `Khách ${stamp}`, sdt: '0955999999', email: 'khach@example.com', khoa_hoc_id: String(ieltsF), noi_dung: 'Kiểm tra trình độ' });
  let tv = await one('SELECT * FROM yeu_cau_tu_van WHERE ho_ten = ?', [`Khách ${stamp}`]);
  check('Tư vấn', 'Khách gửi form → Mới', tv && tv.trang_thai === 'MOI');
  await admin.post(`/admin/tu-van/${tv.id}/chuyen`, { giao_vien_id: String(ids.lan) });
  tv = await one('SELECT * FROM yeu_cau_tu_van WHERE id = ?', [tv.id]);
  check('Tư vấn', 'Admin chuyển giáo viên → Đã chuyển giáo viên', tv.trang_thai === 'CHUYEN_GV' && tv.giao_vien_id === ids.lan);
  r = await minh.post(`/teacher/tu-van/${tv.id}/de-xuat`, { ket_qua_gv: 'x' });
  check('Tư vấn', 'Giáo viên khác không đề xuất được', r.status === 404);
  await teacher.post(`/teacher/tu-van/${tv.id}/de-xuat`, { ket_qua_gv: 'Trình độ Cơ bản, nên học IELTS Foundation' });
  tv = await one('SELECT * FROM yeu_cau_tu_van WHERE id = ?', [tv.id]);
  check('Tư vấn', 'Giáo viên đề xuất → Giáo viên đã đề xuất', tv.trang_thai === 'DA_DE_XUAT');
  await admin.post(`/admin/tu-van/${tv.id}/hoan-tat`, { ket_qua: 'Đã tư vấn, khách đăng ký học' });
  tv = await one('SELECT * FROM yeu_cau_tu_van WHERE id = ?', [tv.id]);
  check('Tư vấn', 'Admin ghi kết quả → Hoàn tất', tv.trang_thai === 'HOAN_TAT');

  // ------------------------------------------------------------ 14. Thông báo
  console.log('\n14. Thông báo');
  r = await newbie.login(newEmail);
  r = await newbie.get('/thong-bao');
  check('Thông báo', 'Học viên xem danh sách thông báo', r.status === 200 && r.text.includes('Khóa học đã được kích hoạt'));
  await newbie.post('/thong-bao/doc-tat-ca');
  check('Thông báo', 'Đánh dấu tất cả đã đọc', Number((await one('SELECT COUNT(*) AS n FROM thong_bao WHERE tai_khoan_id = ? AND da_doc = FALSE', [nb.id])).n) === 0);

  // ------------------------------------------------------------ 15. Quên mật khẩu
  console.log('\n15. Quên mật khẩu');
  const forgot = new Client('forgot');
  r = await forgot.get('/dang-nhap');
  check('Quên mật khẩu', 'Trang đăng nhập có liên kết "Quên mật khẩu?"', r.text.includes('href="/quen-mat-khau"'));
  r = await forgot.get('/quen-mat-khau');
  check('Quên mật khẩu', 'Mở trang Quên mật khẩu', r.status === 200);
  r = await forgot.post('/quen-mat-khau', { email: newEmail, sdt: '0000000000' });
  check('Quên mật khẩu', 'Sai số điện thoại bị từ chối', r.status === 400 && r.text.includes('không khớp'));
  r = await forgot.post('/quen-mat-khau', { email: 'admin@engedu.vn', sdt: '0900000000' });
  check('Quên mật khẩu', 'Không đặt lại được mật khẩu Admin', r.status === 400);
  r = await forgot.post('/quen-mat-khau', { email: newEmail.toUpperCase(), sdt: '0987654321' });
  const resetUrl = r.location || '';
  check('Quên mật khẩu', 'Email + SĐT đúng → chuyển đến trang đặt lại', /^\/dat-lai-mat-khau\/[0-9a-f]{48}$/.test(resetUrl), resetUrl);
  r = await forgot.post(resetUrl, { mat_khau_moi: 'ngan', nhap_lai: 'ngan' });
  check('Quên mật khẩu', 'Mật khẩu mới quá ngắn báo lỗi', r.status === 400);
  const still = new Client('still');
  await still.login(newEmail);
  r = await forgot.post(resetUrl, { mat_khau_moi: 'MoiQuen123', nhap_lai: 'MoiQuen123' });
  check('Quên mật khẩu', 'Đặt mật khẩu mới thành công', r.location === '/dang-nhap');
  r = await new Client('oldpw').login(newEmail);
  check('Quên mật khẩu', 'Mật khẩu cũ không còn dùng được', r.status === 400);
  r = await new Client('newpw').login(newEmail, 'MoiQuen123');
  check('Quên mật khẩu', 'Đăng nhập bằng mật khẩu mới', r.location && r.location !== '/dang-nhap');
  r = await still.get('/tai-khoan');
  check('Quên mật khẩu', 'Phiên đang mở ở thiết bị khác bị đăng xuất', r.location === '/dang-nhap');
  r = await forgot.post(resetUrl, { mat_khau_moi: 'LanHai1234', nhap_lai: 'LanHai1234' });
  check('Quên mật khẩu', 'Liên kết chỉ dùng được một lần', r.status === 400);
  const brute = new Client('brute');
  for (let i = 0; i < 5; i += 1) r = await brute.post('/quen-mat-khau', { email: 'an.le@example.com', sdt: `09000000${i}0` });
  r = await brute.post('/quen-mat-khau', { email: 'an.le@example.com', sdt: '0933000001' });
  check('Quên mật khẩu', 'Sai 5 lần → tạm khóa 15 phút', r.status === 400 && r.text.includes('15 phút'));
  await admin.post(`/admin/hoc-vien/${nb.id}/dat-lai-mat-khau`, { mat_khau_moi: 'AdminDat123' });
  r = await new Client('byadmin').login(newEmail, 'AdminDat123');
  check('Quên mật khẩu', 'Admin đặt lại mật khẩu học viên', r.location && r.location !== '/dang-nhap');

  // ------------------------------------------------------------ Tổng kết
  const groups = {};
  for (const x of results) {
    groups[x.group] = groups[x.group] || { pass: 0, total: 0 };
    groups[x.group].total += 1;
    if (x.ok) groups[x.group].pass += 1;
  }
  console.log('\n========== KẾT QUẢ ==========');
  for (const [g, v] of Object.entries(groups)) console.log(`${v.pass === v.total ? 'Đạt     ' : 'KHÔNG ĐẠT'} ${g.padEnd(20)} ${v.pass}/${v.total}`);
  console.log(`Tổng: ${results.length - failures}/${results.length} kiểm tra đạt`);
  db.close();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  db.close();
  process.exit(1);
});
