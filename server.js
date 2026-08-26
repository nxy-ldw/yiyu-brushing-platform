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

// Gzip压缩（暂时移除，待确认部署成功后再加）
// app.use(compression());

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 静态资源缓存（1天）
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache'); // HTML不缓存
    }
  }
}));

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
    const user = store.insert('users', { username, password: hashedPassword, phone: phone || '', qq: qq || '', balance: 0, principal_balance: 0, bonus_balance: 0, role: 'user', avatar: '', status: 1 });

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
      user = store.insert('users', { username, password: hashedPassword, qq: openid, avatar, balance: 0, principal_balance: 0, bonus_balance: 0, role: 'user', status: 1 });
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
    const { productId, quantity, account, passwordHint, school, course_name, remark } = req.body;
    if (!productId) return res.status(400).json({ error: '请选择商品' });
    if (!account) return res.status(400).json({ error: '请填写刷课账号' });
    if (!passwordHint) return res.status(400).json({ error: '请填写登录密码' });
    if (!school) return res.status(400).json({ error: '请填写学校名称' });
    if (!course_name) return res.status(400).json({ error: '请填写课程名称' });

    const qty = quantity || 1;
    const product = store.findOne('products', { id: parseInt(productId), status: 1 });
    if (!product) return res.status(400).json({ error: '商品不存在或已下架' });
    const user = store.findOne('users', { id: req.user.id });
    
    // 根据代理等级计算价格
    const agentLevel = user.agent_level || 0;
    let unitPrice = parseFloat(product.price);
    if (agentLevel === 1 && product.bronze_price) unitPrice = parseFloat(product.bronze_price);
    else if (agentLevel === 2 && product.silver_price) unitPrice = parseFloat(product.silver_price);
    else if (agentLevel === 3 && product.gold_price) unitPrice = parseFloat(product.gold_price);

    const total = unitPrice * qty;
    if (parseFloat(user.balance) < total) return res.status(400).json({ error: '余额不足，请先充值' });

    // 先扣本金，再扣赠送金
    let principalDeduct = 0;
    let bonusDeduct = 0;
    const principal = parseFloat(user.principal_balance) || 0;
    const bonus = parseFloat(user.bonus_balance) || 0;
    if (principal >= total) {
      principalDeduct = total;
    } else {
      principalDeduct = principal;
      bonusDeduct = total - principal;
    }

    const orderNo = generateOrderNo();
    const order = store.insert('orders', {
      order_no: orderNo, user_id: req.user.id, product_id: parseInt(productId),
      product_title: product.title, price: unitPrice, quantity: qty, total,
      account, password_hint: passwordHint || '', school: school || '', course_name: course_name || '',
      remark: remark || '',
      status: 'paid', progress: 'processing', agent_level: agentLevel
    });

    store.update('users', { id: req.user.id }, { 
      balance: { $inc: -total },
      principal_balance: { $inc: -principalDeduct },
      bonus_balance: { $inc: -bonusDeduct }
    });
    store.update('products', { id: parseInt(productId) }, { sales: { $inc: qty } });
    store.insert('messages', { user_id: req.user.id, title: '下单成功', content: `您的订单 ${orderNo} 已创建，商品：${product.title}，金额：${total.toFixed(4)}元`, type: 'order', is_read: 0, created_at: new Date().toISOString() });

    // 新订单通知
    sendNotification('【新订单提醒】', 
      `订单号：${orderNo}\n商品：${product.title}\n金额：${total.toFixed(2)}元\n账号：${account}\n学校：${school || '-'}\n课程：${course_name || '-'}\n请及时处理！`);

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
    const { rechargeId, payMethod, txnId } = req.body;
    const recharge = store.findOne('recharges', { id: parseInt(rechargeId), user_id: req.user.id, status: 'pending' });
    if (!recharge) return res.status(400).json({ error: '充值订单不存在或已处理' });
    if (!txnId) return res.status(400).json({ error: '请输入交易单号' });

    // 改为待审核状态，等待管理员确认
    store.update('recharges', { id: recharge.id }, { 
      status: 'waiting_confirm',
      method: payMethod || recharge.method || 'wechat',
      txn_id: txnId,
      confirm_at: new Date().toISOString()
    });

    // 充值审核通知
    const user = store.findOne('users', { id: req.user.id });
    const methodName = payMethod === 'alipay' ? '支付宝' : '微信';
    const totalAmount = parseFloat(recharge.amount) + parseFloat(recharge.bonus || 0);
    sendNotification('【充值审核提醒】', 
      `用户：${user?.username || '未知'}\n手机：${user?.phone || '-'}\n金额：${recharge.amount}元\n赠送：${recharge.bonus || 0}元\n到账：${totalAmount}元\n支付方式：${methodName}\n交易单号：${txnId}\n请及时审核！`);

    res.json({ success: true, message: '已提交支付凭证，请等待管理员审核' });
  } catch (err) {
    res.status(500).json({ error: '提交失败' });
  }
});

