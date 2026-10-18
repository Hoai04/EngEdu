// Dữ liệu mẫu (SQLite): 10 giáo viên, 16 học viên, 14 khóa học kèm bài giảng, đăng ký, thanh toán,
// đánh giá, tiến độ, yêu cầu tư vấn. Chạy: npm run seed  (XÓA toàn bộ dữ liệu cũ!)
const bcrypt = require('bcryptjs');
const db = require('./db');
const config = require('./config');

const PASSWORD = '12345678';
const day = 24 * 60 * 60 * 1000;
const now = Date.now();
const ago = (d, h = 10) => new Date(now - d * day + h * 3600 * 1000);
const ahead = (d) => { const x = new Date(now + d * day); x.setHours(0, 0, 0, 0); return x; };

const TEACHERS = [
  ['Nguyễn Thị Lan', 'lan.nguyen@engedu.vn', '0911000001', '1988-03-12', 'NU', 'IELTS Writing & Speaking', 'Thạc sĩ TESOL', 'IELTS 8.0', 8, '2019-08-01', 'Hơn 8 năm luyện thi IELTS, chuyên chữa bài Writing chi tiết theo từng tiêu chí chấm.'],
  ['Trần Văn Minh', 'minh.tran@engedu.vn', '0911000002', '1987-07-20', 'NAM', 'TOEIC Listening & Reading', 'Cử nhân Ngôn ngữ Anh', 'TOEIC 970', 7, '2020-02-15', 'Giúp hàng trăm học viên mất gốc đạt TOEIC 650+ trong 2–3 tháng.'],
  ['Phạm Thu Hoa', 'hoa.pham@engedu.vn', '0911000003', '1990-11-05', 'NU', 'Giao tiếp & Phát âm', 'Thạc sĩ Ngôn ngữ học', 'CELTA', 6, '2020-09-01', 'Lớp giao tiếp phản xạ, sửa phát âm theo IPA.'],
  ['David Miller', 'david.miller@engedu.vn', '0911000004', '1982-01-30', 'NAM', 'Business English', 'MA Applied Linguistics', 'CELTA, DELTA', 12, '2018-05-10', 'Native speaker, 12 years teaching business communication for corporate clients.'],
  ['Lê Minh Quân', 'quan.le@engedu.vn', '0911000005', '1991-04-18', 'NAM', 'IELTS Speaking', 'Cử nhân Sư phạm Anh', 'IELTS 8.5', 7, '2021-01-05', 'Luyện Speaking theo phương pháp shadowing và phản hồi từng câu.'],
  ['Vũ Phương Thảo', 'thao.vu@engedu.vn', '0911000006', '1993-09-09', 'NU', 'IELTS Writing', 'Thạc sĩ TESOL', 'IELTS 8.0', 5, '2022-03-01', 'Chuyên Writing Task 1 và Task 2 cho mục tiêu 7.0+.'],
  ['Đặng Anh Tuấn', 'tuan.dang@engedu.vn', '0911000007', '1989-12-01', 'NAM', 'TOEIC nâng cao', 'Cử nhân Kinh tế đối ngoại', 'TOEIC 990', 9, '2019-03-20', 'Chiến lược làm bài TOEIC Part 5–7 cho mục tiêu 800+.'],
  ['Bùi Khánh Linh', 'linh.bui@engedu.vn', '0911000008', '1995-06-25', 'NU', 'Phát âm & Giao tiếp', 'Cử nhân Ngôn ngữ Anh', 'TESOL', 4, '2022-08-15', 'Phát âm chuẩn IPA cho người mới bắt đầu.'],
  ['Sarah Johnson', 'sarah.johnson@engedu.vn', '0911000009', '1986-02-14', 'NU', 'Business Presentation', 'BA English Literature', 'TEFL', 10, '2019-10-01', 'Presentation & meeting skills for professionals.'],
  ['Trịnh Bảo Ngọc', 'ngoc.trinh@engedu.vn', '0911000010', '1992-08-08', 'NU', 'Tiếng Anh thiếu nhi', 'Cử nhân Sư phạm Anh', 'Cambridge TKT', 6, '2020-06-01', 'Dạy trẻ 6–12 tuổi qua trò chơi, bài hát và dự án.'],
];

