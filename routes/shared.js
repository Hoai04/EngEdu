// Chức năng dùng chung cho cả ba phân hệ: xem thông báo, đổi mật khẩu.
const db = require('../db');
const auth = require('../auth');

/**
 * Gắn các route thông báo vào router.
 *   GET  {base}/thong-bao              danh sách
 *   POST {base}/thong-bao/doc-tat-ca   đánh dấu đã đọc
 *   GET  {base}/thong-bao/:id          đánh dấu đã đọc rồi mở liên kết
 */
function mountNotifications(router, view, base = '') {
  router.get('/thong-bao', async (req, res) => {
    const items = await db.query(
      'SELECT * FROM thong_bao WHERE tai_khoan_id = ? ORDER BY ngay_tao DESC, id DESC LIMIT 100',
      [req.user.id],
    );
    res.render(view, { title: 'Thông báo', items, base });
  });

  router.post('/thong-bao/doc-tat-ca', async (req, res) => {
    await db.query('UPDATE thong_bao SET da_doc = TRUE WHERE tai_khoan_id = ?', [req.user.id]);
    res.redirect(`${base}/thong-bao`);
  });

  router.get('/thong-bao/:id', async (req, res) => {
    const tb = await db.one('SELECT * FROM thong_bao WHERE id = ? AND tai_khoan_id = ?', [req.params.id, req.user.id]);
    if (!tb) return res.redirect(`${base}/thong-bao`);
    await db.query('UPDATE thong_bao SET da_doc = TRUE WHERE id = ?', [tb.id]);
    res.redirect(tb.lien_ket && tb.lien_ket.startsWith('/') ? tb.lien_ket : `${base}/thong-bao`);
  });
}

/** Gắn GET/POST {path} đổi mật khẩu. */
function mountPassword(router, path, view) {
  router.get(path, (req, res) => res.render(view, { title: 'Đổi mật khẩu', errors: {} }));
  router.post(path, async (req, res) => {
    const { mat_khau_cu, mat_khau_moi, nhap_lai } = req.body;
    const errors = await auth.changePassword(req.user.id, mat_khau_cu, mat_khau_moi, nhap_lai);
    if (errors) return res.status(400).render(view, { title: 'Đổi mật khẩu', errors });
    auth.flash(req, 'success', 'Đã đổi mật khẩu.');
    res.redirect(req.baseUrl + path);
  });
}

module.exports = { mountNotifications, mountPassword };