// 管理员：充值审核列表
app.get('/api/admin/recharges', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, keyword } = req.query;
    let conditions = {};
    if (status && status !== 'all') conditions.status = status;
    const result = store.findMany('recharges', conditions, { sort: { created_at: 'desc' }, limit: 200 });
    // 关联用户信息
    const rows = result.rows.map(r => {
      const user = store.findOne('users', { id: r.user_id });
      return { ...r, username: user?.username || '', phone: user?.phone || '' };
    });
    if (keyword) {
      const kw = keyword.toLowerCase();
      const filtered = rows.filter(r => 
        r.username?.toLowerCase().includes(kw) || 
        r.phone?.includes(kw) ||
        r.id?.toString().includes(kw)
      );
      res.json({ recharges: filtered });
    } else {
      res.json({ recharges: rows });
    }
  } catch (err) {
    console.error('Get recharges error:', err);
    res.status(500).json({ error: '获取充值列表失败' });
  }
});

// 管理员：审核通过充值
app.post('/api/admin/recharges/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const recharge = store.findOne('recharges', { id: parseInt(req.params.id) });
    if (!recharge) return res.status(404).json({ error: '充值订单不存在' });
    if (recharge.status === 'success') return res.status(400).json({ error: '订单已通过' });
    
    const totalAmount = parseFloat(recharge.amount) + parseFloat(recharge.bonus || 0);
    
    store.update('recharges', { id: recharge.id }, { 
      status: 'success', 
      approved_by: req.user.id,
      approved_at: new Date().toISOString()
    });
    store.update('users', { id: recharge.user_id }, { 
      balance: { $inc: totalAmount },
      principal_balance: { $inc: parseFloat(recharge.amount) },
      bonus_balance: { $inc: parseFloat(recharge.bonus || 0) }
    });
    store.insert('messages', { 
      user_id: recharge.user_id, 
      title: '充值成功', 
      content: `充值${recharge.amount}元，赠送${recharge.bonus || 0}元，到账${totalAmount}元`, 
      type: 'recharge', 
      is_read: false,
      created_at: new Date().toISOString()
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Approve recharge error:', err);
    res.status(500).json({ error: '审核失败' });
  }
});

