// Kết nối MySQL, giao dịch, gửi thông báo, khởi tạo lược đồ và đồng bộ Admin cố định.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const config = require('./config');

const pool = mysql.createPool({
  ...config.db,
  charset: 'utf8mb4',
  timezone: '+07:00',
  dateStrings: false,
  waitForConnections: true,
  connectionLimit: 10,
});

/** Chạy một câu lệnh, trả về các dòng (SELECT) hoặc kết quả ghi. */
async function query(sql, params = [], conn = pool) {
  const [rows] = await conn.query(sql, params);
  return rows;
}

/** Lấy một dòng hoặc null. */
async function one(sql, params = [], conn = pool) {
  const rows = await query(sql, params, conn);
  return rows[0] || null;
}

/**
 * Chạy fn(conn) trong một giao dịch CSDL. Lỗi bất kỳ sẽ ROLLBACK toàn bộ,
 * bảo đảm các thao tác ghi nhiều bảng không bao giờ dừng ở trạng thái nửa vời.
 */
async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* bỏ qua */ }
    throw err;
  } finally {
    conn.release();
  }
}

/** Gửi thông báo tới một tài khoản. */
async function notify(taiKhoanId, tieuDe, noiDung = '', lienKet = null, conn = pool) {
  if (!taiKhoanId) return;
  await query(
    'INSERT INTO thong_bao (tai_khoan_id, tieu_de, noi_dung, lien_ket) VALUES (?, ?, ?, ?)',
    [taiKhoanId, tieuDe, noiDung, lienKet],
    conn,
  );
}

let adminIdCache = null;
async function adminId(conn = pool) {
  if (adminIdCache) return adminIdCache;
  const row = await one("SELECT id FROM tai_khoan WHERE vai_tro = 'ADMIN' ORDER BY id LIMIT 1", [], conn);
  adminIdCache = row ? row.id : null;
  return adminIdCache;
}

/** Gửi thông báo tới Admin cố định. */
async function notifyAdmin(tieuDe, noiDung = '', lienKet = null, conn = pool) {
  await notify(await adminId(conn), tieuDe, noiDung, lienKet, conn);
}

/** Chạy schema.sql (CREATE TABLE IF NOT EXISTS ...). */
async function initSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const statements = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
}

/**
 * Tài khoản Admin là duy nhất và cố định trong cấu hình: mỗi lần khởi động,
 * hệ thống tạo nếu chưa có, cập nhật mật khẩu theo cấu hình và luôn đặt
 * trạng thái HOAT_DONG.
 */
async function syncAdmin() {
  const { email, password, hoTen } = config.admin;
  const hash = await bcrypt.hash(password, 10);
  const existing = await one("SELECT id FROM tai_khoan WHERE vai_tro = 'ADMIN' ORDER BY id LIMIT 1");
  if (existing) {
    await query(
      "UPDATE tai_khoan SET email = ?, mat_khau = ?, ho_ten = ?, trang_thai = 'HOAT_DONG' WHERE id = ?",
      [email, hash, hoTen, existing.id],
    );
    adminIdCache = existing.id;
  } else {
    const r = await query(
      "INSERT INTO tai_khoan (email, mat_khau, ho_ten, vai_tro) VALUES (?, ?, ?, 'ADMIN')",
      [email, hash, hoTen],
    );
    adminIdCache = r.insertId;
  }
  // Chỉ có một Admin: hạ mọi tài khoản ADMIN khác (nếu ai đó chèn tay) về bị khóa.
  await query("UPDATE tai_khoan SET trang_thai = 'BI_KHOA' WHERE vai_tro = 'ADMIN' AND id <> ?", [adminIdCache]);
}

module.exports = { pool, query, one, transaction, notify, notifyAdmin, adminId, initSchema, syncAdmin };
