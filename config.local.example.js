// Sao chép file này thành config.local.js rồi sửa theo máy của bạn (không bắt buộc).
// config.local.js đã nằm trong .gitignore nên không bị đẩy lên GitHub.
module.exports = {
  port: 3000,
  sessionSecret: 'mot-chuoi-ngau-nhien-dai',
  // dbFile: 'D:/engedu/engedu.db',   // mặc định: data/engedu.db trong thư mục dự án
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