// 管理员：拒绝充值
app.post('/api/admin/recharges/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;
    const recharge = store.findOne('recharges', { id: parseInt(req.params.id) });
    if (!recharge) return res.status(404).json({ error: '充值订单不存在' });
    if (recharge.status === 'success') return res.status(400).json({ error: '已通过的订单不能拒绝' });
    
    store.update('recharges', { id: recharge.id }, { 
      status: 'rejected', 
      reject_reason: reason || '',
      rejected_by: req.user.id,
      rejected_at: new Date().toISOString()
    });
    store.insert('messages', { 
      user_id: recharge.user_id, 
      title: '充值被驳回', 
      content: `您的${recharge.amount}元充值申请被拒绝。${reason ? '原因：' + reason : ''}`, 
      type: 'system', 
      is_read: false,
      created_at: new Date().toISOString()
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Reject recharge error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// ===================== 提现功能 =====================

const MIN_WITHDRAW = 200;
const WITHDRAW_FEE_RATE = 0.3;

// 用户：提交提现申请
app.post('/api/withdrawals', authMiddleware, async (req, res) => {
  try {
    const { amount, wechat_account, wechat_name, qrcode_image, remark } = req.body;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < MIN_WITHDRAW) return res.status(400).json({ error: `最低提现金额为${MIN_WITHDRAW}元` });
    if (!wechat_account) return res.status(400).json({ error: '请输入微信号' });
    if (!wechat_name) return res.status(400).json({ error: '请输入收款人真实姓名' });

    const user = store.findOne('users', { id: req.user.id });
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const principal = parseFloat(user.principal_balance) || 0;
    if (principal < amt) return res.status(400).json({ error: '可提现余额不足（赠送金不可提现）' });

    const fee = amt * WITHDRAW_FEE_RATE;
    const actualAmount = amt - fee;

    const withdrawNo = 'WD' + Date.now();
    const withdrawal = store.insert('withdrawals', {
      withdraw_no: withdrawNo,
      user_id: req.user.id,
      amount: amt,
      fee: fee,
      actual_amount: actualAmount,
      wechat_account: wechat_account,
      wechat_name: wechat_name,
      qrcode_image: qrcode_image || '',
      remark: remark || '',
      status: 'pending', // pending/approved/rejected/paid
      created_at: new Date().toISOString()
    });

    // 冻结本金（先扣除，审核拒绝则退回）
    store.update('users', { id: req.user.id }, { 
      balance: { $inc: -amt },
      principal_balance: { $inc: -amt }
    });

    store.insert('messages', { 
      user_id: req.user.id, 
      title: '提现申请已提交', 
      content: `您的提现申请${withdrawNo}已提交，金额${amt}元，手续费${fee.toFixed(2)}元，实际到账${actualAmount.toFixed(2)}元。请等待审核，1-3个工作日内处理。`, 
      type: 'system', 
      is_read: false,
      created_at: new Date().toISOString()
    });

    // 提现审核通知
    const wUser = store.findOne('users', { id: req.user.id });
    sendNotification('【提现审核提醒】', 
      `单号：${withdrawNo}\n用户：${wUser?.username || '未知'}\n手机：${wUser?.phone || '-'}\n提现金额：${amt}元\n手续费：${fee.toFixed(2)}元\n实际到账：${actualAmount.toFixed(2)}元\n微信号：${wechat_account}\n姓名：${wechat_name}\n${remark ? '备注：' + remark + '\n' : ''}请及时审核！`);

    res.json({ withdrawal });
  } catch (err) {
    console.error('Create withdrawal error:', err);
    res.status(500).json({ error: '提交失败' });
  }
});

// 用户：提现记录
app.get('/api/withdrawals', authMiddleware, async (req, res) => {
  try {
    const result = store.findMany('withdrawals', { user_id: req.user.id }, { sort: { created_at: 'desc' }, limit: 50 });
    res.json({ withdrawals: result.rows });
  } catch (err) {
    res.status(500).json({ error: '获取失败' });
  }
});

// 管理员：提现审核列表
app.get('/api/admin/withdrawals', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, keyword } = req.query;
    let conditions = {};
    if (status && status !== 'all') conditions.status = status;
    const result = store.findMany('withdrawals', conditions, { sort: { created_at: 'desc' }, limit: 200 });
    const rows = result.rows.map(r => {
      const user = store.findOne('users', { id: r.user_id });
      return { ...r, username: user?.username || '', phone: user?.phone || '' };
    });
    if (keyword) {
      const kw = keyword.toLowerCase();
      const filtered = rows.filter(r => 
        r.username?.toLowerCase().includes(kw) || 
        r.phone?.includes(kw) ||
        r.withdraw_no?.toLowerCase().includes(kw) ||
        r.wechat_account?.toLowerCase().includes(kw)
      );
      res.json({ withdrawals: filtered });
    } else {
      res.json({ withdrawals: rows });
    }
  } catch (err) {
    console.error('Get withdrawals error:', err);
    res.status(500).json({ error: '获取提现列表失败' });
  }
});

