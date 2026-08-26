const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const store = require('./store');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'yiyu-brushing-secret-2024';
const QQ_APP_ID = process.env.QQ_APP_ID || '1019xxxxx';
const QQ_APP_KEY = process.env.QQ_APP_KEY || '';
const QQ_REDIRECT_URI = process.env.QQ_REDIRECT_URI || '';

// 确保上传目录存在
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '请先登录' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
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

    const existing = store.findOne('users', { username });
    if (existing) return res.status(400).json({ error: '用户名已存在' });

    const hashedPassword = bcrypt.hashSync(password, 10);
    const user = store.insert('users', { username, password: hashedPassword, phone: phone || '', qq: qq || '', balance: 0, role: 'user', avatar: '', status: 1 });

    const token = jwt.sign({ id: user.id, username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    store.insert('messages', { user_id: user.id, title: '欢迎', content: '欢迎来到一屿刷课平台！请先充值再下单哦~', type: 'system', is_read: false });

    const { password: _, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });

    const user = store.findOne('users', { username });
    if (!user) return res.status(400).json({ error: '用户不存在' });
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
      params: { grant_type: 'authorization_code', client_id: QQ_APP_ID, client_secret: QQ_APP_KEY, code, redirect_uri: QQ_REDIRECT_URI, fmt: 'json' }
    });
    const access_token = tokenRes.data.access_token;
    if (!access_token) return res.redirect('/#/?error=qq_login_failed');

    const openidRes = await axios.get('https://graph.qq.com/oauth2.0/me', { params: { access_token, fmt: 'json' } });
    const openid = openidRes.data.openid;

    const userRes = await axios.get('https://graph.qq.com/user/get_user_info', { params: { access_token, oauth_consumer_key: QQ_APP_ID, openid } });
    const nickname = userRes.data.nickname || `QQ用户${openid.slice(-4)}`;
    const avatar = userRes.data.figureurl_qq_2 || userRes.data.figureurl_qq_1 || '';

    let user = store.findOne('users', { qq: openid });
    if (!user) {
      const username = `QQ_${openid.slice(-6)}`;
      const hashedPassword = bcrypt.hashSync(Math.random().toString(), 10);
      user = store.insert('users', { username, password: hashedPassword, qq: openid, avatar, balance: 0, role: 'user', status: 1 });
    } else if (avatar) {
      store.update('users', { id: user.id }, { avatar });
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
    const user = store.findOne('users', { id: req.user.id });
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const { password: _, ...userInfo } = user;
    res.json({ user: userInfo });
  } catch (err) {
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// ===================== 商品路由 =====================

// ===== 图片上传 =====
app.post('/api/admin/upload', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { image, filename } = req.body;
    if (!image) return res.status(400).json({ error: '图片数据不能为空' });

    // 解析 base64 图片
    let base64Data = image;
    let ext = 'png';
    if (image.includes(';base64,')) {
      const parts = image.split(';base64,');
      const typeMatch = parts[0].match(/data:image\/(\w+)/);
      if (typeMatch) ext = typeMatch[1];
      base64Data = parts[1];
    }

    // 生成文件名
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 8);
    const fname = filename ? filename.replace(/[^a-zA-Z0-9_.-]/g, '_') : `img_${ts}_${rand}.${ext}`;
    const filePath = path.join(UPLOAD_DIR, fname);

    // 写入文件
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);

    res.json({ url: `/uploads/${fname}`, filename: fname });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: '上传失败' });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const { category, keyword, sort, page = 1, pageSize = 100 } = req.query;
    const conditions = { status: 1 };
    if (category && category !== '全部') conditions.category = category;
    if (keyword) conditions.title = { $like: keyword };

    const options = { sort: {}, limit: parseInt(pageSize), offset: (parseInt(page) - 1) * parseInt(pageSize) };
    if (sort === 'price_asc') options.sort.price = 'asc';
    else if (sort === 'price_desc') options.sort.price = 'desc';
    else if (sort === 'sales') options.sort.sales = 'desc';
    else { options.sort.sort_order = 'asc'; options.sort.id = 'asc'; }

    const result = store.findMany('products', conditions, options);
    res.json({ products: result.rows, total: result.total });
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ error: '获取商品列表失败' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = store.findOne('products', { id: parseInt(req.params.id), status: 1 });
    if (!product) return res.status(404).json({ error: '商品不存在' });
    res.json({ product });
  } catch (err) {
    res.status(500).json({ error: '获取商品详情失败' });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const result = store.findMany('categories', { status: 1 }, { sort: { sort_order: 'asc' } });
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
    const product = store.findOne('products', { id: parseInt(productId), status: 1 });
    if (!product) return res.status(400).json({ error: '商品不存在或已下架' });

    const total = parseFloat(product.price) * qty;
    const user = store.findOne('users', { id: req.user.id });
    if (parseFloat(user.balance) < total) return res.status(400).json({ error: '余额不足，请先充值' });

    const orderNo = generateOrderNo();
    const order = store.insert('orders', {
      order_no: orderNo, user_id: req.user.id, product_id: parseInt(productId),
      product_title: product.title, price: product.price, quantity: qty, total,
      account, password_hint: passwordHint || '', remark: remark || '',
      status: 'paid', progress: 'processing'
    });

    store.update('users', { id: req.user.id }, { balance: { $inc: -total } });
    store.update('products', { id: parseInt(productId) }, { sales: { $inc: qty } });
    store.insert('messages', { user_id: req.user.id, title: '下单成功', content: `您的订单 ${orderNo} 已创建，商品：${product.title}，金额：${total.toFixed(4)}元`, type: 'order', is_read: false });

    res.json({ order });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: '创建订单失败' });
  }
});

