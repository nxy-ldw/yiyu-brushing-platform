const express = require('express');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { pool, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'yiyu-brushing-secret-2024';
const QQ_APP_ID = process.env.QQ_APP_ID || '1019xxxxx';
const QQ_APP_KEY = process.env.QQ_APP_KEY || '';
const QQ_REDIRECT_URI = process.env.QQ_REDIRECT_URI || '';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '请先登录' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  next();
}

function generateOrderNo() {
  const now = new Date();
  const ts = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return 'YY' + ts + rand;
}

// ===================== 认证路由 =====================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, phone, qq } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    if (username.length < 3) return res.status(400).json({ error: '用户名至少3个字符' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少6个字符' });

    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) return res.status(400).json({ error: '用户名已存在' });

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password, phone, qq) VALUES ($1, $2, $3, $4) RETURNING id, username, phone, qq, balance, role',
      [username, hashedPassword, phone || '', qq || '']
    );

    const token = jwt.sign({ id: result.rows[0].id, username, role: result.rows[0].role }, JWT_SECRET, { expiresIn: '7d' });
    await pool.query("INSERT INTO messages (user_id, title, content, type) VALUES ($1, '欢迎', '欢迎来到一屿刷课平台！请先充值再下单哦~', 'system')", [result.rows[0].id]);

    res.json({ token, user: result.rows[0] });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });

    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(400).json({ error: '用户不存在' });

    const user = result.rows[0];
    if (user.status === 0) return res.status(400).json({ error: '账号已被封禁' });
    if (!bcrypt.compareSync(password, user.password)) return res.status(400).json({ error: '密码错误' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    const { password: _, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

app.get('/api/auth/qq/redirect', (req, res) => {
  const state = Math.random().toString(36).substring(2);
  const authUrl = `https://graph.qq.com/oauth2.0/authorize?response_type=code&client_id=${QQ_APP_ID}&redirect_uri=${encodeURIComponent(QQ_REDIRECT_URI)}&state=${state}&scope=get_user_info`;
  res.json({ authUrl, state });
});

app.get('/api/auth/qq/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect('/#/?error=qq_login_failed');

    const tokenRes = await axios.get('https://graph.qq.com/oauth2.0/token', {
      params: {
        grant_type: 'authorization_code',
        client_id: QQ_APP_ID,
        client_secret: QQ_APP_KEY,
        code,
        redirect_uri: QQ_REDIRECT_URI,
        fmt: 'json'
      }
    });

    const access_token = tokenRes.data.access_token;
    if (!access_token) return res.redirect('/#/?error=qq_login_failed');

    const openidRes = await axios.get('https://graph.qq.com/oauth2.0/me', {
      params: { access_token, fmt: 'json' }
    });
    const openid = openidRes.data.openid;

    const userRes = await axios.get('https://graph.qq.com/user/get_user_info', {
      params: { access_token, oauth_consumer_key: QQ_APP_ID, openid }
    });
    const nickname = userRes.data.nickname || `QQ用户${openid.slice(-4)}`;
    const avatar = userRes.data.figureurl_qq_2 || userRes.data.figureurl_qq_1 || '';

    let userResult = await pool.query('SELECT * FROM users WHERE qq = $1', [openid]);
    let user;
    if (userResult.rows.length === 0) {
      const username = `QQ_${openid.slice(-6)}`;
      const hashedPassword = bcrypt.hashSync(Math.random().toString(), 10);
      const insertResult = await pool.query(
        'INSERT INTO users (username, password, qq, avatar, balance) VALUES ($1, $2, $3, $4, 0) RETURNING *',
        [username, hashedPassword, openid, avatar]
      );
      user = insertResult.rows[0];
    } else {
      user = userResult.rows[0];
      if (avatar) {
        await pool.query('UPDATE users SET avatar = $1 WHERE id = $2', [avatar, user.id]);
      }
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.redirect(`/#/qq-login?token=${token}&username=${encodeURIComponent(user.username)}`);
  } catch (err) {
    console.error('QQ login error:', err);
    res.redirect('/#/?error=qq_login_failed');
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, phone, qq, balance, role, avatar, status, created_at FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// ===================== 商品路由 =====================

app.get('/api/products', async (req, res) => {
  try {
    const { category, keyword, sort, page = 1, pageSize = 20 } = req.query;
    let query = 'SELECT * FROM products WHERE status = 1';
    const params = [];
    let paramIdx = 1;

    if (category && category !== '全部') {
      query += ` AND category = $${paramIdx++}`;
      params.push(category);
    }
    if (keyword) {
      query += ` AND title ILIKE $${paramIdx++}`;
      params.push(`%${keyword}%`);
    }

    if (sort === 'price_asc') query += ' ORDER BY price ASC';
    else if (sort === 'price_desc') query += ' ORDER BY price DESC';
    else if (sort === 'sales') query += ' ORDER BY sales DESC';
    else query += ' ORDER BY sort_order ASC, id ASC';

    const offset = (page - 1) * pageSize;
    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(pageSize, offset);

    const result = await pool.query(query, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM products WHERE status = 1' + (category && category !== '全部' ? ' AND category = $1' : ''), category && category !== '全部' ? [category] : []);
    res.json({ products: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ error: '获取商品列表失败' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1 AND status = 1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: '商品不存在' });
    res.json({ product: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '获取商品详情失败' });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories WHERE status = 1 ORDER BY sort_order ASC');
    res.json({ categories: result.rows });
  } catch (err) {
    res.status(500).json({ error: '获取分类失败' });
  }
});

// ===================== 订单路由 =====================

app.post('/api/orders', authMiddleware, async (req, res) => {
  try {
    const { productId, quantity, account, passwordHint, remark } = req.body;
    if (!productId) return res.status(400).json({ error: '请选择商品' });
    if (!account) return res.status(400).json({ error: '请填写刷课账号' });

    const qty = quantity || 1;
    const prodResult = await pool.query('SELECT * FROM products WHERE id = $1 AND status = 1', [productId]);
    if (prodResult.rows.length === 0) return res.status(400).json({ error: '商品不存在或已下架' });
    const product = prodResult.rows[0];

    const total = parseFloat(product.price) * qty;
    const userResult = await pool.query('SELECT balance FROM users WHERE id = $1', [req.user.id]);
    if (parseFloat(userResult.rows[0].balance) < total) {
      return res.status(400).json({ error: '余额不足，请先充值' });
    }

    const orderNo = generateOrderNo();
    const orderResult = await pool.query(
      `INSERT INTO orders (order_no, user_id, product_id, product_title, price, quantity, total, account, password_hint, remark, status, progress)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'paid', 'processing') RETURNING *`,
      [orderNo, req.user.id, productId, product.title, product.price, qty, total, account, passwordHint || '', remark || '']
    );

    await pool.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [total, req.user.id]);
    await pool.query('UPDATE products SET sales = sales + $1 WHERE id = $2', [qty, productId]);
    await pool.query("INSERT INTO messages (user_id, title, content, type) VALUES ($1, '下单成功', $2, 'order')", [req.user.id, `您的订单 ${orderNo} 已创建，商品：${product.title}，金额：${total.toFixed(4)}元`]);

    res.json({ order: orderResult.rows[0] });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: '创建订单失败' });
  }
});

app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    const { status, page = 1, pageSize = 10 } = req.query;
    let query = 'SELECT * FROM orders WHERE user_id = $1';
    const params = [req.user.id];
    let paramIdx = 2;
    if (status && status !== 'all') {
      query += ` AND status = $${paramIdx++}`;
      params.push(status);
    }
    query += ' ORDER BY created_at DESC';
    const offset = (page - 1) * pageSize;
    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(pageSize, offset);

    const result = await pool.query(query, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM orders WHERE user_id = $1' + (status && status !== 'all' ? ' AND status = $2' : ''), status && status !== 'all' ? [req.user.id, status] : [req.user.id]);
    res.json({ orders: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: '获取订单失败' });
  }
});

app.get('/api/orders/progress', authMiddleware, async (req, res) => {
  try {
    const { orderNo } = req.query;
    let query = 'SELECT order_no, product_title, status, progress, created_at, updated_at FROM orders WHERE user_id = $1';
    const params = [req.user.id];
    if (orderNo) {
      query += ' AND order_no ILIKE $2';
      params.push(`%${orderNo}%`);
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json({ progress: result.rows });
  } catch (err) {
    res.status(500).json({ error: '查询进度失败' });
  }
});

// ===================== 充值路由 =====================

app.get('/api/recharge/packages', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM recharge_packages WHERE status = 1 ORDER BY sort_order ASC');
    res.json({ packages: result.rows });
  } catch (err) {
    res.status(500).json({ error: '获取充值套餐失败' });
  }
});