const STUDENTS = [
  ['Lê Văn An', 'an.le@example.com', '0933000001', '2004-05-10', 'NAM', 'Đống Đa, Hà Nội', 'Sinh viên', 'Đại học Bách khoa Hà Nội', 'Trung cấp', 'IELTS 6.5 để xét tốt nghiệp'],
  ['Phạm Thu Bình', 'binh.pham@example.com', '0933000002', '2003-01-22', 'NU', 'Cầu Giấy, Hà Nội', 'Sinh viên', 'Đại học Kinh tế Quốc dân', 'Cơ bản', 'TOEIC 650 để ra trường'],
  ['Đỗ Minh Chi', 'chi.do@example.com', '0933000003', '2003-02-14', 'NU', 'Hai Bà Trưng, Hà Nội', 'Sinh viên', 'Đại học Ngoại thương', 'Khá', 'IELTS 7.0 du học Úc'],
  ['Trần Quốc Khánh', 'khanh.tran@example.com', '0933000004', '2002-10-03', 'NAM', 'Thanh Xuân, Hà Nội', 'Sinh viên', 'Học viện Công nghệ BCVT', 'Trung cấp', 'IELTS 6.0 chuẩn đầu ra'],
  ['Phan Thúy Nga', 'nga.phan@example.com', '0933000005', '1999-07-19', 'NU', 'Ba Đình, Hà Nội', 'Nhân viên văn phòng', 'Công ty TNHH ABC', 'Trung cấp', 'IELTS Speaking 7.0'],
  ['Hoàng Đức Huy', 'huy.hoang@example.com', '0933000006', '1997-03-30', 'NAM', 'Long Biên, Hà Nội', 'Kỹ sư phần mềm', 'Công ty FPT', 'Khá', 'Giao tiếp với khách hàng nước ngoài'],
  ['Nguyễn Thảo My', 'my.nguyen@example.com', '0933000007', '2005-12-12', 'NU', 'Hoàng Mai, Hà Nội', 'Sinh viên', 'Đại học Hà Nội', 'Cơ bản', 'TOEIC 450 đầu ra'],
  ['Vũ Hoàng Long', 'long.vu@example.com', '0933000008', '1995-09-01', 'NAM', 'Tây Hồ, Hà Nội', 'Trưởng nhóm kinh doanh', 'Ngân hàng XYZ', 'Khá', 'Thuyết trình bằng tiếng Anh'],
  ['Đinh Ngọc Ánh', 'anh.dinh@example.com', '0933000009', '2001-04-27', 'NU', 'Nam Từ Liêm, Hà Nội', 'Nhân viên marketing', 'Agency DEF', 'Trung cấp', 'Business English cho công việc'],
  ['Mai Tuấn Kiệt', 'kiet.mai@example.com', '0933000010', '2004-08-15', 'NAM', 'Bắc Từ Liêm, Hà Nội', 'Sinh viên', 'Đại học Công nghiệp', 'Mất gốc', 'Giao tiếp cơ bản'],
  ['Lý Gia Hân', 'han.ly@example.com', '0933000011', '2016-06-06', 'NU', 'Cầu Giấy, Hà Nội', 'Học sinh', 'Tiểu học Nghĩa Tân', 'Cơ bản', 'Cambridge Movers'],
  ['Phùng Bảo Nam', 'nam.phung@example.com', '0933000012', '2017-02-02', 'NAM', 'Đống Đa, Hà Nội', 'Học sinh', 'Tiểu học Kim Liên', 'Mất gốc', 'Cambridge Starters'],
  ['Tạ Thu Trang', 'trang.ta@example.com', '0933000013', '2000-11-11', 'NU', 'Hà Đông, Hà Nội', 'Giáo viên mầm non', 'Mầm non Hoa Sen', 'Cơ bản', 'Phát âm chuẩn'],
  ['Cao Minh Đức', 'duc.cao@example.com', '0933000014', '1998-05-05', 'NAM', 'Gia Lâm, Hà Nội', 'Kế toán', 'Công ty GHI', 'Trung cấp', 'TOEIC 800 thăng chức'],
  ['Kiều Lan Phương', 'phuong.kieu@example.com', '0933000015', '2002-03-08', 'NU', 'Thanh Trì, Hà Nội', 'Sinh viên', 'Học viện Ngân hàng', 'Khá', 'IELTS Writing 7.0'],
  ['Lương Văn Tài', 'tai.luong@example.com', '0933000016', '1996-10-20', 'NAM', 'Hoàn Kiếm, Hà Nội', 'Chủ cửa hàng', 'Tự kinh doanh', 'Mất gốc', 'Giao tiếp với khách du lịch'],
];