app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    const { status, page = 1, pageSize = 10 } = req.query;
    const conditions = { user_id: req.user.id };
    if (status && status !== 'all') conditions.status = status;
    const result = store.findMany('orders', conditions, {
      sort: { created_at: 'desc' },
      limit: parseInt(pageSize),
      offset: (parseInt(page) - 1) * parseInt(pageSize)
    });
    res.json({ orders: result.rows, total: result.total });
  } catch (err) {
    res.status(500).json({ error: '获取订单失败' });
  }
});

app.get('/api/orders/progress', authMiddleware, async (req, res) => {
  try {
    const { orderNo } = req.query;
    const conditions = { user_id: req.user.id };
    const result = store.findMany('orders', conditions, { sort: { created_at: 'desc' } });
    let rows = result.rows;
    if (orderNo) rows = rows.filter(o => o.order_no && o.order_no.includes(orderNo));
    res.json({ progress: rows.map(r => ({ order_no: r.order_no, product_title: r.product_title, status: r.status, progress: r.progress, created_at: r.created_at, updated_at: r.updated_at })) });
  } catch (err) {
    res.status(500).json({ error: '查询进度失败' });
  }
});

// ===================== 充值路由 =====================

app.get('/api/recharge/packages', async (req, res) => {
  try {
    const result = store.findMany('recharge_packages', { status: 1 }, { sort: { sort_order: 'asc' } });
    res.json({ packages: result.rows });
  } catch (err) {
    res.status(500).json({ error: '获取充值套餐失败' });
  }
});

app.post('/api/recharge', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const pkg = store.findOne('recharge_packages', { amount: parseFloat(amount), status: 1 });
    const bonus = pkg ? parseFloat(pkg.bonus) : 0;
    const recharge = store.insert('recharges', { user_id: req.user.id, amount: parseFloat(amount), bonus, method: 'alipay', status: 'pending' });
    res.json({ recharge, payUrl: `/pay?rechargeId=${recharge.id}&amount=${amount}`, message: '请在新页面完成支付' });
  } catch (err) {
    res.status(500).json({ error: '创建充值订单失败' });
  }
});

