// Kết nối SQLite (module node:sqlite có sẵn trong Node.js 22), giao dịch, gửi thông báo,
// khởi tạo lược đồ và đồng bộ tài khoản Admin cố định.
const fs = require('fs');
const path = require('path');

// node:sqlite (kèm hàm db.function) có sẵn từ Node.js 22.13.
// journal_mode = DELETE: mọi thay đổi ghi thẳng vào file .db để DB Browser / SQLite Viewer thấy ngay.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`\n[EngEdu] Node.js hiện tại là ${process.version}, cần 22.13 trở lên.`);
  console.error('Tải bản Node.js 22 LTS mới nhất tại https://nodejs.org, cài lại rồi mở terminal mới.\n');
  process.exit(1);
}

const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const config = require('./config');

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
const raw = new DatabaseSync(config.dbFile);
raw.exec('PRAGMA journal_mode = DELETE; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const pad = (n) => String(n).padStart(2, '0');

/** Thời gian theo giờ máy chủ, định dạng 'YYYY-MM-DD HH:MM:SS' (đồng nhất với DEFAULT của lược đồ). */
function toSqlTime(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Hàm SQL bổ sung: NOW() trả về giờ hiện tại, FIELD(x, a, b, ...) trả về vị trí của x (dùng để sắp xếp theo trạng thái)
raw.function('NOW', () => toSqlTime(new Date()));
raw.function('FIELD', { varargs: true, deterministic: true }, (value, ...list) => list.indexOf(value) + 1);

/** Chuyển tham số JS sang kiểu SQLite nhận được. */
function toParam(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) {
    const midnight = !v.getHours() && !v.getMinutes() && !v.getSeconds();
    return midnight ? toSqlTime(v).slice(0, 10) : toSqlTime(v);
  }
  return v;
}

/** Mở rộng tham số mảng cho mệnh đề IN (?) thành IN (?, ?, ...). */
function expand(sql, params) {
  if (!params.some(Array.isArray)) return [sql, params.map(toParam)];
  const out = [];
  let i = 0;
  const text = sql.replace(/\?/g, () => {
    const p = params[i++];
    if (!Array.isArray(p)) { out.push(toParam(p)); return '?'; }
    if (!p.length) { out.push(null); return '?'; }
    out.push(...p.map(toParam));
    return p.map(() => '?').join(', ');
  });
  return [text, out];
}

const cache = new Map();
function prepare(sql) {
  let stmt = cache.get(sql);
  if (!stmt) {
    stmt = raw.prepare(sql);
    if (cache.size > 500) cache.clear();
    cache.set(sql, stmt);
  }
  return stmt;
}

function exec(sql, params = []) {
  const [text, values] = expand(sql, params);
  const stmt = prepare(text);
  if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(text) || /\bRETURNING\b/i.test(text)) return stmt.all(...values);
  const r = stmt.run(...values);
  return { insertId: Number(r.lastInsertRowid), affectedRows: Number(r.changes) };
}

/**
 * Chạy một câu lệnh. SELECT trả về mảng dòng; INSERT/UPDATE/DELETE trả về { insertId, affectedRows }.
 * Tham số thứ ba (conn) được giữ để tương thích, SQLite dùng một kết nối duy nhất.
 */
async function query(sql, params = [], _conn) {
  return exec(sql, params);
}

/** Lấy một dòng hoặc null. */
async function one(sql, params = [], _conn) {
  const rows = exec(sql, params);
  return (Array.isArray(rows) && rows[0]) || null;
}

// Các giao dịch được xếp hàng lần lượt để không bao giờ lồng nhau.
let queue = Promise.resolve();

/**
 * Chạy fn() trong một giao dịch CSDL. Lỗi bất kỳ sẽ ROLLBACK toàn bộ,
 * bảo đảm các thao tác ghi nhiều bảng không bao giờ dừng ở trạng thái nửa vời.
 */
async function transaction(fn) {
  const previous = queue;
  let release;
  queue = new Promise((resolve) => { release = resolve; });
  await previous;
  raw.exec('BEGIN IMMEDIATE');
  try {
    const result = await fn(null);
    raw.exec('COMMIT');
    return result;
  } catch (err) {
    try { raw.exec('ROLLBACK'); } catch (_) { /* bỏ qua */ }
    throw err;
  } finally {
    release();
  }
}

/** Gửi thông báo tới một tài khoản. */
async function notify(taiKhoanId, tieuDe, noiDung = '', lienKet = null) {
  if (!taiKhoanId) return;
  exec('INSERT INTO thong_bao (tai_khoan_id, tieu_de, noi_dung, lien_ket) VALUES (?, ?, ?, ?)', [taiKhoanId, tieuDe, noiDung, lienKet]);
}

let adminIdCache = null;
async function adminId() {
  if (adminIdCache) return adminIdCache;
  const row = await one("SELECT id FROM tai_khoan WHERE vai_tro = 'ADMIN' ORDER BY id LIMIT 1");
  adminIdCache = row ? row.id : null;
  return adminIdCache;
}

/** Gửi thông báo tới Admin cố định. */
async function notifyAdmin(tieuDe, noiDung = '', lienKet = null) {
  await notify(await adminId(), tieuDe, noiDung, lienKet);
}

/** Chạy schema.sql (CREATE TABLE IF NOT EXISTS ...). */
async function initSchema() {
  raw.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
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
    await query("UPDATE tai_khoan SET email = ?, mat_khau = ?, ho_ten = ?, trang_thai = 'HOAT_DONG' WHERE id = ?", [email, hash, hoTen, existing.id]);
    adminIdCache = existing.id;
  } else {
    const r = await query("INSERT INTO tai_khoan (email, mat_khau, ho_ten, vai_tro) VALUES (?, ?, ?, 'ADMIN')", [email, hash, hoTen]);
    adminIdCache = r.insertId;
  }
  // Chỉ có một Admin: tài khoản ADMIN nào khác (nếu ai đó chèn tay) đều bị khóa.
  await query("UPDATE tai_khoan SET trang_thai = 'BI_KHOA' WHERE vai_tro = 'ADMIN' AND id <> ?", [adminIdCache]);
}

function close() {
  try { raw.close(); } catch (_) { /* đã đóng */ }
}

module.exports = { raw, query, one, transaction, notify, notifyAdmin, adminId, initSchema, syncAdmin, close, toSqlTime };
