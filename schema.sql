-- Lược đồ CSDL hệ thống EngEdu (MySQL 8.4, utf8mb4, InnoDB)
-- Tự chạy khi khởi động ứng dụng (db.js). Có thể chạy tay:
--   mysql -u engedu -p khoa_hoc_tieng_anh < schema.sql

CREATE TABLE IF NOT EXISTS tai_khoan (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(100) NOT NULL,
  mat_khau    VARCHAR(255) NOT NULL,
  ho_ten      VARCHAR(100) NOT NULL,
  sdt         VARCHAR(15),
  vai_tro     ENUM('HOC_VIEN','GIAO_VIEN','ADMIN') NOT NULL,
  trang_thai  ENUM('HOAT_DONG','BI_KHOA') NOT NULL DEFAULT 'HOAT_DONG',
  ngay_tao    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_tai_khoan_email UNIQUE (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hoc_vien (
  tai_khoan_id INT PRIMARY KEY,
  ngay_sinh    DATE,
  gioi_tinh    ENUM('NAM','NU','KHAC'),
  dia_chi      VARCHAR(255),
  nghe_nghiep  VARCHAR(100),
  noi_hoc_lam  VARCHAR(150),
  trinh_do     VARCHAR(50),
  muc_tieu     VARCHAR(255),
  CONSTRAINT fk_hoc_vien_tk FOREIGN KEY (tai_khoan_id) REFERENCES tai_khoan(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS giao_vien (
  tai_khoan_id     INT PRIMARY KEY,
  ngay_sinh        DATE,
  gioi_tinh        ENUM('NAM','NU','KHAC'),
  chuyen_mon       VARCHAR(100),
  hoc_vi           VARCHAR(100),
  chung_chi        VARCHAR(255),
  kinh_nghiem_nam  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  gioi_thieu       TEXT,
  ngay_vao_lam     DATE,
  CONSTRAINT fk_giao_vien_tk FOREIGN KEY (tai_khoan_id) REFERENCES tai_khoan(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS khoa_hoc (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  ten              VARCHAR(200) NOT NULL,
  danh_muc         ENUM('IELTS','TOEIC','GIAO_TIEP','BUSINESS','THIEU_NHI') NOT NULL,
  mo_ta            TEXT,
  anh              VARCHAR(255),
  trinh_do         VARCHAR(50),
  gia              INT UNSIGNED NOT NULL,
  lich_hoc         VARCHAR(200),
  thoi_luong       VARCHAR(50),
  ngay_khai_giang  DATE,
  so_cho_toi_da    INT UNSIGNED NOT NULL DEFAULT 20,
  giao_vien_id     INT,
  trang_thai       ENUM('NHAP','CHO_DUYET','CAN_SUA','MO_DANG_KY','AN') NOT NULL DEFAULT 'NHAP',
  ghi_chu_duyet    TEXT,
  ngay_tao         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_khoa_hoc_so_cho CHECK (so_cho_toi_da > 0),
  CONSTRAINT fk_khoa_hoc_gv FOREIGN KEY (giao_vien_id) REFERENCES giao_vien(tai_khoan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bai_giang (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  khoa_hoc_id  INT NOT NULL,
  chuong       VARCHAR(100),
  tieu_de      VARCHAR(200) NOT NULL,
  video_url    VARCHAR(255),
  tai_lieu_url VARCHAR(255),
  thu_tu       INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_bai_giang_kh FOREIGN KEY (khoa_hoc_id) REFERENCES khoa_hoc(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dang_ky (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  hoc_vien_id        INT NOT NULL,
  khoa_hoc_id        INT NOT NULL,
  trinh_do_hien_tai  VARCHAR(50),
  muc_tieu           TEXT,
  ghi_chu_hv         TEXT,
  ghi_chu_admin      TEXT,
  trang_thai         ENUM('CHO_THANH_TOAN','DA_KICH_HOAT','BI_TU_CHOI') NOT NULL DEFAULT 'CHO_THANH_TOAN',
  ly_do_tu_choi      TEXT,
  nguoi_duyet        INT,
  ngay_dang_ky       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ngay_duyet         DATETIME,
  CONSTRAINT uq_dang_ky UNIQUE (hoc_vien_id, khoa_hoc_id),
  CONSTRAINT fk_dang_ky_hv FOREIGN KEY (hoc_vien_id) REFERENCES hoc_vien(tai_khoan_id),
  CONSTRAINT fk_dang_ky_kh FOREIGN KEY (khoa_hoc_id) REFERENCES khoa_hoc(id),
  CONSTRAINT fk_dang_ky_duyet FOREIGN KEY (nguoi_duyet) REFERENCES tai_khoan(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS thanh_toan (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  dang_ky_id       INT NOT NULL,
  ma_don           VARCHAR(20),
  so_tien          INT UNSIGNED NOT NULL,
  ma_gd_ngan_hang  VARCHAR(50),
  trang_thai       ENUM('CHO_THANH_TOAN','CHO_XAC_NHAN','DA_THANH_TOAN','TU_CHOI') NOT NULL DEFAULT 'CHO_THANH_TOAN',
  ngay_tao         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ngay_xac_nhan    DATETIME,
  CONSTRAINT uq_thanh_toan_ma_don UNIQUE (ma_don),
  CONSTRAINT uq_thanh_toan_ma_gd UNIQUE (ma_gd_ngan_hang),
  CONSTRAINT fk_thanh_toan_dk FOREIGN KEY (dang_ky_id) REFERENCES dang_ky(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS danh_gia (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  hoc_vien_id  INT NOT NULL,
  khoa_hoc_id  INT NOT NULL,
  so_sao       TINYINT NOT NULL,
  noi_dung     VARCHAR(1000),
  trang_thai   ENUM('CHO_DUYET','HIEN_THI','BI_AN') NOT NULL DEFAULT 'CHO_DUYET',
  ly_do_an     TEXT,
  phan_hoi_gv  VARCHAR(1000),
  ngay_tao     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_danh_gia UNIQUE (hoc_vien_id, khoa_hoc_id),
  CONSTRAINT ck_danh_gia_sao CHECK (so_sao BETWEEN 1 AND 5),
  CONSTRAINT fk_danh_gia_hv FOREIGN KEY (hoc_vien_id) REFERENCES hoc_vien(tai_khoan_id),
  CONSTRAINT fk_danh_gia_kh FOREIGN KEY (khoa_hoc_id) REFERENCES khoa_hoc(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tien_do_hoc (
  hoc_vien_id      INT NOT NULL,
  bai_giang_id     INT NOT NULL,
  ngay_hoan_thanh  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (hoc_vien_id, bai_giang_id),
  CONSTRAINT fk_tien_do_hv FOREIGN KEY (hoc_vien_id) REFERENCES hoc_vien(tai_khoan_id),
  CONSTRAINT fk_tien_do_bg FOREIGN KEY (bai_giang_id) REFERENCES bai_giang(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS yeu_cau_tu_van (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  ho_ten        VARCHAR(100) NOT NULL,
  sdt           VARCHAR(15) NOT NULL,
  email         VARCHAR(100),
  khoa_hoc_id   INT,
  noi_dung      TEXT,
  trang_thai    ENUM('MOI','CHUYEN_GV','DA_DE_XUAT','HOAN_TAT') NOT NULL DEFAULT 'MOI',
  giao_vien_id  INT,
  ket_qua_gv    TEXT,
  ket_qua       TEXT,
  ngay_tao      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tu_van_kh FOREIGN KEY (khoa_hoc_id) REFERENCES khoa_hoc(id) ON DELETE SET NULL,
  CONSTRAINT fk_tu_van_gv FOREIGN KEY (giao_vien_id) REFERENCES giao_vien(tai_khoan_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS thong_bao (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  tai_khoan_id  INT NOT NULL,
  tieu_de       VARCHAR(200) NOT NULL,
  noi_dung      TEXT,
  lien_ket      VARCHAR(255),
  da_doc        BOOLEAN NOT NULL DEFAULT FALSE,
  ngay_tao      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_thong_bao_tk FOREIGN KEY (tai_khoan_id) REFERENCES tai_khoan(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Phiên đăng nhập (express-mysql-session)
CREATE TABLE IF NOT EXISTS sessions (
  session_id  VARCHAR(128) NOT NULL PRIMARY KEY,
  expires     INT UNSIGNED NOT NULL,
  data        MEDIUMTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