app.post('/api/recharge', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const pkgResult = await pool.query('SELECT * FROM recharge_packages WHERE amount = $1 AND status = 1', [amount]);
    let bonus = 0;
    if (pkgResult.rows.length > 0) {
      bonus = parseFloat(pkgResult.rows[0].bonus);
    }
    const totalAmount = parseFloat(amount) + bonus;
    const orderNo = generateOrderNo();

    const result = await pool.query(
      'INSERT INTO recharges (user_id, amount, bonus, method, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.id, amount, bonus, 'alipay', 'pending']
    );

    res.json({
      recharge: result.rows[0],
      payUrl: `/pay?orderNo=${orderNo}&amount=${amount}`,
      message: '请在新页面完成支付'
    });
  } catch (err) {
    res.status(500).json({ error: '创建充值订单失败' });
  }
});

app.post('/api/recharge/confirm', authMiddleware, async (req, res) => {
  try {
    const { rechargeId } = req.body;
    const result = await pool.query('SELECT * FROM recharges WHERE id = $1 AND user_id = $2 AND status = $3', [rechargeId, req.user.id, 'pending']);
    if (result.rows.length === 0) return res.status(400).json({ error: '充值订单不存在或已处理' });
    const recharge = result.rows[0];
    const totalAmount = parseFloat(recharge.amount) + parseFloat(recharge.bonus);

    await pool.query('UPDATE recharges SET status = $1 WHERE id = $2', ['success', rechargeId]);
    await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [totalAmount, req.user.id]);
    await pool.query("INSERT INTO messages (user_id, title, content, type) VALUES ($1, '充值成功', $2, 'recharge')", [req.user.id, `充值${recharge.amount}元，赠送${recharge.bonus}元，到账${totalAmount}元`]);

    res.json({ success: true, message: `充值成功！到账${totalAmount}元` });
  } catch (err) {
    res.status(500).json({ error: '确认充值失败' });
  }
});