// 管理员：通过提现
app.post('/api/admin/withdrawals/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const withdrawal = store.findOne('withdrawals', { id: parseInt(req.params.id) });
    if (!withdrawal) return res.status(404).json({ error: '提现申请不存在' });
    if (withdrawal.status !== 'pending') return res.status(400).json({ error: '当前状态不可操作' });

    store.update('withdrawals', { id: withdrawal.id }, { 
      status: 'approved', 
      approved_by: req.user.id,
      approved_at: new Date().toISOString()
    });

    store.insert('messages', { 
      user_id: withdrawal.user_id, 
      title: '提现审核通过', 
      content: `您的提现申请${withdrawal.withdraw_no}已审核通过，金额${withdrawal.amount}元，手续费${withdrawal.fee.toFixed(2)}元，实际到账${withdrawal.actual_amount.toFixed(2)}元。微信1-24小时内到账。`, 
      type: 'system', 
      is_read: false,
      created_at: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Approve withdrawal error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 管理员：拒绝提现
app.post('/api/admin/withdrawals/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;
    const withdrawal = store.findOne('withdrawals', { id: parseInt(req.params.id) });
    if (!withdrawal) return res.status(404).json({ error: '提现申请不存在' });
    if (withdrawal.status !== 'pending') return res.status(400).json({ error: '当前状态不可操作' });

    store.update('withdrawals', { id: withdrawal.id }, { 
      status: 'rejected', 
      reject_reason: reason || '',
      rejected_by: req.user.id,
      rejected_at: new Date().toISOString()
    });

    // 退回本金
    store.update('users', { id: withdrawal.user_id }, { 
      balance: { $inc: parseFloat(withdrawal.amount) },
      principal_balance: { $inc: parseFloat(withdrawal.amount) }
    });

    store.insert('messages', { 
      user_id: withdrawal.user_id, 
      title: '提现被驳回', 
      content: `您的提现申请${withdrawal.withdraw_no}被拒绝。${reason ? '原因：' + reason : ''}金额已退回您的账户。`, 
      type: 'system', 
      is_read: false,
      created_at: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Reject withdrawal error:', err);
    res.status(500).json({ error: '操作失败' });
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
    store.update('users', { id: req.user.id }, { 
      balance: { $inc: parseFloat(card.card_value) },
      principal_balance: { $inc: parseFloat(card.card_value) }
    });
    store.insert('messages', { user_id: req.user.id, title: '卡密兑换成功', content: `卡密兑换成功，到账${card.card_value}元`, type: 'system', is_read: false });

    res.json({ success: true, message: `兑换成功！到账${card.card_value}元` });
  } catch (err) {
    res.status(500).json({ error: '兑换失败' });
  }
});

// ===================== 公告/Banner/其他 =====================

// 公开站点信息（页脚用）
app.get('/api/site/info', async (req, res) => {
  try {
    const settings = store.findOne('site_settings', { id: 1 }) || {};
    // 只返回公开字段，不返回敏感信息
    const publicSettings = {
      site_name: settings.site_name || '',
      site_desc: settings.site_desc || '',
      service_phone: settings.service_phone || '',
      service_qq: settings.service_qq || '',
      footer_text: settings.footer_text || '',
      about_company: settings.about_company || '',
      about_phone: settings.about_phone || '',
      about_qq: settings.about_qq || '',
      payment_note: settings.payment_note || ''
    };
    res.json({ settings: publicSettings });
  } catch (err) {
    res.status(500).json({ error: '获取站点信息失败' });
  }
});

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
    store.update('users', { id: req.user.id }, { 
      balance: { $inc: parseFloat(packet.amount) },
      bonus_balance: { $inc: parseFloat(packet.amount) }
    });

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
    const { amount, action, remark, balanceType } = req.body;
    const userId = parseInt(req.params.id);
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 0) return res.status(400).json({ error: '金额无效' });
    
    const user = store.findOne('users', { id: userId });
    if (!user) return res.status(404).json({ error: '用户不存在' });
    
    const oldPrincipal = parseFloat(user.principal_balance) || 0;
    const oldBonus = parseFloat(user.bonus_balance) || 0;
    let newPrincipal = oldPrincipal;
    let newBonus = oldBonus;
    const type = balanceType || 'principal';
    
    if (action === 'add') {
      if (type === 'bonus') {
        newBonus += amt;
      } else {
        newPrincipal += amt;
      }
    } else if (action === 'sub') {
      // 先扣本金，再扣赠送金
      let remain = amt;
      if (newPrincipal >= remain) {
        newPrincipal -= remain;
        remain = 0;
      } else {
        remain -= newPrincipal;
        newPrincipal = 0;
        newBonus -= remain;
      }
    } else if (action === 'set') {
      // 设置总余额，全部计入本金
      newPrincipal = amt;
      newBonus = 0;
    } else {
      return res.status(400).json({ error: '操作类型无效' });
    }
    
    if (newPrincipal < 0 || newBonus < 0) return res.status(400).json({ error: '余额不能为负数' });
    const newBalance = newPrincipal + newBonus;
    
    store.update('users', { id: userId }, { 
      balance: newBalance,
      principal_balance: newPrincipal,
      bonus_balance: newBonus
    });
    
    // 记录余额变动日志
    store.insert('balance_logs', {
      user_id: userId,
      admin_id: req.user.id,
      action: action, // add/sub/set
      amount: amt,
      balance_type: type,
      balance_before: parseFloat(user.balance) || 0,
      balance_after: newBalance,
      principal_before: oldPrincipal,
      principal_after: newPrincipal,
      bonus_before: oldBonus,
      bonus_after: newBonus,
      remark: remark || '',
      created_at: new Date().toISOString()
    });
    
    res.json({ success: true, new_balance: newBalance });
  } catch (err) {
    console.error('Balance adjust error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 编辑用户信息
app.put('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, phone, qq, agent_level, status } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (username !== undefined) updates.username = username;
    if (phone !== undefined) updates.phone = phone;
    if (qq !== undefined) updates.qq = qq;
    if (agent_level !== undefined) updates.agent_level = parseInt(agent_level) || 0;
    if (status !== undefined) updates.status = status;
    store.update('users', { id: parseInt(req.params.id) }, updates);
    const user = store.findOne('users', { id: parseInt(req.params.id) });
    if (user) delete user.password;
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: '更新失败' });
  }
});

