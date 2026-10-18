// Khởi động máy chủ EngEdu: phiên đăng nhập lưu MySQL, biến dùng chung cho giao diện,
// gắn ba phân hệ Client (/), Giáo viên (/teacher), Admin (/admin).
const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const config = require('./config');
const db = require('./db');
const helpers = require('./helpers');
const auth = require('./auth');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));

const store = new MySQLStore({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  createDatabaseTable: false,
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000,
  schema: { tableName: 'sessions', columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' } },
});

app.use(session({
  name: 'engedu.sid',
  secret: config.sessionSecret,
  store,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

// Biến dùng chung cho mọi view
app.locals.h = helpers;
app.use((req, res, next) => {
  res.locals.path = req.path;
  res.locals.query = req.query;
  next();
});
app.use(auth.loadUser);

app.use(auth.router);
app.use('/teacher', require('./routes/teacher'));
app.use('/admin', require('./routes/admin'));
app.use('/', require('./routes/client'));

// 404
app.use((req, res) => {
  res.status(404).render('client/404', { title: 'Không tìm thấy trang' });
});

// Lỗi chung
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render('client/error', { title: 'Có lỗi xảy ra', message: 'Hệ thống gặp sự cố, vui lòng thử lại sau.' });
});

async function start() {
  await db.initSchema();
  await db.syncAdmin();
  app.listen(config.port, () => {
    console.log(`EngEdu đang chạy tại http://localhost:${config.port}`);
    console.log(`Admin: ${config.admin.email}`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Không khởi động được máy chủ:', err.message);
    console.error('Kiểm tra MySQL đã chạy và thông tin trong config.local.js.');
    process.exit(1);
  });
}

module.exports = app;