app.post('/api/recharge/confirm', authMiddleware, async (req, res) => {
  try {
    const { rechargeId } = req.body;
    const recharge = store.findOne('recharges', { id: parseInt(rechargeId), user_id: req.user.id, status: 'pending' });
    if (!recharge) return res.status(400).json({ error: '充值订单不存在或已处理' });
    const totalAmount = parseFloat(recharge.amount) + parseFloat(recharge.bonus);

    store.update('recharges', { id: recharge.id }, { status: 'success' });
    store.update('users', { id: req.user.id }, { balance: { $inc: totalAmount } });
    store.insert('messages', { user_id: req.user.id, title: '充值成功', content: `充值${recharge.amount}元，赠送${recharge.bonus}元，到账${totalAmount}元`, type: 'recharge', is_read: false });

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
    const card = store.findOne('card_keys', { card_no: cardNo });
    if (!card) return res.status(400).json({ error: '卡密不存在' });
    if (card.status === 'used') return res.status(400).json({ error: '卡密已被使用' });

    store.update('card_keys', { id: card.id }, { status: 'used', used_by: req.user.id, used_at: new Date().toISOString() });
    store.update('users', { id: req.user.id }, { balance: { $inc: parseFloat(card.card_value) } });
    store.insert('messages', { user_id: req.user.id, title: '卡密兑换成功', content: `卡密兑换成功，到账${card.card_value}元`, type: 'system', is_read: false });

    res.json({ success: true, message: `兑换成功！到账${card.card_value}元` });
  } catch (err) {
    res.status(500).json({ error: '兑换失败' });
  }
});

// ===================== 公告/Banner/其他 =====================

app.get('/api/announcements', async (req, res) => {
  try {
    const result = store.findMany('announcements', { status: 1 }, { sort: { sort_order: 'asc' } });
    res.json({ announcements: result.rows });
  } catch (err) {
    res.status(500).json({ error: '获取公告失败' });
  }
});

app.get('/api/banners', async (req, res) => {
  try {
    const result = store.findMany('banners', { status: 1 }, { sort: { sort_order: 'asc' } });
    res.json({ banners: result.rows });
  } catch (err) {
    res.status(500).json({ error: '获取Banner失败' });
  }
});

app.get('/api/qq-groups', async (req, res) => {
  try {
    const result = store.findMany('qq_groups', { status: 1 }, { sort: { sort_order: 'asc' } });
    res.json({ groups: result.rows });
  } catch (err) {
    res.status(500).json({ error: '获取QQ群失败' });
  }
});

app.get('/api/pay-settings', async (req, res) => {
  try {
    const settings = store.findOne('pay_settings', { id: 1 });
    res.json({ settings: settings || {} });
  } catch (err) {
    res.status(500).json({ error: '获取支付设置失败' });
  }
});

app.get('/api/site-settings', async (req, res) => {
  try {
    const settings = store.findOne('site_settings', { id: 1 });
    res.json({ settings: settings || {} });
  } catch (err) {
    res.status(500).json({ error: '获取站点设置失败' });
  }
});

app.get('/api/messages', authMiddleware, async (req, res) => {
  try {
    const result = store.findMany('messages', { user_id: req.user.id }, { sort: { created_at: 'desc' } });
    res.json({ messages: result.rows });
  } catch (err) {
    res.status(500).json({ error: '获取消息失败' });
  }
});

app.post('/api/messages/read', authMiddleware, async (req, res) => {
  try {
    const { id } = req.body;
    store.update('messages', { id: parseInt(id), user_id: req.user.id }, { is_read: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '操作失败' });
  }
});

// ===================== 拼团/红包 =====================

app.get('/api/group-buys', async (req, res) => {
  try {
    const now = new Date().toISOString();
    const result = store.findMany('group_buys', { status: 'active' });
    const active = result.rows.filter(g => !g.end_time || g.end_time > now);
    res.json({ groupBuys: active });
  } catch (err) {
    res.status(500).json({ error: '获取拼团失败' });
  }
});