app.get('/api/admin/products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 100, keyword, category } = req.query;
    const conditions = {};
    if (keyword) conditions.title = { $like: keyword };
    if (category) conditions.category = category;
    const result = store.findMany('products', conditions, { sort: { created_at: 'desc' }, limit: parseInt(pageSize), offset: (parseInt(page) - 1) * parseInt(pageSize) });
    res.json({ products: result.rows, total: result.total });
  } catch (err) {
    res.status(500).json({ error: '获取商品列表失败' });
  }
});

app.post('/api/admin/products', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, description, price, originalPrice, image, category, stock, isHot, isNew, bronze_price, silver_price, gold_price } = req.body;
    const product = store.insert('products', {
      title, description: description || '', price, original_price: originalPrice || null,
      image: image || '', category: category || '常用', stock: stock || 999999,
      is_hot: isHot || false, is_new: isNew || false, sort_order: 0, status: 1,
      bronze_price: bronze_price || null, silver_price: silver_price || null, gold_price: gold_price || null
    });
    res.json({ product });
  } catch (err) {
    res.status(500).json({ error: '创建商品失败' });
  }
});

// 批量改价
app.post('/api/admin/products/batch-price', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { category, mode, direction, value, price_types } = req.body;
    if (!mode || !direction || !value || !price_types || !Array.isArray(price_types) || price_types.length === 0) {
      return res.status(400).json({ error: '参数不完整' });
    }

    const val = parseFloat(value);
    if (isNaN(val) || val <= 0) return res.status(400).json({ error: '调整值无效' });

    // 查找商品
    const conditions = category ? { category } : {};
    const products = store.findMany('products', conditions).rows;
    let updated = 0;

    for (const product of products) {
      const updates = {};
      for (const priceField of price_types) {
        let currentPrice = parseFloat(product[priceField]);
        if (isNaN(currentPrice) || currentPrice <= 0) {
          // 如果代理价为0或不存在，跳过
          if (priceField !== 'price') continue;
        }
        let newPrice;
        if (mode === 'percent') {
          if (direction === 'up') {
            newPrice = currentPrice * (1 + val / 100);
          } else {
            newPrice = currentPrice * (1 - val / 100);
          }
        } else {
          if (direction === 'up') {
            newPrice = currentPrice + val;
          } else {
            newPrice = currentPrice - val;
          }
        }
        // 保留2位小数，最低0.01
        newPrice = Math.max(0.01, Math.round(newPrice * 100) / 100);
        updates[priceField] = newPrice;
      }
      if (Object.keys(updates).length > 0) {
        store.update('products', { id: product.id }, updates);
        updated++;
      }
    }

    res.json({ updated, total: products.length });
  } catch (err) {
    console.error('Batch price error:', err);
    res.status(500).json({ error: '批量改价失败' });
  }
});

app.put('/api/admin/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, description, price, originalPrice, image, category, stock, isHot, isNew, status, bronze_price, silver_price, gold_price } = req.body;
    const updates = {
      title, description: description || '', price, original_price: originalPrice || null,
      image: image || '', category: category || '常用', stock: stock || 999999,
      is_hot: isHot || false, is_new: isNew || false, status: status || 1
    };
    if (bronze_price !== undefined) updates.bronze_price = bronze_price;
    if (silver_price !== undefined) updates.silver_price = silver_price;
    if (gold_price !== undefined) updates.gold_price = gold_price;
    store.update('products', { id: parseInt(req.params.id) }, updates);
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
    const { site_name, site_desc, service_phone, service_qq, footer_text, about_company, about_phone, about_qq, payment_note, maintenance_mode, maintenance_title, maintenance_content } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (site_name !== undefined) updates.site_name = site_name;
    if (site_desc !== undefined) updates.site_desc = site_desc;
    if (service_phone !== undefined) updates.service_phone = service_phone;
    if (service_qq !== undefined) updates.service_qq = service_qq;
    if (footer_text !== undefined) updates.footer_text = footer_text;
    if (about_company !== undefined) updates.about_company = about_company;
    if (about_phone !== undefined) updates.about_phone = about_phone;
    if (about_qq !== undefined) updates.about_qq = about_qq;
    if (payment_note !== undefined) updates.payment_note = payment_note;
    if (maintenance_mode !== undefined) updates.maintenance_mode = maintenance_mode ? 1 : 0;
    if (maintenance_title !== undefined) updates.maintenance_title = maintenance_title;
    if (maintenance_content !== undefined) updates.maintenance_content = maintenance_content;

    const existing = store.findOne('site_settings', { id: 1 });
    if (existing) {
      store.update('site_settings', { id: 1 }, updates);
    } else {
      store.insert('site_settings', { id: 1, ...updates });
    }
    const settings = store.findOne('site_settings', { id: 1 });
    res.json({ settings });
  } catch (err) {
    console.error('Update site settings error:', err);
    res.status(500).json({ error: '更新站点设置失败' });
  }
});