// [tên, danh mục, trình độ, giá, lịch, thời lượng, khai giảng (+ngày), sĩ số, gv(index), trạng thái, mô tả]
const COURSES = [
  ['IELTS Foundation 5.0+', 'IELTS', 'Cơ bản', 2500000, 'Tối T2 - T4 - T6, 19:00 - 21:00', '3 tháng (36 buổi)', 18, 30, 0, 'MO_DANG_KY', 'Xây nền 4 kỹ năng, làm quen cấu trúc đề IELTS và lộ trình tự học hiệu quả.'],
  ['IELTS Intensive 6.5+', 'IELTS', 'Trung cấp', 4200000, 'Tối T3 - T5 - T7, 19:00 - 21:00', '3 tháng (36 buổi)', 20, 20, 0, 'MO_DANG_KY', 'Luyện chuyên sâu Writing Task 1 - 2 và Speaking Part 1 - 3, chữa bài 1 - 1 sau mỗi buổi, thi thử định kỳ.'],
  ['IELTS Speaking Master', 'IELTS', 'Trung cấp', 2900000, 'Tối T7 - CN, 18:00 - 20:00', '2 tháng (16 buổi)', 24, 15, 4, 'MO_DANG_KY', 'Phản xạ Speaking qua chủ đề thật, ghi âm và chấm theo 4 tiêu chí.'],
  ['IELTS Writing Pro 7.0', 'IELTS', 'Nâng cao', 3800000, 'Tối T2 - T5, 19:30 - 21:30', '2 tháng (16 buổi)', 25, 18, 5, 'MO_DANG_KY', 'Lập luận, từ vựng học thuật và chữa bài chi tiết cho mục tiêu 7.0+.'],
  ['TOEIC 450+ cho người mất gốc', 'TOEIC', 'Cơ bản', 1500000, 'Tối T3 - T6, 18:00 - 19:30', '2 tháng (16 buổi)', 19, 30, 1, 'MO_DANG_KY', 'Ngữ pháp nền tảng và chiến thuật nghe - đọc TOEIC từ con số 0.'],
  ['TOEIC 650+ cấp tốc', 'TOEIC', 'Trung cấp', 1800000, 'Tối T2 - T4 - T6, 18:00 - 19:30', '6 tuần (18 buổi)', 23, 4, 1, 'MO_DANG_KY', 'Lớp nhỏ cấp tốc, luyện đề thật mỗi tuần.'],
  ['TOEIC Bứt phá 800+', 'TOEIC', 'Nâng cao', 2600000, 'Tối T3 - T5, 19:00 - 21:00', '2 tháng (16 buổi)', 26, 25, 6, 'MO_DANG_KY', 'Chiến lược Part 5 - 7, quản lý thời gian và bẫy thường gặp.'],
  ['Giao tiếp cho người mất gốc', 'GIAO_TIEP', 'Cơ bản', 1500000, 'Tối T3 - T5, 18:00 - 19:30', '2 tháng (16 buổi)', 19, 30, 2, 'MO_DANG_KY', 'Tự tin nói các tình huống hằng ngày sau 16 buổi.'],
  ['Giao tiếp phản xạ trung cấp', 'GIAO_TIEP', 'Trung cấp', 2200000, 'Tối T2 - T4, 19:00 - 20:30', '2 tháng (16 buổi)', 22, 20, 2, 'MO_DANG_KY', 'Thảo luận chủ đề, phản xạ nhanh và mở rộng vốn từ.'],
  ['Phát âm chuẩn IPA', 'GIAO_TIEP', 'Cơ bản', 1200000, 'Sáng CN, 09:00 - 11:00', '1 tháng (8 buổi)', 24, 20, 7, 'MO_DANG_KY', 'Bảng phiên âm quốc tế, trọng âm, nối âm và ngữ điệu.'],
  ['Business English for Work', 'BUSINESS', 'Trung cấp', 5500000, 'Tối T3 - T5, 19:00 - 21:00', '3 tháng (24 buổi)', 27, 15, 3, 'MO_DANG_KY', 'Email, họp, đàm phán và small talk trong môi trường công sở.'],
  ['Presentation & Meeting Skills', 'BUSINESS', 'Trung cấp', 4500000, 'Sáng T7, 09:00 - 11:30', '2 tháng (8 buổi)', 29, 12, 8, 'MO_DANG_KY', 'Cấu trúc bài thuyết trình, slide tiếng Anh và điều phối cuộc họp.'],
  ['Cambridge Starters cho bé', 'THIEU_NHI', 'Cơ bản', 1900000, 'Chiều T7 - CN, 15:00 - 16:30', '3 tháng (24 buổi)', 23, 15, 9, 'MO_DANG_KY', 'Tiếng Anh cho trẻ 6 - 8 tuổi qua trò chơi, bài hát và dự án nhỏ.'],
  ['Cambridge Movers cho bé', 'THIEU_NHI', 'Trung cấp', 2100000, 'Chiều T7 - CN, 17:00 - 18:30', '3 tháng (24 buổi)', 51, 15, 9, 'NHAP', 'Tiếp nối Starters, chuẩn bị thi Cambridge Movers.'],
];