// ===================== 卡密兑换 =====================

app.post('/api/redeem', authMiddleware, async (req, res) => {
  try {
    const { cardNo } = req.body;
    if (!cardNo) return res.status(400).json({ error: '请输入卡密' });
    const result = await pool.query('SELECT * FROM card_keys WHERE card_no = $1', [cardNo]);
    if (result.rows.length === 0) return res.status(400).json({ error: '卡密不存在' });
    const card = result.rows[0];
    if (card.status === 'used') return res.status(400).json({ error: '卡密已被使用' });

    await pool.query('UPDATE card_keys SET status = $1, used_by = $2, used_at = CURRENT_TIMESTAMP WHERE id = $3', ['used', req.user.id, card.id]);
    await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [card.card_value, req.user.id]);
    await pool.query("INSERT INTO messages (user_id, title, content, type) VALUES ($1, '卡密兑换成功', $2, 'system')", [req.user.id, `卡密兑换成功，到账${card.card_value}元`]);

    res.json({ success: true, message: `兑换成功！到账${card.card_value}元` });
  } catch (err) {
    res.status(500).json({ error: '兑换失败' });
  }
});

// ===================== 公告/Banner/其他 =====================

app.get('/api/announcements', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM announcements WHERE status = 1 ORDER BY sort_order ASC');
    res.json({ announcements: result.rows });
  } catch (err) {
    res.status(500).json({ error: '获取公告失败' });
  }
});

app.get('/api/banners', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM banners WHERE status = 1 ORDER BY sort_order ASC');
    res.json({ banners: result.rows });
  } catch (err) {
    res.status(500).json({ error: '获取Banner失败' });
  }
});

app.get('/api/qq-groups', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM qq_groups WHERE status = 1 ORDER BY sort_order ASC');
    res.json({ groups: result.rows });
  } catch (err) {
    res.status(500).json({ error: '获取QQ群失败' });
  }
});

app.get('/api/messages', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM messages WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ messages: result.rows });
  } catch (err) {
    res.status(500).json({ error: '获取消息失败' });
  }
});