// ===== 通知推送配置 =====
app.put('/api/admin/notify-settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { notify_enabled, sct_key, email_enabled, email_provider, smtp_host, smtp_port, smtp_user, smtp_pass, resend_api_key, resend_from, notify_email, notify_wechat } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (notify_enabled !== undefined) updates.notify_enabled = notify_enabled ? 1 : 0;
    if (sct_key !== undefined) updates.sct_key = sct_key || '';
    if (email_enabled !== undefined) updates.email_enabled = email_enabled ? 1 : 0;
    if (email_provider !== undefined) updates.email_provider = email_provider || 'smtp';
    if (smtp_host !== undefined) updates.smtp_host = smtp_host || '';
    if (smtp_port !== undefined) updates.smtp_port = smtp_port || 465;
    if (smtp_user !== undefined) updates.smtp_user = smtp_user || '';
    if (smtp_pass !== undefined) updates.smtp_pass = smtp_pass || '';
    if (resend_api_key !== undefined) updates.resend_api_key = resend_api_key || '';
    if (resend_from !== undefined) updates.resend_from = resend_from || '';
    if (notify_email !== undefined) updates.notify_email = notify_email || '';
    if (notify_wechat !== undefined) updates.notify_wechat = notify_wechat || '';

    const existing = store.findOne('site_settings', { id: 1 });
    if (existing) {
      store.update('site_settings', { id: 1 }, updates);
    } else {
      store.insert('site_settings', { id: 1, ...updates });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Update notify settings error:', err);
    res.status(500).json({ error: '更新通知设置失败' });
  }
});

// ===== 测试邮件推送 =====
app.post('/api/admin/test-email', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const settings = store.findOne('site_settings', { id: 1 });
    if (!settings || !settings.email_enabled || !settings.notify_email) {
      return res.status(400).json({ error: '请先保存并开启邮件通知配置' });
    }

    const provider = settings.email_provider || 'smtp';
    const subject = '【测试】邮件推送正常';
    const text = '恭喜！邮件通知配置成功！\n\n来自：一屿刷课平台\n发送时间：' + new Date().toLocaleString('zh-CN');

    if (provider === 'resend') {
      // Resend API 模式
      if (!settings.resend_api_key) {
        return res.status(400).json({ error: '请填写 Resend API Key' });
      }
      const fromAddr = settings.resend_from || 'onboarding@resend.dev';
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + settings.resend_api_key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromAddr,
          to: [settings.notify_email],
          subject: subject,
          text: text
        })
      });
      const data = await resp.json();
      if (!resp.ok) {
        return res.status(500).json({ error: 'Resend发送失败：' + (data.message || resp.statusText) });
      }
      res.json({ success: true });
    } else {
      // SMTP 模式
      if (!settings.smtp_host) {
        return res.status(400).json({ error: '请填写SMTP服务器地址' });
      }
      if (!settings.smtp_user || !settings.smtp_pass) {
        return res.status(400).json({ error: '请填写SMTP账号和密码' });
      }

      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: settings.smtp_host,
        port: parseInt(settings.smtp_port) || 465,
        secure: parseInt(settings.smtp_port) === 465,
        auth: { user: settings.smtp_user, pass: settings.smtp_pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000
      });

      await transporter.sendMail({
        from: `"一屿刷课平台" <${settings.smtp_user}>`,
        to: settings.notify_email,
        subject: subject,
        text: text
      });

      res.json({ success: true });
    }
  } catch (err) {
    console.error('测试邮件失败:', err.message);
    let tip = err.message;
    if (err.code === 'EAUTH' || err.message.includes('authentication')) {
      tip = 'SMTP认证失败，请检查账号和授权码是否正确。QQ邮箱需使用"授权码"而非登录密码。';
    } else if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
      tip = '连接SMTP服务器超时，可能是服务器封禁了SMTP端口。建议改用 Resend API 模式（走HTTPS）。';
    } else if (err.code === 'ENOTFOUND' || err.message.includes('getaddrinfo')) {
      tip = '无法找到SMTP服务器，请检查服务器地址是否正确。';
    } else if (err.code === 'ECONNREFUSED') {
      tip = '连接被拒绝，请检查端口是否正确。';
    }
    res.status(500).json({ error: tip });
  }
});