app.get('/api/red-packets', authMiddleware, async (req, res) => {
  try {
    const result = store.findMany('red_packets', { status: 1 });
    const packets = result.rows.map(p => {
      const claimed = store.findOne('user_red_packets', { user_id: req.user.id, packet_id: p.id });
      return { ...p, user_status: claimed ? 'claimed' : 'available' };
    });
    res.json({ packets });
  } catch (err) {
    res.status(500).json({ error: '获取红包失败' });
  }
});

app.post('/api/red-packets/claim', authMiddleware, async (req, res) => {
  try {
    const { packetId } = req.body;
    const packet = store.findOne('red_packets', { id: parseInt(packetId), status: 1 });
    if (!packet || packet.remaining <= 0) return res.status(400).json({ error: '红包不存在或已抢完' });

    const already = store.findOne('user_red_packets', { user_id: req.user.id, packet_id: parseInt(packetId) });
    if (already) return res.status(400).json({ error: '您已领取过该红包' });

    store.update('red_packets', { id: packet.id }, { remaining: { $inc: -1 } });
    store.insert('user_red_packets', { user_id: req.user.id, packet_id: parseInt(packetId), status: 'unused' });
    store.update('users', { id: req.user.id }, { balance: { $inc: parseFloat(packet.amount) } });

    res.json({ success: true, message: `领取成功！${packet.amount}元已到账` });
  } catch (err) {
    res.status(500).json({ error: '领取红包失败' });
  }
});

// ===================== 后台管理路由 =====================

app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const stats = {
      users: store.count('users', { role: 'user' }),
      orders: store.count('orders'),
      revenue: store.sum('orders', 'total'),
      products: store.count('products'),
      rechargeTotal: store.sum('recharges', 'amount') + store.sum('recharges', 'bonus'),
      todayOrders: store.findMany('orders', {}).rows.filter(o => o.created_at && o.created_at.startsWith(today)).length,
    };
    const recentResult = store.findMany('orders', {}, { sort: { created_at: 'desc' }, limit: 10 });
    const recentOrders = recentResult.rows.map(o => {
      const user = store.findOne('users', { id: o.user_id });
      return { ...o, username: user ? user.username : 'unknown' };
    });
    res.json({ stats, recentOrders });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword } = req.query;
    const result = store.findMany('users', {}, { sort: { created_at: 'desc' }, limit: parseInt(pageSize), offset: (parseInt(page) - 1) * parseInt(pageSize) });
    let users = result.rows.map(u => { const { password: _, ...info } = u; return info; });
    if (keyword) users = users.filter(u => (u.username || '').toLowerCase().includes(keyword.toLowerCase()) || (u.phone || '').includes(keyword) || (u.qq || '').includes(keyword));
    res.json({ users, total: result.total });
  } catch (err) {
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

app.post('/api/admin/users/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    store.update('users', { id: parseInt(req.params.id) }, { status: req.body.status });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '操作失败' });
  }
});

app.post('/api/admin/users/:id/balance', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { amount, action } = req.body;
    if (action === 'add') store.update('users', { id: parseInt(req.params.id) }, { balance: { $inc: parseFloat(amount) } });
    else store.update('users', { id: parseInt(req.params.id) }, { balance: { $inc: -parseFloat(amount) } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '操作失败' });
  }
});

app.get('/api/admin/products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const result = store.findMany('products', {}, { sort: { created_at: 'desc' }, limit: parseInt(pageSize), offset: (parseInt(page) - 1) * parseInt(pageSize) });
    res.json({ products: result.rows, total: result.total });
  } catch (err) {
    res.status(500).json({ error: '获取商品列表失败' });
  }
});

app.post('/api/admin/products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, description, price, originalPrice, image, category, stock, isHot, isNew } = req.body;
    const product = store.insert('products', {
      title, description: description || '', price, original_price: originalPrice || null,
      image: image || '', category: category || '常用', stock: stock || 999999,
      is_hot: isHot || false, is_new: isNew || false, sort_order: 0, status: 1
    });
    res.json({ product });
  } catch (err) {
    res.status(500).json({ error: '创建商品失败' });
  }
});