const LESSON_PLANS = {
  IELTS: [['Tổng quan IELTS', ['Cấu trúc bài thi và cách tính band', 'Lộ trình tự học hiệu quả']], ['Listening', ['Form completion', 'Multiple choice', 'Map labelling']],
    ['Reading', ['Skimming & Scanning', 'True / False / Not Given']], ['Writing & Speaking', ['Làm quen Writing Task 1', 'Speaking Part 1']]],
  TOEIC: [['Nền tảng', ['Cấu trúc đề TOEIC', 'Thì và câu bị động']], ['Listening', ['Part 1 - 2: Tranh và hỏi đáp', 'Part 3 - 4: Hội thoại và bài nói']], ['Reading', ['Part 5 - 6: Ngữ pháp và điền từ', 'Part 7: Đọc hiểu']]],
  GIAO_TIEP: [['Khởi động', ['Chào hỏi và giới thiệu bản thân', 'Hỏi đường và chỉ đường']], ['Tình huống', ['Gọi món ở nhà hàng', 'Mua sắm và trả giá', 'Nói chuyện qua điện thoại']]],
  BUSINESS: [['Email', ['Cấu trúc email công việc', 'Email đề nghị và từ chối']], ['Cuộc họp', ['Mở đầu và điều phối', 'Bày tỏ đồng ý / phản đối']], ['Thuyết trình', ['Mở bài thu hút']]],
  THIEU_NHI: [['Unit 1', ['Colors and shapes', 'My family']], ['Unit 2', ['Animals', 'At school']]],
};