// 发送通知（Server酱 + 邮件）
async function sendNotification(title, content) {
  try {
    const settings = store.findOne('site_settings', { id: 1 });
    if (!settings || !settings.notify_enabled) return;

    // Server酱微信推送
    if (settings.sct_key) {
      try {
        const url = `https://sctapi.ftqq.com/${settings.sct_key}.send`;
        const params = new URLSearchParams();
        params.append('title', title);
        params.append('desp', content);
        await fetch(url, { method: 'POST', body: params });
      } catch (e) {
        console.error('Server酱推送失败:', e.message);
      }
    }

    // 邮件通知
    if (settings.email_enabled && settings.notify_email) {
      try {
        const provider = settings.email_provider || 'smtp';
        if (provider === 'resend' && settings.resend_api_key) {
          // Resend API 模式
          const fromAddr = settings.resend_from || 'onboarding@resend.dev';
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + settings.resend_api_key,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: fromAddr,
              to: [settings.notify_email],
              subject: title,
              text: content
            })
          });
        } else if (settings.smtp_host && settings.smtp_user) {
          // SMTP 模式
          const nodemailer = require('nodemailer');
          const transporter = nodemailer.createTransport({
            host: settings.smtp_host,
            port: parseInt(settings.smtp_port) || 465,
            secure: parseInt(settings.smtp_port) === 465,
            auth: { user: settings.smtp_user, pass: settings.smtp_pass },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000
          });
          await transporter.sendMail({
            from: `"刷课平台通知" <${settings.smtp_user}>`,
            to: settings.notify_email,
            subject: title,
            text: content
          });
        }
      } catch (e) {
        console.error('邮件推送失败:', e.message);
      }
    }
  } catch (e) {
    console.error('发送通知异常:', e.message);
  }
}

// ===== 未读统计 =====
app.get('/api/admin/unread-count', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // 获取管理员最后阅读时间
    const readLog = store.findOne('admin_read_logs', { user_id: req.user.id });
    const lastRead = readLog?.last_read_at || '2000-01-01T00:00:00.000Z';

    // 统计各模块未读
    const newOrders = store.findMany('orders', {}, { sort: { created_at: 'desc' } }).rows.filter(o => o.created_at > lastRead).length;
    const newRecharges = store.findMany('recharges', { status: 'waiting_confirm' }, { sort: { created_at: 'desc' } }).rows.filter(r => r.created_at > lastRead).length;
    const newWithdrawals = store.findMany('withdrawals', { status: 'pending' }, { sort: { created_at: 'desc' } }).rows.filter(w => w.created_at > lastRead).length;

    res.json({
      orders: newOrders,
      recharges: newRecharges,
      withdrawals: newWithdrawals,
      total: newOrders + newRecharges + newWithdrawals
    });
  } catch (err) {
    res.status(500).json({ error: '获取失败' });
  }
});

// 标记已读
app.post('/api/admin/mark-read', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { module } = req.body;
    const existing = store.findOne('admin_read_logs', { user_id: req.user.id });
    const now = new Date().toISOString();
    if (existing) {
      store.update('admin_read_logs', { user_id: req.user.id }, { last_read_at: now });
    } else {
      store.insert('admin_read_logs', { user_id: req.user.id, last_read_at: now });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '操作失败' });
  }
});

// ===== 数据备份/导出 =====
app.get('/api/admin/backup', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const data = store.getData();
    // 移除用户密码
    const safeData = { ...data };
    if (safeData.users) {
      safeData.users = safeData.users.map(u => {
        const { password, ...rest } = u;
        return rest;
      });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Disposition', `attachment; filename="backup_${timestamp}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, data: safeData, filename: `backup_${timestamp}.json` });
  } catch (err) {
    console.error('Backup error:', err);
    res.status(500).json({ error: '备份失败' });
  }
});

