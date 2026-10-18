// Sao chép file này thành config.local.js rồi sửa theo máy của bạn.
// config.local.js đã nằm trong .gitignore nên không bị đẩy lên GitHub.
module.exports = {
  port: 3000,
  sessionSecret: 'mot-chuoi-ngau-nhien-dai',
  db: {
    host: '127.0.0.1',
    port: 3306,
    user: 'engedu',
    password: 'engedu',
    database: 'khoa_hoc_tieng_anh',
  },
  admin: {
    email: 'admin@engedu.vn',
    password: 'Admin@123',
    hoTen: 'Quản trị viên',
  },
  bank: {
    bankId: 'MB',
    accountNo: '0000000000',
    accountName: 'TRUNG TAM ENGEDU',
  },
};