async function main() {
  await db.initSchema();
  db.raw.exec('PRAGMA foreign_keys = OFF');
  for (const t of ['thong_bao', 'tien_do_hoc', 'danh_gia', 'thanh_toan', 'dang_ky', 'yeu_cau_tu_van', 'bai_giang', 'khoa_hoc', 'giao_vien', 'hoc_vien', 'sessions']) {
    db.raw.exec(`DELETE FROM ${t}`);
  }
  db.raw.exec("DELETE FROM tai_khoan WHERE vai_tro <> 'ADMIN'");
  db.raw.exec("DELETE FROM sqlite_sequence WHERE name <> 'tai_khoan'");
  db.raw.exec('PRAGMA foreign_keys = ON');
  await db.syncAdmin();
  db.raw.exec('BEGIN');
  const adminId = await db.adminId();
  const hash = await bcrypt.hash(PASSWORD, 10);

  // Giáo viên
  const teacherIds = [];
  for (const [i, t] of TEACHERS.entries()) {
    const [ten, email, sdt, ns, gt, cm, hv, cc, kn, nvl, gtieu] = t;
    const r = await db.query("INSERT INTO tai_khoan (email, mat_khau, ho_ten, sdt, vai_tro, ngay_tao) VALUES (?, ?, ?, ?, 'GIAO_VIEN', ?)", [email, hash, ten, sdt, ago(200 - i)]);
    await db.query(`INSERT INTO giao_vien (tai_khoan_id, ngay_sinh, gioi_tinh, chuyen_mon, hoc_vi, chung_chi, kinh_nghiem_nam, gioi_thieu, ngay_vao_lam)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [r.insertId, ns, gt, cm, hv, cc, kn, gtieu, nvl]);
    teacherIds.push(r.insertId);
  }

  // Học viên
  const studentIds = [];
  for (const [i, s] of STUDENTS.entries()) {
    const [ten, email, sdt, ns, gt, dc, nn, nhl, td, mt] = s;
    const r = await db.query("INSERT INTO tai_khoan (email, mat_khau, ho_ten, sdt, vai_tro, ngay_tao) VALUES (?, ?, ?, ?, 'HOC_VIEN', ?)", [email, hash, ten, sdt, ago(190 - i * 6)]);
    await db.query(`INSERT INTO hoc_vien (tai_khoan_id, ngay_sinh, gioi_tinh, dia_chi, nghe_nghiep, noi_hoc_lam, trinh_do, muc_tieu)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [r.insertId, ns, gt, dc, nn, nhl, td, mt]);
    studentIds.push(r.insertId);
  }

  // Khóa học + bài giảng
  const courseIds = [];
  const lessonsByCourse = {};
  for (const c of COURSES) {
    const [ten, dm, td, gia, lich, tl, kg, so, gv, tt, mt] = c;
    const r = await db.query(`INSERT INTO khoa_hoc (ten, danh_muc, mo_ta, trinh_do, gia, lich_hoc, thoi_luong, ngay_khai_giang, so_cho_toi_da, giao_vien_id, trang_thai)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [ten, dm, mt, td, gia, lich, tl, ahead(kg), so, teacherIds[gv], tt]);
    courseIds.push(r.insertId);
    lessonsByCourse[r.insertId] = [];
    if (tt === 'NHAP') continue;
    let order = 1;
    for (const [chuong, bais] of LESSON_PLANS[dm]) {
      for (const bai of bais) {
        const b = await db.query('INSERT INTO bai_giang (khoa_hoc_id, chuong, tieu_de, thu_tu) VALUES (?, ?, ?, ?)', [r.insertId, chuong, bai, order]);
        lessonsByCourse[r.insertId].push(b.insertId);
        order += 1;
      }
    }
  }

  // Đăng ký đã kích hoạt: [học viên, khóa học, cách đây (ngày), số bài đã học, đánh giá?]
  const ENROLL = [
    [0, 0, 150, 3, [5, 'Cô Lan dạy rất dễ hiểu, tài liệu đầy đủ. Sau 3 tháng mình thi được 6.0 đúng mục tiêu.', 'Cảm ơn em, chúc em tiếp tục chinh phục band cao hơn nhé!']],
    [0, 2, 20, 1, [3, 'Buổi học hơi nhanh với mình.', null, 'CHO_DUYET']],
    [2, 0, 140, 3, [5, 'Lộ trình rõ ràng, mỗi buổi đều có bài tập về nhà và chữa kỹ.', null]],
    [2, 1, 120, 3, [5, 'Writing được chữa từng câu, band Writing của mình tăng từ 5.5 lên 6.5.', null]],
    [3, 0, 130, 2, [4, 'Nội dung tốt, mong có thêm đề thi thử Listening.', 'Cảm ơn góp ý của em, trung tâm sẽ bổ sung thêm 2 đề thi thử.']],
    [3, 1, 10, 0, null],
    [4, 1, 105, 4, [4, 'Lớp học nghiêm túc, cường độ cao, phù hợp ai cần điểm gấp.', null]],
    [5, 7, 95, 4, [5, 'Cô Hoa sửa phát âm rất kỹ, giờ mình tự tin nói chuyện với khách hàng.', null]],
    [6, 4, 90, 5, [4, 'Thầy Minh giảng ngữ pháp dễ hiểu.', null]],
    [7, 10, 80, 6, [5, 'Bài học sát thực tế công việc, rất đáng tiền.', null]],
    [8, 10, 75, 3, [4, 'Giáo viên bản ngữ, môi trường tốt.', null]],
    [7, 11, 40, 2, [5, 'Học xong tự tin thuyết trình với đối tác.', null]],
    [9, 7, 70, 2, null],
    [10, 12, 60, 3, [5, 'Bé rất thích học, về nhà hát bài hát tiếng Anh suốt.', null]],
    [11, 12, 55, 1, null],
    [12, 9, 45, 4, [5, 'Phát âm cải thiện rõ rệt sau 1 tháng.', null]],
    [13, 6, 35, 2, [5, 'Chiến lược Part 7 rất hữu ích.', null]],
    [14, 3, 30, 1, [5, 'Cô Thảo chữa bài rất có tâm.', null]],
    [15, 8, 25, 2, [4, 'Lớp vui, nhiều hoạt động nói.', null]],
    [6, 5, 15, 2, [5, 'Lớp nhỏ nên được chú ý nhiều.', null]],
    [13, 5, 12, 1, null],
  ];
  for (const [hvI, khI, d, done, review] of ENROLL) {
    const hvId = studentIds[hvI];
    const khId = courseIds[khI];
    const course = COURSES[khI];
    const student = STUDENTS[hvI];
    const t0 = ago(d, 9);
    const t1 = ago(d, 11);
    const dk = await db.query(`INSERT INTO dang_ky (hoc_vien_id, khoa_hoc_id, trinh_do_hien_tai, muc_tieu, ghi_chu_hv, ghi_chu_admin, trang_thai, nguoi_duyet, ngay_dang_ky, ngay_duyet)
      VALUES (?, ?, ?, ?, ?, ?, 'DA_KICH_HOAT', ?, ?, ?)`, [hvId, khId, student[8], student[9], null, hvI === 0 && khI === 0 ? 'Học viên muốn tập trung Writing' : null, adminId, t0, t1]);
    const tt = await db.query(`INSERT INTO thanh_toan (dang_ky_id, so_tien, ma_gd_ngan_hang, trang_thai, ngay_tao, ngay_xac_nhan)
      VALUES (?, ?, ?, 'DA_THANH_TOAN', ?, ?)`, [dk.insertId, course[3], `FT${String(26000000 + dk.insertId * 137).padStart(10, '0')}`, t0, t1]);
    await db.query('UPDATE thanh_toan SET ma_don = ? WHERE id = ?', [`KH${100000 + tt.insertId}`, tt.insertId]);
    for (const bId of lessonsByCourse[khId].slice(0, done)) {
      await db.query('INSERT INTO tien_do_hoc (hoc_vien_id, bai_giang_id, ngay_hoan_thanh) VALUES (?, ?, ?)', [hvId, bId, ago(d - 7)]);
    }
    if (review) {
      const [sao, nd, ph, st = 'HIEN_THI'] = review;
      await db.query('INSERT INTO danh_gia (hoc_vien_id, khoa_hoc_id, so_sao, noi_dung, trang_thai, phan_hoi_gv, ngay_tao) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [hvId, khId, sao, nd, st, ph, ago(Math.max(1, d - 30))]);
    }
  }

  // Một đơn đang chờ Admin xác nhận (học viên Phạm Thu Bình – TOEIC 650+)
  const pending = await db.query(`INSERT INTO dang_ky (hoc_vien_id, khoa_hoc_id, trinh_do_hien_tai, muc_tieu, ghi_chu_hv)
    VALUES (?, ?, 'Cơ bản', 'TOEIC 650 để ra trường', 'Em yếu phần nghe, mong thầy lưu ý')`, [studentIds[1], courseIds[5]]);
  const ptt = await db.query("INSERT INTO thanh_toan (dang_ky_id, so_tien, trang_thai) VALUES (?, ?, 'CHO_XAC_NHAN')", [pending.insertId, COURSES[5][3]]);
  await db.query('UPDATE thanh_toan SET ma_don = ? WHERE id = ?', [`KH${100000 + ptt.insertId}`, ptt.insertId]);
  await db.notify(adminId, 'Đơn cần xác nhận', `KH${100000 + ptt.insertId} – Phạm Thu Bình – 1.800.000đ`, '/admin/thanh-toan');

  // Yêu cầu tư vấn
  await db.query(`INSERT INTO yeu_cau_tu_van (ho_ten, sdt, email, khoa_hoc_id, noi_dung) VALUES
    ('Hoàng Mai', '0955000001', 'mai.hoang@example.com', ?, 'Em muốn kiểm tra trình độ trước khi học IELTS.'),
    ('Trần Quốc Bảo', '0955000002', NULL, ?, 'Công ty em cần lớp tiếng Anh cho 10 nhân viên.')`, [courseIds[1], courseIds[10]]);
  await db.query(`INSERT INTO yeu_cau_tu_van (ho_ten, sdt, email, khoa_hoc_id, noi_dung, trang_thai, giao_vien_id, ket_qua_gv, ket_qua) VALUES
    ('Ngô Thanh Hà', '0955000003', 'ha.ngo@example.com', ?, 'Con tôi 7 tuổi, muốn học tiếng Anh.', 'HOAN_TAT', ?, 'Bé ở mức Starters cơ bản, nên học Cambridge Starters.', 'Phụ huynh đã đăng ký lớp Starters tháng tới.')`,
  [courseIds[12], teacherIds[9]]);

  db.raw.exec('COMMIT');
  console.log(`Đã tạo dữ liệu mẫu trong ${config.dbFile}:`);
  console.log(`  ${TEACHERS.length} giáo viên, ${STUDENTS.length} học viên, ${COURSES.length} khóa học, ${ENROLL.length + 1} đăng ký`);
  console.log(`  Admin:     ${config.admin.email} / ${config.admin.password}`);
  console.log(`  Giáo viên: ${TEACHERS[0][1]} / ${PASSWORD}`);
  console.log(`  Học viên:  ${STUDENTS[0][1]} / ${PASSWORD}`);
  db.close();
}

main().catch(async (err) => {
  console.error('Seed thất bại:', err.message);
  db.close();
  process.exit(1);
});