// 数据恢复/导入
app.post('/api/admin/restore', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: '数据格式错误' });
    
    const tables = ['products', 'categories', 'banners', 'announcements', 'card_keys', 
                    'qq_groups', 'recharge_packages', 'pay_settings', 'site_settings',
                    'group_buys', 'red_packets'];
    
    for (const table of tables) {
      if (data[table] && Array.isArray(data[table])) {
        // 清空表并重新插入
        store.remove(table, {});
        for (const row of data[table]) {
          store.insert(table, row);
        }
      }
    }
    
    // 用户数据：恢复余额等字段，但保留原密码（如果备份里没有密码的话）
    if (data.users && Array.isArray(data.users)) {
      for (const u of data.users) {
        const existing = store.findOne('users', { id: u.id });
        if (!existing) {
          store.insert('users', u);
        } else {
          // 更新余额、等级等字段，密码保留原有的（如果备份里没有的话）
          const updates = {};
          if (u.balance !== undefined) updates.balance = u.balance;
          if (u.principal_balance !== undefined) updates.principal_balance = u.principal_balance;
          if (u.bonus_balance !== undefined) updates.bonus_balance = u.bonus_balance;
          if (u.agent_level !== undefined) updates.agent_level = u.agent_level;
          if (u.status !== undefined) updates.status = u.status;
          if (u.phone !== undefined) updates.phone = u.phone;
          if (u.qq !== undefined) updates.qq = u.qq;
          if (u.nickname !== undefined) updates.nickname = u.nickname;
          if (u.avatar !== undefined) updates.avatar = u.avatar;
          if (u.school !== undefined) updates.school = u.school;
          if (u.password !== undefined) updates.password = u.password; // 备份里有密码才覆盖
          if (Object.keys(updates).length > 0) {
            store.update('users', { id: u.id }, updates);
          }
        }
      }
    }
    
    // 订单数据追加
    if (data.orders && Array.isArray(data.orders)) {
      for (const o of data.orders) {
        const existing = store.findOne('orders', { id: o.id });
        if (!existing) store.insert('orders', o);
      }
    }
    
    // 充值记录追加
    if (data.recharges && Array.isArray(data.recharges)) {
      for (const r of data.recharges) {
        const existing = store.findOne('recharges', { id: r.id });
        if (!existing) store.insert('recharges', r);
      }
    }

    // 提现记录追加
    if (data.withdrawals && Array.isArray(data.withdrawals)) {
      for (const w of data.withdrawals) {
        const existing = store.findOne('withdrawals', { id: w.id });
        if (!existing) store.insert('withdrawals', w);
      }
    }

    // 余额日志追加
    if (data.balance_logs && Array.isArray(data.balance_logs)) {
      for (const l of data.balance_logs) {
        const existing = store.findOne('balance_logs', { id: l.id });
        if (!existing) store.insert('balance_logs', l);
      }
    }

    // 消息记录追加
    if (data.messages && Array.isArray(data.messages)) {
      for (const m of data.messages) {
        const existing = store.findOne('messages', { id: m.id });
        if (!existing) store.insert('messages', m);
      }
    }

    // 红包领取记录追加
    if (data.user_red_packets && Array.isArray(data.user_red_packets)) {
      for (const ur of data.user_red_packets) {
        const existing = store.findOne('user_red_packets', { id: ur.id });
        if (!existing) store.insert('user_red_packets', ur);
      }
    }
    
    res.json({ success: true, message: '数据恢复成功' });
  } catch (err) {
    console.error('Restore error:', err);
    res.status(500).json({ error: '恢复失败' });
  }
});

// ===== 站内消息 - 群发 =====
app.post('/api/admin/messages/broadcast', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: '标题和内容不能为空' });
    
    // 获取所有启用的用户
    const users = store.findMany('users', { status: 1 }, { limit: 9999 });
    let count = 0;
    for (const user of users.rows) {
      store.insert('messages', {
        user_id: user.id,
        title,
        content,
        type: 'system',
        is_read: 0,
        created_at: new Date().toISOString()
      });
      count++;
    }
    res.json({ success: true, sent_count: count });
  } catch (err) {
    console.error('Broadcast error:', err);
    res.status(500).json({ error: '发送失败' });
  }
});

// 用户消息列表
app.get('/api/messages', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const result = store.findMany('messages', { user_id: req.user.id }, 
      { sort: { created_at: 'desc' }, limit: parseInt(pageSize), offset: (parseInt(page) - 1) * parseInt(pageSize) });
    res.json({ messages: result.rows, total: result.total });
  } catch (err) {
    res.status(500).json({ error: '获取消息失败' });
  }
});

// 标记消息已读
app.post('/api/messages/:id/read', authMiddleware, async (req, res) => {
  try {
    store.update('messages', { id: parseInt(req.params.id), user_id: req.user.id }, { is_read: 1 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '操作失败' });
  }
});

// 未读消息数
app.get('/api/messages/unread-count', authMiddleware, async (req, res) => {
  try {
    const count = store.count('messages', { user_id: req.user.id, is_read: 0 });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: '获取失败' });
  }
});

// 用户订单列表
app.get('/api/user/orders', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const result = store.findMany('orders', { user_id: req.user.id },
      { sort: { created_at: 'desc' }, limit: parseInt(pageSize), offset: (parseInt(page) - 1) * parseInt(pageSize) });
    res.json({ orders: result.rows, total: result.total });
  } catch (err) {
    res.status(500).json({ error: '获取订单失败' });
  }
});

// 用户充值记录
app.get('/api/user/recharges', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const result = store.findMany('recharges', { user_id: req.user.id },
      { sort: { created_at: 'desc' }, limit: parseInt(pageSize), offset: (parseInt(page) - 1) * parseInt(pageSize) });
    res.json({ recharges: result.rows, total: result.total });
  } catch (err) {
    res.status(500).json({ error: '获取记录失败' });
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
