-- Lược đồ CSDL hệ thống EngEdu (SQLite 3, mã hóa UTF-8)
-- Tự chạy khi khởi động ứng dụng (db.js), tạo file data/engedu.db.
-- Các giá trị ENUM của thiết kế được hiện thực bằng TEXT + CHECK (... IN (...)).
-- Thời gian lưu dạng TEXT 'YYYY-MM-DD HH:MM:SS' theo giờ máy chủ.

CREATE TABLE IF NOT EXISTS tai_khoan (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       VARCHAR(100) NOT NULL,
  mat_khau    VARCHAR(255) NOT NULL,
  ho_ten      VARCHAR(100) NOT NULL,
  sdt         VARCHAR(15),
  vai_tro     TEXT NOT NULL CHECK (vai_tro IN ('HOC_VIEN','GIAO_VIEN','ADMIN')),
  trang_thai  TEXT NOT NULL DEFAULT 'HOAT_DONG' CHECK (trang_thai IN ('HOAT_DONG','BI_KHOA')),
  ngay_tao    DATETIME NOT NULL DEFAULT (datetime('now','localtime')),
  CONSTRAINT uq_tai_khoan_email UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS hoc_vien (
  tai_khoan_id INTEGER PRIMARY KEY,
  ngay_sinh    DATE,
  gioi_tinh    TEXT CHECK (gioi_tinh IN ('NAM','NU','KHAC')),
  dia_chi      VARCHAR(255),
  nghe_nghiep  VARCHAR(100),
  noi_hoc_lam  VARCHAR(150),
  trinh_do     VARCHAR(50),
  muc_tieu     VARCHAR(255),
  CONSTRAINT fk_hoc_vien_tk FOREIGN KEY (tai_khoan_id) REFERENCES tai_khoan(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS giao_vien (
  tai_khoan_id     INTEGER PRIMARY KEY,
  ngay_sinh        DATE,
  gioi_tinh        TEXT CHECK (gioi_tinh IN ('NAM','NU','KHAC')),
  chuyen_mon       VARCHAR(100),
  hoc_vi           VARCHAR(100),
  chung_chi        VARCHAR(255),
  kinh_nghiem_nam  INTEGER NOT NULL DEFAULT 0 CHECK (kinh_nghiem_nam >= 0),
  gioi_thieu       TEXT,
  ngay_vao_lam     DATE,
  CONSTRAINT fk_giao_vien_tk FOREIGN KEY (tai_khoan_id) REFERENCES tai_khoan(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS khoa_hoc (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ten              VARCHAR(200) NOT NULL,
  danh_muc         TEXT NOT NULL CHECK (danh_muc IN ('IELTS','TOEIC','GIAO_TIEP','BUSINESS','THIEU_NHI')),
  mo_ta            TEXT,
  anh              VARCHAR(255),
  trinh_do         VARCHAR(50),
  gia              INTEGER NOT NULL CHECK (gia >= 0),
  lich_hoc         VARCHAR(200),
  thoi_luong       VARCHAR(50),
  ngay_khai_giang  DATE,
  so_cho_toi_da    INTEGER NOT NULL DEFAULT 20,
  giao_vien_id     INTEGER,
  trang_thai       TEXT NOT NULL DEFAULT 'NHAP' CHECK (trang_thai IN ('NHAP','CHO_DUYET','CAN_SUA','MO_DANG_KY','AN')),
  ghi_chu_duyet    TEXT,
  ngay_tao         DATETIME NOT NULL DEFAULT (datetime('now','localtime')),
  CONSTRAINT ck_khoa_hoc_so_cho CHECK (so_cho_toi_da > 0),
  CONSTRAINT fk_khoa_hoc_gv FOREIGN KEY (giao_vien_id) REFERENCES giao_vien(tai_khoan_id)
);

CREATE TABLE IF NOT EXISTS bai_giang (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  khoa_hoc_id  INTEGER NOT NULL,
  chuong       VARCHAR(100),
  tieu_de      VARCHAR(200) NOT NULL,
  video_url    VARCHAR(255),
  tai_lieu_url VARCHAR(255),
  thu_tu       INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT fk_bai_giang_kh FOREIGN KEY (khoa_hoc_id) REFERENCES khoa_hoc(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dang_ky (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  hoc_vien_id        INTEGER NOT NULL,
  khoa_hoc_id        INTEGER NOT NULL,
  trinh_do_hien_tai  VARCHAR(50),
  muc_tieu           TEXT,
  ghi_chu_hv         TEXT,
  ghi_chu_admin      TEXT,
  trang_thai         TEXT NOT NULL DEFAULT 'CHO_THANH_TOAN' CHECK (trang_thai IN ('CHO_THANH_TOAN','DA_KICH_HOAT','BI_TU_CHOI')),
  ly_do_tu_choi      TEXT,
  nguoi_duyet        INTEGER,
  ngay_dang_ky       DATETIME NOT NULL DEFAULT (datetime('now','localtime')),
  ngay_duyet         DATETIME,
  CONSTRAINT uq_dang_ky UNIQUE (hoc_vien_id, khoa_hoc_id),
  CONSTRAINT fk_dang_ky_hv FOREIGN KEY (hoc_vien_id) REFERENCES hoc_vien(tai_khoan_id),
  CONSTRAINT fk_dang_ky_kh FOREIGN KEY (khoa_hoc_id) REFERENCES khoa_hoc(id),
  CONSTRAINT fk_dang_ky_duyet FOREIGN KEY (nguoi_duyet) REFERENCES tai_khoan(id)
);

CREATE TABLE IF NOT EXISTS thanh_toan (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  dang_ky_id       INTEGER NOT NULL,
  ma_don           VARCHAR(20),
  so_tien          INTEGER NOT NULL CHECK (so_tien >= 0),
  ma_gd_ngan_hang  VARCHAR(50),
  trang_thai       TEXT NOT NULL DEFAULT 'CHO_THANH_TOAN' CHECK (trang_thai IN ('CHO_THANH_TOAN','CHO_XAC_NHAN','DA_THANH_TOAN','TU_CHOI')),
  ngay_tao         DATETIME NOT NULL DEFAULT (datetime('now','localtime')),
  ngay_xac_nhan    DATETIME,
  CONSTRAINT uq_thanh_toan_ma_don UNIQUE (ma_don),
  CONSTRAINT uq_thanh_toan_ma_gd UNIQUE (ma_gd_ngan_hang),
  CONSTRAINT fk_thanh_toan_dk FOREIGN KEY (dang_ky_id) REFERENCES dang_ky(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS danh_gia (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  hoc_vien_id  INTEGER NOT NULL,
  khoa_hoc_id  INTEGER NOT NULL,
  so_sao       INTEGER NOT NULL,
  noi_dung     VARCHAR(1000),
  trang_thai   TEXT NOT NULL DEFAULT 'CHO_DUYET' CHECK (trang_thai IN ('CHO_DUYET','HIEN_THI','BI_AN')),
  ly_do_an     TEXT,
  phan_hoi_gv  VARCHAR(1000),
  ngay_tao     DATETIME NOT NULL DEFAULT (datetime('now','localtime')),
  CONSTRAINT uq_danh_gia UNIQUE (hoc_vien_id, khoa_hoc_id),
  CONSTRAINT ck_danh_gia_sao CHECK (so_sao BETWEEN 1 AND 5),
  CONSTRAINT fk_danh_gia_hv FOREIGN KEY (hoc_vien_id) REFERENCES hoc_vien(tai_khoan_id),
  CONSTRAINT fk_danh_gia_kh FOREIGN KEY (khoa_hoc_id) REFERENCES khoa_hoc(id)
);

CREATE TABLE IF NOT EXISTS tien_do_hoc (
  hoc_vien_id      INTEGER NOT NULL,
  bai_giang_id     INTEGER NOT NULL,
  ngay_hoan_thanh  DATETIME NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (hoc_vien_id, bai_giang_id),
  CONSTRAINT fk_tien_do_hv FOREIGN KEY (hoc_vien_id) REFERENCES hoc_vien(tai_khoan_id),
  CONSTRAINT fk_tien_do_bg FOREIGN KEY (bai_giang_id) REFERENCES bai_giang(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS yeu_cau_tu_van (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ho_ten        VARCHAR(100) NOT NULL,
  sdt           VARCHAR(15) NOT NULL,
  email         VARCHAR(100),
  khoa_hoc_id   INTEGER,
  noi_dung      TEXT,
  trang_thai    TEXT NOT NULL DEFAULT 'MOI' CHECK (trang_thai IN ('MOI','CHUYEN_GV','DA_DE_XUAT','HOAN_TAT')),
  giao_vien_id  INTEGER,
  ket_qua_gv    TEXT,
  ket_qua       TEXT,
  ngay_tao      DATETIME NOT NULL DEFAULT (datetime('now','localtime')),
  CONSTRAINT fk_tu_van_kh FOREIGN KEY (khoa_hoc_id) REFERENCES khoa_hoc(id) ON DELETE SET NULL,
  CONSTRAINT fk_tu_van_gv FOREIGN KEY (giao_vien_id) REFERENCES giao_vien(tai_khoan_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS thong_bao (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tai_khoan_id  INTEGER NOT NULL,
  tieu_de       VARCHAR(200) NOT NULL,
  noi_dung      TEXT,
  lien_ket      VARCHAR(255),
  da_doc        BOOLEAN NOT NULL DEFAULT 0 CHECK (da_doc IN (0, 1)),
  ngay_tao      DATETIME NOT NULL DEFAULT (datetime('now','localtime')),
  CONSTRAINT fk_thong_bao_tk FOREIGN KEY (tai_khoan_id) REFERENCES tai_khoan(id) ON DELETE CASCADE
);

-- Phiên đăng nhập (session-store.js); expires tính bằng mili giây
CREATE TABLE IF NOT EXISTS sessions (
  session_id  VARCHAR(128) NOT NULL PRIMARY KEY,
  expires     INTEGER NOT NULL,
  data        TEXT
);

-- Chỉ mục cho các truy vấn thường dùng
CREATE INDEX IF NOT EXISTS idx_khoa_hoc_trang_thai ON khoa_hoc (trang_thai);
CREATE INDEX IF NOT EXISTS idx_dang_ky_khoa_hoc ON dang_ky (khoa_hoc_id, trang_thai);
CREATE INDEX IF NOT EXISTS idx_thanh_toan_dang_ky ON thanh_toan (dang_ky_id);
CREATE INDEX IF NOT EXISTS idx_thanh_toan_trang_thai ON thanh_toan (trang_thai);
CREATE INDEX IF NOT EXISTS idx_danh_gia_khoa_hoc ON danh_gia (khoa_hoc_id, trang_thai);
CREATE INDEX IF NOT EXISTS idx_bai_giang_khoa_hoc ON bai_giang (khoa_hoc_id, thu_tu);
CREATE INDEX IF NOT EXISTS idx_thong_bao_tai_khoan ON thong_bao (tai_khoan_id, da_doc);
