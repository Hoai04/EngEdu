// Chạy web và mở công khai qua Cloudflare Tunnel bằng MỘT lệnh: npm run public
// Bấm Ctrl + C để tắt cả hai.
const { spawn } = require('child_process');
const path = require('path');
const config = require('../config');

const ROOT = path.join(__dirname, '..');
const LOCAL = `http://localhost:${config.port}`;
const children = [];

function stopAll(code = 0) {
  for (const c of children) {
    if (!c.killed) c.kill();
  }
  process.exit(code);
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

// 1. Máy chủ web
const web = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'app.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
children.push(web);
web.stdout.on('data', (d) => process.stdout.write(d));
web.stderr.on('data', (d) => process.stderr.write(d));
web.on('exit', (code) => {
  console.error(`\nMáy chủ web đã dừng (mã ${code}).`);
  stopAll(code || 1);
});

// 2. Đợi web sẵn sàng rồi mở tunnel
async function waitForWeb() {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(LOCAL, { redirect: 'manual' });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

(async () => {
  if (!(await waitForWeb())) {
    console.error('Máy chủ web không khởi động được, không mở tunnel.');
    return stopAll(1);
  }
  const tunnel = spawn('cloudflared', ['tunnel', '--url', LOCAL], { cwd: ROOT, shell: process.platform === 'win32' });
  children.push(tunnel);
  let shown = false;
  const scan = (d) => {
    const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !shown) {
      shown = true;
      console.log('\n==============================================');
      console.log(' Link công khai (gửi cho mọi người):');
      console.log(` ${m[0]}`);
      console.log(' Giữ cửa sổ này mở. Bấm Ctrl + C để tắt.');
      console.log('==============================================\n');
    }
  };
  tunnel.stdout.on('data', scan);
  tunnel.stderr.on('data', scan);
  tunnel.on('error', () => {
    console.error('\nKhông tìm thấy cloudflared. Cài bằng lệnh: winget install --id Cloudflare.cloudflared');
    console.error('Cài xong, mở lại cửa sổ terminal rồi chạy lại: npm run public');
    console.error(`Web vẫn đang chạy trên máy này tại ${LOCAL}`);
  });
  tunnel.on('exit', (code) => {
    if (code !== null && code !== 0) console.error(`\ncloudflared đã dừng (mã ${code}). Web vẫn chạy tại ${LOCAL}`);
  });
})();
