// Đăng nhập chung cho 3 vai trò, tạm khóa khi sai nhiều lần, phân quyền theo vai trò.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');
const config = require('./config');

const ROLE_HOME = { HOC_VIEN: '/', GIAO_VIEN: '/teacher', ADMIN: '/admin' };
const homeFor = (role) => ROLE_HOME[role] || '/';

// Bộ đếm đăng nhập sai theo email: { fails, lockedUntil }
const loginAttempts = new Map();

function lockInfo(email) {
  const rec = loginAttempts.get(email);
  if (!rec || !rec.lockedUntil) return null;
  if (rec.lockedUntil > Date.now()) return rec;
  loginAttempts.delete(email);
  return null;
}

function registerFail(email) {
  const rec = loginAttempts.get(email) || { fails: 0, lockedUntil: 0 };
  rec.fails += 1;
  if (rec.fails >= config.security.maxLoginFails) {
    rec.lockedUntil = Date.now() + config.security.lockMinutes * 60 * 1000;
  }
  loginAttempts.set(email, rec);
}

/** Thông báo một lần (flash) lưu trong phiên. */
function flash(req, type, message) {
  req.session.flash = { type, message };
}

/**
 * Nạp lại người dùng từ CSDL ở mỗi request. Nếu tài khoản đã bị Admin khóa,
 * phiên bị hủy ngay ở lần truy cập tiếp theo.
 */
async function loadUser(req, res, next) {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.currentUser = null;
  res.locals.unread = 0;
  const sessUser = req.session.user;
  if (!sessUser) return next();

  const user = await db.one(
    'SELECT id, email, ho_ten, sdt, vai_tro, trang_thai, ngay_tao FROM tai_khoan WHERE id = ?',
    [sessUser.id],
  );
  if (!user || user.trang_thai === 'BI_KHOA') {
    return req.session.regenerate(() => {
      flash(req, 'error', 'Tài khoản đã bị khóa. Vui lòng liên hệ trung tâm.');
      res.redirect('/dang-nhap');
    });
  }
  req.user = user;
  res.locals.currentUser = user;
  const c = await db.one('SELECT COUNT(*) AS n FROM thong_bao WHERE tai_khoan_id = ? AND da_doc = FALSE', [user.id]);
  res.locals.unread = Number(c.n);
  next();
}

/** Chặn truy cập nếu chưa đăng nhập hoặc sai vai trò. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      if (req.method === 'GET') req.session.returnTo = req.originalUrl;
      flash(req, 'info', 'Vui lòng đăng nhập để tiếp tục.');
      return res.redirect('/dang-nhap');
    }
    if (!roles.includes(req.user.vai_tro)) {
      flash(req, 'error', 'Bạn không có quyền truy cập khu vực này.');
      return res.redirect(homeFor(req.user.vai_tro));
    }
    next();
  };
}

const router = express.Router();

router.get('/dang-nhap', (req, res) => {
  if (req.user) return res.redirect(homeFor(req.user.vai_tro));
  res.render('client/login', { title: 'Đăng nhập', error: null, email: '' });
});

router.post('/dang-nhap', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.mat_khau || '');
  const fail = (error) => res.status(400).render('client/login', { title: 'Đăng nhập', error, email });

  if (lockInfo(email)) {
    return fail(`Bạn đã nhập sai ${config.security.maxLoginFails} lần. Vui lòng thử lại sau ${config.security.lockMinutes} phút.`);
  }
  const user = await db.one('SELECT * FROM tai_khoan WHERE email = ?', [email]);
  const ok = user && (await bcrypt.compare(password, user.mat_khau));
  if (!ok) {
    registerFail(email);
    if (lockInfo(email)) {
      return fail(`Bạn đã nhập sai ${config.security.maxLoginFails} lần. Vui lòng thử lại sau ${config.security.lockMinutes} phút.`);
    }
    return fail('Email hoặc mật khẩu không đúng.');
  }
  if (user.trang_thai === 'BI_KHOA') return fail('Tài khoản đã bị khóa.');

  loginAttempts.delete(email);
  const returnTo = req.session.returnTo;
  // Tạo phiên mới (chống session fixation); phiên lưu trong bảng sessions.
  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.user = { id: user.id, vai_tro: user.vai_tro };
    let dest = homeFor(user.vai_tro);
    if (user.vai_tro === 'HOC_VIEN' && returnTo && !returnTo.startsWith('/admin') && !returnTo.startsWith('/teacher')) {
      dest = returnTo;
    }
    if (user.vai_tro !== 'HOC_VIEN' && returnTo && returnTo.startsWith(homeFor(user.vai_tro))) dest = returnTo;
    req.session.save(() => res.redirect(dest));
  });
});

router.post('/dang-xuat', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('engedu.sid');
    res.redirect('/');
  });
});

/** Đổi mật khẩu – dùng chung cho mọi vai trò. */
async function changePassword(userId, current, next1, next2) {
  const errors = {};
  const user = await db.one('SELECT mat_khau FROM tai_khoan WHERE id = ?', [userId]);
  if (!user || !(await bcrypt.compare(String(current || ''), user.mat_khau))) errors.mat_khau_cu = 'Mật khẩu hiện tại không đúng';
  if (!next1 || String(next1).length < 8) errors.mat_khau_moi = 'Mật khẩu mới tối thiểu 8 ký tự';
  else if (next1 !== next2) errors.nhap_lai = 'Hai mật khẩu không khớp';
  if (Object.keys(errors).length) return errors;
  await db.query('UPDATE tai_khoan SET mat_khau = ? WHERE id = ?', [await bcrypt.hash(next1, 10), userId]);
  return null;
}

/** Đặt toàn bộ phiên của một tài khoản về đã hết hạn (dùng khi khóa tài khoản). */
async function destroySessionsOf(userId) {
  const rows = await db.query('SELECT session_id, data FROM sessions');
  for (const r of rows) {
    try {
      const d = JSON.parse(r.data);
      if (d.user && d.user.id === userId) await db.query('DELETE FROM sessions WHERE session_id = ?', [r.session_id]);
    } catch (_) { /* phiên hỏng: bỏ qua */ }
  }
}

module.exports = { router, loadUser, requireRole, homeFor, flash, changePassword, destroySessionsOf, loginAttempts };