app.put('/api/admin/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, description, price, originalPrice, image, category, stock, isHot, isNew, status } = req.body;
    store.update('products', { id: parseInt(req.params.id) }, {
      title, description: description || '', price, original_price: originalPrice || null,
      image: image || '', category: category || '常用', stock: stock || 999999,
      is_hot: isHot || false, is_new: isNew || false, status: status || 1
    });
    const product = store.findOne('products', { id: parseInt(req.params.id) });
    res.json({ product });
  } catch (err) {
    res.status(500).json({ error: '更新商品失败' });
  }
});

app.delete('/api/admin/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    store.update('products', { id: parseInt(req.params.id) }, { status: 0 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除失败' });
  }
});

app.get('/api/admin/orders', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status } = req.query;
    const conditions = {};
    if (status && status !== 'all') conditions.status = status;
    const result = store.findMany('orders', conditions, { sort: { created_at: 'desc' }, limit: parseInt(pageSize), offset: (parseInt(page) - 1) * parseInt(pageSize) });
    const orders = result.rows.map(o => {
      const user = store.findOne('users', { id: o.user_id });
      return { ...o, username: user ? user.username : 'unknown' };
    });
    res.json({ orders, total: result.total });
  } catch (err) {
    res.status(500).json({ error: '获取订单失败' });
  }
});

app.post('/api/admin/orders/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, progress } = req.body;
    const updates = {};
    if (status) updates.status = status;
    if (progress) updates.progress = progress;
    store.update('orders', { id: parseInt(req.params.id) }, updates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '操作失败' });
  }
});

app.post('/api/admin/announcements', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, content, sortOrder } = req.body;
    const announcement = store.insert('announcements', { title, content, sort_order: sortOrder || 0, status: 1 });
    res.json({ announcement });
  } catch (err) {
    res.status(500).json({ error: '创建公告失败' });
  }
});

app.delete('/api/admin/announcements/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    store.update('announcements', { id: parseInt(req.params.id) }, { status: 0 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除失败' });
  }
});

app.post('/api/admin/banners', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { image, link, sortOrder } = req.body;
    const banner = store.insert('banners', { image, link: link || '', sort_order: sortOrder || 0, status: 1 });
    res.json({ banner });
  } catch (err) {
    res.status(500).json({ error: '创建Banner失败' });
  }
});

app.delete('/api/admin/banners/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    store.update('banners', { id: parseInt(req.params.id) }, { status: 0 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除失败' });
  }
});

app.post('/api/admin/cards', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { count, value } = req.body;
    const cards = [];
    for (let i = 0; i < count; i++) {
      const cardNo = 'YY' + Date.now().toString().slice(-8) + Math.random().toString(36).substring(2, 8).toUpperCase();
      store.insert('card_keys', { card_no: cardNo, card_value: parseFloat(value), status: 'unused' });
      cards.push(cardNo);
    }
    res.json({ success: true, cards });
  } catch (err) {
    res.status(500).json({ error: '生成卡密失败' });
  }
});

app.get('/api/admin/cards', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = store.findMany('card_keys', {}, { sort: { created_at: 'desc' }, limit: 100 });
    const cards = result.rows.map(c => {
      if (c.used_by) {
        const user = store.findOne('users', { id: c.used_by });
        return { ...c, used_username: user ? user.username : null };
      }
      return c;
    });
    res.json({ cards });
  } catch (err) {
    res.status(500).json({ error: '获取卡密失败' });
  }
});

// QQ群管理
app.get('/api/admin/qq-groups', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = store.findMany('qq_groups', {}, { sort: { sort_order: 'asc' } });
    res.json({ groups: result.rows });
  } catch (err) {
    res.status(500).json({ error: '获取QQ群列表失败' });
  }
});