app.post('/api/messages/read', authMiddleware, async (req, res) => {
  try {
    const { id } = req.body;
    await pool.query('UPDATE messages SET is_read = true WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '操作失败' });
  }
});

// ===================== 拼团/红包 =====================

app.get('/api/group-buys', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT gb.*, p.title as product_title, p.image as product_image
      FROM group_buys gb
      LEFT JOIN products p ON gb.product_id = p.id
      WHERE gb.status = 'active' AND gb.end_time > CURRENT_TIMESTAMP
      ORDER BY gb.created_at DESC
    `);
    res.json({ groupBuys: result.rows });
  } catch (err) {
    res.status(500).json({ error: '获取拼团失败' });
  }
});

app.get('/api/red-packets', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT rp.*, urp.status as user_status
      FROM red_packets rp
      LEFT JOIN user_red_packets urp ON urp.packet_id = rp.id AND urp.user_id = $1
      WHERE rp.status = 1
      ORDER BY rp.created_at DESC
    `, [req.user.id]);
    res.json({ packets: result.rows });
  } catch (err) {
    res.status(500).json({ error: '获取红包失败' });
  }
});

app.post('/api/red-packets/claim', authMiddleware, async (req, res) => {
  try {
    const { packetId } = req.body;
    const packetResult = await pool.query('SELECT * FROM red_packets WHERE id = $1 AND status = 1 AND remaining > 0', [packetId]);
    if (packetResult.rows.length === 0) return res.status(400).json({ error: '红包不存在或已抢完' });
    const packet = packetResult.rows[0];

    const checkResult = await pool.query('SELECT id FROM user_red_packets WHERE user_id = $1 AND packet_id = $2', [req.user.id, packetId]);
    if (checkResult.rows.length > 0) return res.status(400).json({ error: '您已领取过该红包' });

    await pool.query('UPDATE red_packets SET remaining = remaining - 1 WHERE id = $1', [packetId]);
    await pool.query('INSERT INTO user_red_packets (user_id, packet_id) VALUES ($1, $2)', [req.user.id, packetId]);
    await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [packet.amount, req.user.id]);

    res.json({ success: true, message: `领取成功！${packet.amount}元已到账` });
  } catch (err) {
    res.status(500).json({ error: '领取红包失败' });
  }
});

// ===================== 后台管理路由 =====================

app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userCount = await pool.query('SELECT COUNT(*) as cnt FROM users WHERE role = $1', ['user']);
    const orderCount = await pool.query('SELECT COUNT(*) as cnt FROM orders');
    const totalRevenue = await pool.query('SELECT COALESCE(SUM(total), 0) as total FROM orders');
    const productCount = await pool.query('SELECT COUNT(*) as cnt FROM products');
    const rechargeTotal = await pool.query('SELECT COALESCE(SUM(amount + bonus), 0) as total FROM recharges WHERE status = $1', ['success']);
    const todayOrders = await pool.query("SELECT COUNT(*) as cnt FROM orders WHERE created_at::date = CURRENT_DATE");
    const recentOrders = await pool.query(`
      SELECT o.*, u.username FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC LIMIT 10
    `);

    res.json({
      stats: {
        users: parseInt(userCount.rows[0].cnt),
        orders: parseInt(orderCount.rows[0].cnt),
        revenue: parseFloat(totalRevenue.rows[0].total),
        products: parseInt(productCount.rows[0].cnt),
        rechargeTotal: parseFloat(rechargeTotal.rows[0].total),
        todayOrders: parseInt(todayOrders.rows[0].cnt)
      },
      recentOrders: recentOrders.rows
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

// Admin Users
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword } = req.query;
    let query = "SELECT id, username, phone, qq, balance, role, avatar, status, created_at FROM users WHERE 1=1";
    const params = [];
    let paramIdx = 1;
    if (keyword) {
      query += ` AND (username ILIKE $${paramIdx} OR phone ILIKE $${paramIdx} OR qq ILIKE $${paramIdx})`;
      params.push(`%${keyword}%`);
      paramIdx++;
    }
    query += ' ORDER BY created_at DESC';
    const offset = (page - 1) * pageSize;
    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(pageSize, offset);
    const result = await pool.query(query, params);
    const countQuery = "SELECT COUNT(*) FROM users WHERE 1=1" + (keyword ? " AND (username ILIKE $1 OR phone ILIKE $1 OR qq ILike $1)" : "");
    const countResult = await pool.query(countQuery, keyword ? [`%${keyword}%`] : []);
    res.json({ users: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

app.post('/api/admin/users/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    await pool.query('UPDATE users SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '操作失败' });
  }
});

app.post('/api/admin/users/:id/balance', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { amount, action } = req.body;
    if (action === 'add') {
      await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, req.params.id]);
    } else {
      await pool.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, req.params.id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '操作失败' });
  }
});

// Admin Products
app.get('/api/admin/products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;
    const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC LIMIT $1 OFFSET $2', [pageSize, offset]);
    const countResult = await pool.query('SELECT COUNT(*) FROM products');
    res.json({ products: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: '获取商品列表失败' });
  }
});

