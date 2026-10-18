// Cấu hình chung. Thông tin riêng (tài khoản Admin, tài khoản ngân hàng) đặt trong
// config.local.js (không đưa lên GitHub) hoặc biến môi trường.
const path = require('path');

let local = {};
try {
  local = require('./config.local');
} catch (e) {
  if (e.code !== 'MODULE_NOT_FOUND') throw e;
}

const env = process.env;

const config = {
  port: Number(env.PORT || local.port || 3000),
  sessionSecret: env.SESSION_SECRET || local.sessionSecret || 'doi-chuoi-bi-mat-nay',

  // File CSDL SQLite, tự tạo nếu chưa có
  dbFile: env.DB_FILE || local.dbFile || path.join(__dirname, 'data', 'engedu.db'),

  // Tài khoản Admin duy nhất, cố định. Được đồng bộ vào CSDL mỗi lần khởi động.
  admin: {
    email: env.ADMIN_EMAIL || local.admin?.email || 'admin@engedu.vn',
    password: env.ADMIN_PASSWORD || local.admin?.password || 'Admin@123',
    hoTen: local.admin?.hoTen || 'Quản trị viên',
  },

  // Tài khoản nhận tiền hiển thị trên mã QR VietQR.
  bank: {
    bankId: local.bank?.bankId || 'MB',
    accountNo: local.bank?.accountNo || '0000000000',
    accountName: local.bank?.accountName || 'TRUNG TAM ENGEDU',
  },

  security: {
    maxLoginFails: 5,
    lockMinutes: 15,
  },

  // Thời gian giữ chỗ cho đơn "Chờ thanh toán" (phút)
  holdMinutes: 15,
};

module.exports = config;
