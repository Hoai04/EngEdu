// Lưu phiên đăng nhập của express-session vào bảng sessions trong SQLite,
// để phiên không mất khi khởi động lại máy chủ và Admin có thể hủy phiên khi khóa tài khoản.
const session = require('express-session');

class SQLiteStore extends session.Store {
  constructor(db, { ttlMs = 24 * 60 * 60 * 1000, pruneEveryMs = 15 * 60 * 1000 } = {}) {
    super();
    this.db = db.raw;
    this.ttlMs = ttlMs;
    this.prune();
    this.timer = setInterval(() => this.prune(), pruneEveryMs);
    this.timer.unref();
  }

  expiresOf(sess) {
    const e = sess && sess.cookie && sess.cookie.expires;
    return e ? new Date(e).getTime() : Date.now() + this.ttlMs;
  }

  get(sid, cb) {
    try {
      const row = this.db.prepare('SELECT data, expires FROM sessions WHERE session_id = ?').get(sid);
      if (!row || row.expires < Date.now()) return cb(null, null);
      return cb(null, JSON.parse(row.data));
    } catch (err) {
      return cb(err);
    }
  }

  set(sid, sess, cb = () => {}) {
    try {
      this.db.prepare('INSERT OR REPLACE INTO sessions (session_id, expires, data) VALUES (?, ?, ?)')
        .run(sid, this.expiresOf(sess), JSON.stringify(sess));
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  touch(sid, sess, cb = () => {}) {
    try {
      this.db.prepare('UPDATE sessions SET expires = ? WHERE session_id = ?').run(this.expiresOf(sess), sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  destroy(sid, cb = () => {}) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  prune() {
    try { this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()); } catch (_) { /* bảng chưa tạo */ }
  }
}

module.exports = SQLiteStore;