app.post('/api/admin/products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, description, price, originalPrice, image, category, stock, isHot, isNew } = req.body;
    const result = await pool.query(
      `INSERT INTO products (title, description, price, original_price, image, category, stock, is_hot, is_new)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [title, description || '', price, originalPrice || null, image || '', category || '常用', stock || 999999, isHot || false, isNew || false]
    );
    res.json({ product: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '创建商品失败' });
  }
});

app.put('/api/admin/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, description, price, originalPrice, image, category, stock, isHot, isNew, status } = req.body;
    const result = await pool.query(
      `UPDATE products SET title = $1, description = $2, price = $3, original_price = $4, image = $5, category = $6, stock = $7, is_hot = $8, is_new = $9, status = $10, updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 RETURNING *`,
      [title, description || '', price, originalPrice || null, image || '', category || '常用', stock || 999999, isHot || false, isNew || false, status || 1, req.params.id]
    );
    res.json({ product: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '更新商品失败' });
  }
});

app.delete('/api/admin/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE products SET status = 0 WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除失败' });
  }
});

// Admin Orders
app.get('/api/admin/orders', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status } = req.query;
    let query = `SELECT o.*, u.username FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE 1=1`;
    const params = [];
    let paramIdx = 1;
    if (status && status !== 'all') {
      query += ` AND o.status = $${paramIdx++}`;
      params.push(status);
    }
    query += ' ORDER BY o.created_at DESC';
    const offset = (page - 1) * pageSize;
    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(pageSize, offset);
    const result = await pool.query(query, params);
    res.json({ orders: result.rows });
  } catch (err) {
    res.status(500).json({ error: '获取订单失败' });
  }
});

app.post('/api/admin/orders/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, progress } = req.body;
    const updates = [];
    const params = [];
    let idx = 1;
    if (status) { updates.push(`status = $${idx++}`); params.push(status); }
    if (progress) { updates.push(`progress = $${idx++}`); params.push(progress); }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);
    await pool.query(`UPDATE orders SET ${updates.join(', ')} WHERE id = $${idx}`, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '操作失败' });
  }
});

// Admin Announcements
app.post('/api/admin/announcements', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, content, sortOrder } = req.body;
    const result = await pool.query(
      'INSERT INTO announcements (title, content, sort_order) VALUES ($1, $2, $3) RETURNING *',
      [title, content, sortOrder || 0]
    );
    res.json({ announcement: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '创建公告失败' });
  }
});

app.delete('/api/admin/announcements/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE announcements SET status = 0 WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除失败' });
  }
});

// Admin Banners
app.post('/api/admin/banners', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { image, link, sortOrder } = req.body;
    const result = await pool.query(
      'INSERT INTO banners (image, link, sort_order) VALUES ($1, $2, $3) RETURNING *',
      [image, link || '', sortOrder || 0]
    );
    res.json({ banner: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: '创建Banner失败' });
  }
});

app.delete('/api/admin/banners/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE banners SET status = 0 WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除失败' });
  }
});

// Admin Card Keys
app.post('/api/admin/cards', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { count, value } = req.body;
    const cards = [];
    for (let i = 0; i < count; i++) {
      const cardNo = 'YY' + Date.now().toString().slice(-8) + Math.random().toString(36).substring(2, 8).toUpperCase();
      await pool.query('INSERT INTO card_keys (card_no, card_value) VALUES ($1, $2)', [cardNo, value]);
      cards.push(cardNo);
    }
    res.json({ success: true, cards });
  } catch (err) {
    res.status(500).json({ error: '生成卡密失败' });
  }
});

app.get('/api/admin/cards', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT ck.*, u.username as used_username FROM card_keys ck LEFT JOIN users u ON ck.used_by = u.id ORDER BY ck.created_at DESC LIMIT 100');
    res.json({ cards: result.rows });
  } catch (err) {
    res.status(500).json({ error: '获取卡密失败' });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// Start server
async function start() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`一屿刷课平台 running on port ${PORT}`);
    console.log(`Admin: username=yiyuwenhua, password=lch200707175412`);
  });
  try {
    await initDB();
    console.log('Database connected and initialized');
  } catch (err) {
    console.error('Database init failed (will retry on next request):', err.message);
    console.error('Make sure DATABASE_URL is set. Frontend will still be accessible.');
  }
}

start();