app.post('/api/admin/qq-groups', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { group_no, name, sort_order } = req.body;
    if (!group_no) return res.status(400).json({ error: '群号不能为空' });
    const group = store.insert('qq_groups', {
      group_no,
      name: name || 'QQ群',
      sort_order: sort_order || 0,
      status: 1
    });
    res.json({ group });
  } catch (err) {
    res.status(500).json({ error: '添加QQ群失败' });
  }
});

app.put('/api/admin/qq-groups/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { group_no, name, sort_order, status } = req.body;
    const updates = {};
    if (group_no !== undefined) updates.group_no = group_no;
    if (name !== undefined) updates.name = name;
    if (sort_order !== undefined) updates.sort_order = sort_order;
    if (status !== undefined) updates.status = status;
    store.update('qq_groups', { id: parseInt(req.params.id) }, updates);
    const group = store.findOne('qq_groups', { id: parseInt(req.params.id) });
    res.json({ group });
  } catch (err) {
    res.status(500).json({ error: '更新QQ群失败' });
  }
});

app.delete('/api/admin/qq-groups/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    store.remove('qq_groups', { id: parseInt(req.params.id) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除失败' });
  }
});

// 支付设置管理
app.get('/api/admin/pay-settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const settings = store.findOne('pay_settings', { id: 1 });
    res.json({ settings: settings || {} });
  } catch (err) {
    res.status(500).json({ error: '获取支付设置失败' });
  }
});

app.put('/api/admin/pay-settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { wechat_qr, alipay_qr, pay_title, pay_tip, success_title, success_content, success_redirect_url, wechat_account, alipay_account } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (wechat_qr !== undefined) updates.wechat_qr = wechat_qr;
    if (alipay_qr !== undefined) updates.alipay_qr = alipay_qr;
    if (pay_title !== undefined) updates.pay_title = pay_title;
    if (pay_tip !== undefined) updates.pay_tip = pay_tip;
    if (success_title !== undefined) updates.success_title = success_title;
    if (success_content !== undefined) updates.success_content = success_content;
    if (success_redirect_url !== undefined) updates.success_redirect_url = success_redirect_url;
    if (wechat_account !== undefined) updates.wechat_account = wechat_account;
    if (alipay_account !== undefined) updates.alipay_account = alipay_account;

    const existing = store.findOne('pay_settings', { id: 1 });
    if (existing) {
      store.update('pay_settings', { id: 1 }, updates);
    } else {
      store.insert('pay_settings', { id: 1, ...updates });
    }
    const settings = store.findOne('pay_settings', { id: 1 });
    res.json({ settings });
  } catch (err) {
    console.error('Update pay settings error:', err);
    res.status(500).json({ error: '更新支付设置失败' });
  }
});

// 站点设置管理
app.get('/api/admin/site-settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const settings = store.findOne('site_settings', { id: 1 });
    res.json({ settings: settings || {} });
  } catch (err) {
    res.status(500).json({ error: '获取站点设置失败' });
  }
});

app.put('/api/admin/site-settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { site_name, site_desc, service_phone, service_qq, footer_text } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (site_name !== undefined) updates.site_name = site_name;
    if (site_desc !== undefined) updates.site_desc = site_desc;
    if (service_phone !== undefined) updates.service_phone = service_phone;
    if (service_qq !== undefined) updates.service_qq = service_qq;
    if (footer_text !== undefined) updates.footer_text = footer_text;

    const existing = store.findOne('site_settings', { id: 1 });
    if (existing) {
      store.update('site_settings', { id: 1 }, updates);
    } else {
      store.insert('site_settings', { id: 1, ...updates });
    }
    const settings = store.findOne('site_settings', { id: 1 });
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: '更新站点设置失败' });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

async function start() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`一屿刷课平台 running on port ${PORT}`);
    console.log(`Admin: username=yiyuwenhua, password=lch200707175412`);
  });
  try {
    store.initData();
    console.log('JSON database initialized');
  } catch (err) {
    console.error('Database init failed:', err.message);
  }
}

start();
