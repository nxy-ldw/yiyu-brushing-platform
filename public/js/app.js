// ===== 全局状态 =====
const API = '/api';
let token = localStorage.getItem('yy_token') || '';
let currentUser = null;
let currentPage = 'home';
let currentCategory = '全部';
let currentSort = 'default';
let currentOrderStatus = 'all';
let currentProductId = null;
let currentRechargeId = null;
let selectedRechargeAmount = null;
let bannerIndex = 0;
let bannerTimer = null;

// ===== 缓存系统 =====
const cache = {
    _data: {},
    _ttl: 5 * 60 * 1000, // 5分钟缓存
    get(key) {
        const item = this._data[key];
        if (!item) return null;
        if (Date.now() - item.time > this._ttl) {
            delete this._data[key];
            return null;
        }
        return item.value;
    },
    set(key, value) {
        this._data[key] = { value, time: Date.now() };
    },
    clear(key) {
        if (key) delete this._data[key];
        else this._data = {};
    }
};

// ===== 工具函数 =====
function $(id) { return document.getElementById(id); }
function val(id) { const el = $(id); return el ? (el.value || '').trim() : ''; }
function showToast(msg, type = '') {
    const toast = $('toast');
    toast.textContent = msg;
    toast.className = 'toast show ' + type;
    setTimeout(() => toast.className = 'toast', 2500);
}
function fmtPrice(p) { return parseFloat(p).toFixed(4).replace(/0+$/, '').replace(/\.$/, ''); }
function fmtDate(d) { return new Date(d).toLocaleString('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }
function authHeaders() { return token ? { Authorization: 'Bearer ' + token } : {}; }

async function api(path, method = 'GET', body = null, useCache = true) {
    // GET请求支持缓存
    if (method === 'GET' && useCache) {
        const cached = cache.get(path);
        if (cached) return cached;
    }
    const opts = { method, headers: { ...authHeaders(), 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API + path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '请求失败');
    // GET请求缓存结果
    if (method === 'GET' && useCache) {
        cache.set(path, data);
    }
    return data;
}

// ===== 页面导航 =====
function navigate(page) {
    currentPage = page;
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    const pageEl = $('page-' + page);
    if (pageEl) {
        pageEl.style.display = 'block';
        pageEl.classList.add('active');
    }
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navMap = { 'home': 0, 'group-buy': 1, 'red-packet': 2, 'redeem': 3, 'progress': 4, 'orders': 5 };
    const navItems = document.querySelectorAll('.nav-item');
    if (navMap[page] !== undefined && navItems[navMap[page]]) navItems[navMap[page]].classList.add('active');

    if (page === 'orders') loadOrders();
    else if (page === 'recharge') loadRecharge();
    else if (page === 'withdraw') loadWithdraw();
    else if (page === 'messages') loadMessages();
    else if (page === 'progress') loadProgress();
    else if (page === 'group-buy') loadGroupBuys();
    else if (page === 'red-packet') loadRedPackets();
    else if (page === 'admin') loadAdmin();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== 认证 =====
async function checkLogin() {
    if (!token) return;
    try {
        const data = await api('/auth/me');
        currentUser = data.user;
        updateUserUI();
    } catch {
        token = '';
        localStorage.removeItem('yy_token');
    }
}

function updateUserUI() {
    if (currentUser) {
        $('userArea').style.display = 'none';
        $('userInfo').style.display = 'flex';
        $('userBalance').textContent = parseFloat(currentUser.balance).toFixed(2);
        $('dropdownUsername').textContent = currentUser.username;
        if (currentUser.role === 'admin') $('adminLink').style.display = 'block';
        if (currentUser.avatar) {
            $('userAvatar').innerHTML = `<img src="${currentUser.avatar}" style="width:36px;height:36px;border-radius:50%">`;
        }
    } else {
        $('userArea').style.display = 'flex';
        $('userInfo').style.display = 'none';
    }
}

function toggleUserMenu() { $('dropdownMenu').classList.toggle('show'); }
document.addEventListener('click', (e) => {
    if (!e.target.closest('#userDropdown')) $('dropdownMenu').classList.remove('show');
});

function showLoginModal() { $('loginModal').style.display = 'flex'; }
function showRegisterModal() { $('registerModal').style.display = 'flex'; }
function closeModal(id) { $(id).style.display = 'none'; }
function closeModalByContainer(containerId) { $(containerId).innerHTML = ''; }

async function doLogin() {
    const username = $('loginUsername').value.trim();
    const password = $('loginPassword').value.trim();
    if (!username || !password) { showToast('请填写用户名和密码', 'error'); return; }
    try {
        const data = await api('/auth/login', 'POST', { username, password });
        token = data.token;
        localStorage.setItem('yy_token', token);
        currentUser = data.user;
        updateUserUI();
        closeModal('loginModal');
        showToast('登录成功', 'success');
        $('loginUsername').value = '';
        $('loginPassword').value = '';
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function doRegister() {
    const username = $('regUsername').value.trim();
    const password = $('regPassword').value.trim();
    const phone = $('regPhone').value.trim();
    const qq = $('regQQ').value.trim();
    if (!username || !password) { showToast('请填写用户名和密码', 'error'); return; }
    if (username.length < 3) { showToast('用户名至少3个字符', 'error'); return; }
    if (password.length < 6) { showToast('密码至少6个字符', 'error'); return; }
    try {
        const data = await api('/auth/register', 'POST', { username, password, phone, qq });
        token = data.token;
        localStorage.setItem('yy_token', token);
        currentUser = data.user;
        updateUserUI();
        closeModal('registerModal');
        showToast('注册成功', 'success');
        $('regUsername').value = ''; $('regPassword').value = ''; $('regPhone').value = ''; $('regQQ').value = '';
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function qqLogin() {
    try {
        const data = await api('/auth/qq/redirect');
        if (data.authUrl) {
            window.open(data.authUrl, '_blank');
        } else {
            showToast('QQ登录暂未配置，请联系管理员', 'error');
        }
    } catch {
        showToast('QQ登录暂不可用', 'error');
    }
}

function logout() {
    token = '';
    currentUser = null;
    localStorage.removeItem('yy_token');
    updateUserUI();
    $('dropdownMenu').classList.remove('show');
    navigate('home');
    showToast('已退出登录');
}

// ===== 轮播图 =====
function initBanner() {
    const slides = document.querySelectorAll('.banner-slide');
    const dots = $('bannerDots');
    if (slides.length === 0) return;
    dots.innerHTML = '';
    slides.forEach((_, i) => {
        const dot = document.createElement('span');
        if (i === 0) dot.classList.add('active');
        dot.onclick = () => goToBanner(i);
        dots.appendChild(dot);
    });
    // 确保第一张是激活状态
    slides.forEach((s, i) => s.classList.toggle('active', i === bannerIndex % slides.length));
    startBannerTimer();
}
function startBannerTimer() {
    if (bannerTimer) clearInterval(bannerTimer);
    bannerTimer = setInterval(() => nextBanner(), 5000);
}
function goToBanner(idx) {
    try {
        const slides = document.querySelectorAll('.banner-slide');
        const dots = $('bannerDots')?.children || [];
        const len = slides.length;
        if (len === 0) return;
        const safeIdx = ((idx % len) + len) % len; // 安全取模
        // 先激活新的，再移除旧的，避免中间态全透明
        slides[safeIdx].classList.add('active');
        if (dots[safeIdx]) dots[safeIdx].classList.add('active');
        slides.forEach((s, i) => { if (i !== safeIdx) s.classList.remove('active'); });
        Array.from(dots).forEach((d, i) => { if (i !== safeIdx) d.classList.remove('active'); });
        bannerIndex = safeIdx;
        startBannerTimer();
    } catch (e) {
        console.warn('Banner switch error:', e);
    }
}
function nextBanner() {
    const len = document.querySelectorAll('.banner-slide').length;
    if (len === 0) return;
    goToBanner(bannerIndex + 1);
}
function prevBanner() {
    const len = document.querySelectorAll('.banner-slide').length;
    if (len === 0) return;
    goToBanner(bannerIndex - 1);
}

// ===== 公告 =====
async function loadAnnouncements() {
    try {
        const data = await api('/announcements');
        if (data.announcements.length > 0) {
            $('announcementContent').textContent = data.announcements[0].content;
        }
    } catch {}
}

// ===== 分类 =====
async function loadCategories() {
    try {
        const data = await api('/categories');
        const nav = $('categoryNav');
        nav.innerHTML = '';
        data.categories.forEach(cat => {
            const item = document.createElement('div');
            item.className = 'category-item' + (cat.name === currentCategory ? ' active' : '');
            item.textContent = cat.name;
            item.onclick = () => {
                currentCategory = cat.name;
                document.querySelectorAll('.category-item').forEach(c => c.classList.remove('active'));
                item.classList.add('active');
                loadProducts();
            };
            nav.appendChild(item);
        });
    } catch {}
}

// ===== 商品 =====
async function loadProducts(keyword = '') {
    const grid = $('productsGrid');
    grid.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div>';
    try {
        let url = `/products?category=${encodeURIComponent(currentCategory)}&sort=${currentSort}`;
        if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`;
        const data = await api(url);
        if (data.products.length === 0) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#999">暂无商品</div>';
            return;
        }
        grid.innerHTML = data.products.map(p => {
            const displayPrice = getProductPrice(p);
            return `
            <div class="product-card" onclick="showOrderModal(${p.id})">
                <div class="product-img">
                    ${p.image ? `<img data-src="${p.image}" class="lazy-img" style="width:100%;height:100%;object-fit:cover;background:linear-gradient(135deg,#f0f0f5,#e8e8f0)">` : `<div class="product-img-placeholder">${p.title.charAt(0)}</div>`}
                    ${p.is_hot ? '<div class="product-badge hot">热销</div>' : ''}
                    ${p.is_new ? '<div class="product-badge new">新品</div>' : ''}
                </div>
                <div class="product-info">
                    <div class="product-title">${p.title}</div>
                    <div class="product-meta">
                        <span class="product-price">¥${fmtPrice(displayPrice)}</span>
                        <span class="product-sales">已售${p.sales}+</span>
                    </div>
                    <div class="product-footer">
                        <span class="product-stock">库存${p.stock === 999999 ? '无限' : p.stock}</span>
                        <button class="btn-buy" onclick="event.stopPropagation();showOrderModal(${p.id})">立即购买</button>
                    </div>
                </div>
            </div>
        `}).join('');
        initLazyImages();
    } catch (err) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#f5576c">加载失败</div>';
    }
}

// 图片懒加载
let lazyObserver = null;
function initLazyImages() {
    if (!('IntersectionObserver' in window)) {
        // 不支持则直接加载所有图片
        document.querySelectorAll('.lazy-img').forEach(img => {
            img.src = img.dataset.src;
            img.classList.remove('lazy-img');
        });
        return;
    }
    if (!lazyObserver) {
        lazyObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.remove('lazy-img');
                    lazyObserver.unobserve(img);
                }
            });
        }, { rootMargin: '100px' });
    }
    document.querySelectorAll('.lazy-img').forEach(img => lazyObserver.observe(img));
}

function getProductPrice(product) {
    const level = currentUser?.agent_level || 0;
    if (level === 1 && product.bronze_price) return product.bronze_price;
    if (level === 2 && product.silver_price) return product.silver_price;
    if (level === 3 && product.gold_price) return product.gold_price;
    return product.price;
}

function getAgentLevelName(level) {
    const lv = parseInt(level) || 0;
    if (lv === 1) return '铜牌代理';
    if (lv === 2) return '银牌代理';
    if (lv === 3) return '金牌代理';
    return '普通用户';
}

function sortProducts(sort, btn) {
    currentSort = sort;
    document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    loadProducts();
}

function handleSearch(e) { if (e.key === 'Enter') doSearch(); }
function doSearch() {
    const keyword = $('searchInput').value.trim();
    loadProducts(keyword);
}

// ===== 下单 =====
async function showOrderModal(productId) {
    if (!currentUser) { showToast('请先登录', 'error'); showLoginModal(); return; }
    try {
        const data = await api(`/products/${productId}`);
        const p = data.product;
        currentProductId = productId;
        const userLevel = currentUser.agent_level || 0;
        const displayPrice = getProductPrice(p);
        
        // 价格对比表
        const priceRows = [];
        priceRows.push(`<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#666"><span>普通用户</span><span>¥${fmtPrice(p.price)}</span></div>`);
        if (p.bronze_price) priceRows.push(`<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;${userLevel==1?'color:#cd7f32;font-weight:600':'color:#999'}"><span>🥉 铜牌代理</span><span>¥${fmtPrice(p.bronze_price)}</span></div>`);
        if (p.silver_price) priceRows.push(`<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;${userLevel==2?'color:#c0c0c0;font-weight:600':'color:#999'}"><span>🥈 银牌代理</span><span>¥${fmtPrice(p.silver_price)}</span></div>`);
        if (p.gold_price) priceRows.push(`<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;${userLevel==3?'color:#ffd700;font-weight:600':'color:#999'}"><span>🥇 金牌代理</span><span>¥${fmtPrice(p.gold_price)}</span></div>`);
        
        $('orderProductInfo').innerHTML = `
            <div style="display:flex;gap:12px;margin-bottom:12px;padding:12px;background:var(--bg);border-radius:8px">
                <div style="width:60px;height:60px;background:linear-gradient(135deg,#f0f0f5,#e8e8f0);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:var(--primary);opacity:.2">${p.title.charAt(0)}</div>
                <div style="flex:1">
                    <div style="font-weight:600;font-size:14px">${p.title}</div>
                    <div style="color:var(--accent);font-weight:700;margin-top:4px">您的价格：¥${fmtPrice(displayPrice)} <span style="font-size:11px;font-weight:400;color:#999">(${getAgentLevelName(userLevel)})</span></div>
                </div>
            </div>
            <div style="padding:10px 12px;background:#fafafa;border-radius:8px;margin-bottom:12px">
                <div style="font-size:12px;color:#999;margin-bottom:6px">价格对比</div>
                ${priceRows.join('')}
            </div>`;
        $('orderQty').value = 1;
        $('orderTotal').textContent = fmtPrice(displayPrice) + '元';
        $('orderAccount').value = '';
        $('orderPassword').value = '';
        $('orderSchool').value = '';
        $('orderCourse').value = '';
        $('orderRemark').value = '';
        $('orderModal').style.display = 'flex';
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function changeQty(delta) {
    const input = $('orderQty');
    let val = parseInt(input.value) + delta;
    if (val < 1) val = 1;
    input.value = val;
    updateOrderTotal();
}
async function updateOrderTotal() {
    if (!currentProductId) return;
    try {
        const data = await api(`/products/${currentProductId}`);
        const qty = parseInt($('orderQty').value) || 1;
        const price = getProductPrice(data.product);
        const total = parseFloat(price) * qty;
        $('orderTotal').textContent = fmtPrice(total) + '元';
    } catch {}
}

async function createOrder() {
    if (!currentUser) { showToast('请先登录', 'error'); return; }
    const account = $('orderAccount').value.trim();
    const passwordHint = $('orderPassword').value.trim();
    const school = $('orderSchool').value.trim();
    const course_name = $('orderCourse').value.trim();
    const remark = $('orderRemark').value.trim();
    const quantity = parseInt($('orderQty').value) || 1;
    if (!account) { showToast('请填写刷课账号', 'error'); return; }
    if (!passwordHint) { showToast('请填写登录密码', 'error'); return; }
    if (!school) { showToast('请填写学校名称', 'error'); return; }
    if (!course_name) { showToast('请填写课程名称', 'error'); return; }
    try {
        const data = await api('/orders', 'POST', { productId: currentProductId, quantity, account, passwordHint, school, course_name, remark });
        closeModal('orderModal');
        showToast('下单成功！', 'success');
        await refreshUser();
        navigate('orders');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function refreshUser() {
    try {
        const data = await api('/auth/me');
        currentUser = data.user;
        updateUserUI();
    } catch {}
}

// ===== 订单 =====
async function loadOrders() {
    if (!currentUser) { showToast('请先登录', 'error'); showLoginModal(); return; }
    const list = $('ordersList');
    list.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div>';
    try {
        const data = await api(`/orders?status=${currentOrderStatus}`);
        if (data.orders.length === 0) {
            list.innerHTML = '<div class="order-empty"><p>暂无订单</p></div>';
            return;
        }
        const statusText = { 'paid': '已付款', 'processing': '处理中', 'completed': '已完成', 'cancelled': '已取消', 'pending': '待付款' };
        list.innerHTML = data.orders.map(o => `
            <div class="order-card">
                <div class="order-card-header">
                    <span>订单号：${o.order_no}</span>
                    <span class="order-status ${o.status}">${statusText[o.status] || o.status}</span>
                </div>
                <div class="order-card-body">
                    <div class="order-product">
                        <span class="order-product-title">${o.product_title}</span>
                        <span class="order-product-price">¥${fmtPrice(o.total)}</span>
                    </div>
                    <div class="order-info">账号：${o.account || '-'}</div>
                    ${o.remark ? `<div class="order-info">备注：${o.remark}</div>` : ''}
                    <div class="order-info">${fmtDate(o.created_at)}</div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        list.innerHTML = '<div class="order-empty"><p>加载失败</p></div>';
    }
}

function filterOrders(status, btn) {
    currentOrderStatus = status;
    document.querySelectorAll('.order-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    loadOrders();
}

// ===== 进度查询 =====
async function loadProgress() {
    if (!currentUser) { showToast('请先登录', 'error'); showLoginModal(); return; }
    try { await searchProgress(); } catch {}
}

async function searchProgress() {
    const list = $('progressList');
    list.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div>';
    const orderNo = $('progressSearch').value.trim();
    try {
        const data = await api(`/orders/progress${orderNo ? '?orderNo=' + encodeURIComponent(orderNo) : ''}`);
        const statusText = { 'paid': '已付款', 'processing': '处理中', 'completed': '已完成', 'cancelled': '已取消' };
        const progressText = { 'pending': '等待中', 'processing': '处理中', 'completed': '已完成', 'cancelled': '已取消' };
        if (data.progress.length === 0) {
            list.innerHTML = '<div style="text-align:center;padding:40px;color:#999">暂无订单</div>';
            return;
        }
        list.innerHTML = data.progress.map(p => `
            <div class="progress-item">
                <div class="progress-status ${p.progress}"></div>
                <div class="progress-info">
                    <div class="progress-order-no">${p.order_no}</div>
                    <div class="progress-product">${p.product_title}</div>
                    <div style="font-size:12px;color:#999">${fmtDate(p.created_at)}</div>
                </div>
                <div style="text-align:right">
                    <div style="font-weight:600;font-size:14px">${progressText[p.progress] || p.progress}</div>
                    <div style="font-size:12px;color:#999">${statusText[p.status] || p.status}</div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        list.innerHTML = '<div style="text-align:center;padding:40px;color:#f5576c">加载失败</div>';
    }
}

// ===== 充值 =====
async function loadRecharge() {
    if (!currentUser) { showToast('请先登录', 'error'); showLoginModal(); return; }
    $('rechargeBalance').innerHTML = parseFloat(currentUser.balance).toFixed(2) + ' <span>元</span>';
    try {
        const data = await api('/recharge/packages');
        const grid = $('rechargePackages');
        grid.innerHTML = data.packages.map(pkg => `
            <div class="recharge-package" onclick="selectRecharge(${pkg.amount}, ${pkg.bonus}, this)">
                <div class="recharge-amount">${pkg.amount}<span>元</span></div>
                <div class="recharge-bonus">赠送${pkg.bonus}元</div>
                <div class="recharge-bonus-label">到账${pkg.amount + pkg.bonus}元</div>
            </div>
        `).join('');
    } catch {}
}

function selectRecharge(amount, bonus, el) {
    document.querySelectorAll('.recharge-package').forEach(p => p.classList.remove('selected'));
    el.classList.add('selected');
    selectedRechargeAmount = amount;
    goToPayPage(amount, bonus);
}

async function goToPayPage(amount, bonus) {
    if (!currentUser) { showToast('请先登录', 'error'); return; }
    try {
        const data = await api('/recharge', 'POST', { amount });
        currentRechargeId = data.recharge.id;
        $('payAmount').textContent = amount;
        currentPayBonus = bonus;
        loadPayPage();
        navigate('pay');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

let currentPayMethod = 'wechat';
let currentPayBonus = 0;

async function loadPayPage() {
    try {
        const data = await api('/pay-settings');
        const settings = data.settings || {};
        if (settings.pay_title) $('payPageTitle').textContent = settings.pay_title;
        if (settings.pay_tip) $('payTip').textContent = settings.pay_tip;
        updatePayQr(settings);
    } catch {
        updatePayQr({});
    }
}

function switchPayMethod(method, el) {
    currentPayMethod = method;
    document.querySelectorAll('.pay-method-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    loadPayPage();
}

function updatePayQr(settings) {
    const container = $('payQrContainer');
    const qrUrl = currentPayMethod === 'wechat' ? settings.wechat_qr : settings.alipay_qr;
    if (qrUrl) {
        container.innerHTML = `<img src="${qrUrl}" class="pay-qr-img" alt="收款码">`;
    } else {
        container.innerHTML = `
            <div class="pay-qr-placeholder">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <path d="M14 14h3v3h-3zM17 17h4M14 20h7M20 14v3"/>
                </svg>
                <p>暂无${currentPayMethod === 'wechat' ? '微信' : '支付宝'}收款码</p>
            </div>`;
    }
}

async function confirmPaySuccess() {
    if (!currentRechargeId) { showToast('充值订单不存在', 'error'); return; }
    try {
        const data = await api('/recharge/confirm', 'POST', { 
            rechargeId: currentRechargeId,
            payMethod: currentPayMethod || 'wechat'
        });
        showToast(data.message, 'success');
        currentRechargeId = null;
        selectedRechargeAmount = null;
        await refreshUser();
        navigate('pay-success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function checkRechargeResult() {
    await refreshUser();
    navigate('recharge');
}

// ===== 提现 =====
let withdrawQrImage = '';

async function loadWithdraw() {
    if (!currentUser) { showToast('请先登录', 'error'); showLoginModal(); return; }
    const principal = parseFloat(currentUser.principal_balance) || 0;
    const bonus = parseFloat(currentUser.bonus_balance) || 0;
    $('withdrawPrincipal').innerHTML = principal.toFixed(2) + ' <span>元</span>';
    $('withdrawBonus').textContent = bonus.toFixed(2);
    $('withdrawAmount').value = '';
    $('withdrawActual').textContent = '0.00';
    $('withdrawWechat').value = '';
    $('withdrawName').value = '';
    $('withdrawRemark').value = '';
    withdrawQrImage = '';
    $('withdrawQrPreview').innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.4">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
        </svg>
        <p style="font-size:13px;color:#999;margin-top:8px">点击上传微信收款码</p>
    `;
    loadWithdrawRecords();
}

function updateWithdrawActual() {
    const amt = parseFloat($('withdrawAmount').value) || 0;
    const fee = amt * 0.3;
    const actual = amt - fee;
    $('withdrawActual').textContent = actual.toFixed(2);
}

function setWithdrawAll() {
    const principal = parseFloat(currentUser.principal_balance) || 0;
    $('withdrawAmount').value = principal.toFixed(2);
    updateWithdrawActual();
}

function handleWithdrawQrUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        withdrawQrImage = e.target.result;
        $('withdrawQrPreview').innerHTML = `<img src="${withdrawQrImage}" style="max-width:200px;max-height:200px;border-radius:8px">`;
    };
    reader.readAsDataURL(file);
}

async function submitWithdraw() {
    if (!currentUser) { showToast('请先登录', 'error'); return; }
    const amount = parseFloat($('withdrawAmount').value);
    const wechat_account = $('withdrawWechat').value.trim();
    const wechat_name = $('withdrawName').value.trim();
    const remark = $('withdrawRemark').value.trim();
    
    if (!amount || isNaN(amount)) { showToast('请输入提现金额', 'error'); return; }
    if (amount < 200) { showToast('最低提现金额为200元', 'error'); return; }
    if (!wechat_account) { showToast('请输入微信号', 'error'); return; }
    if (!wechat_name) { showToast('请输入收款人姓名', 'error'); return; }
    
    const principal = parseFloat(currentUser.principal_balance) || 0;
    if (principal < amount) { showToast('可提现余额不足（赠送金不可提现）', 'error'); return; }
    
    if (!confirm(`确认提现 ${amount} 元？\n手续费 30%（${(amount * 0.3).toFixed(2)}元）\n实际到账 ${(amount * 0.7).toFixed(2)} 元`)) return;
    
    try {
        await api('/withdrawals', 'POST', { 
            amount, wechat_account, wechat_name, 
            qrcode_image: withdrawQrImage, remark 
        });
        showToast('申请提交成功，等待审核', 'success');
        await refreshUser();
        loadWithdraw();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function loadWithdrawRecords() {
    try {
        const data = await api('/withdrawals', false);
        const statusMap = {
            'pending': { text: '待审核', color: '#f59e0b' },
            'approved': { text: '已通过', color: '#10b981' },
            'rejected': { text: '已拒绝', color: '#ef4444' }
        };
        const container = $('withdrawRecords');
        if (data.withdrawals.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:30px;color:#999;font-size:13px">暂无提现记录</div>';
            return;
        }
        container.innerHTML = data.withdrawals.map(w => {
            const st = statusMap[w.status] || { text: w.status, color: '#999' };
            return `<div class="withdraw-record-item">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <span style="font-weight:600;font-size:14px">${w.withdraw_no}</span>
                    <span style="color:${st.color};font-weight:500;font-size:13px">${st.text}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:13px;color:#666;margin-bottom:4px">
                    <span>提现金额</span>
                    <span style="color:#f5576c;font-weight:600">¥${parseFloat(w.amount).toFixed(2)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:12px;color:#999;margin-bottom:4px">
                    <span>手续费</span>
                    <span>¥${parseFloat(w.fee).toFixed(2)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:12px;color:#999;margin-bottom:4px">
                    <span>实际到账</span>
                    <span style="color:#10b981">¥${parseFloat(w.actual_amount).toFixed(2)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:12px;color:#999">
                    <span>提交时间</span>
                    <span>${fmtDate(w.created_at)}</span>
                </div>
                ${w.reject_reason ? `<div style="margin-top:8px;padding:8px;background:#fef2f2;border-radius:6px;font-size:12px;color:#ef4444">拒绝原因：${w.reject_reason}</div>` : ''}
            </div>`;
        }).join('');
    } catch (err) {
        $('withdrawRecords').innerHTML = '<div style="text-align:center;padding:30px;color:#ef4444">加载失败</div>';
    }
}

// ===== 卡密兑换 =====
async function redeemCard() {
    const cardNo = $('cardNoInput').value.trim();
    if (!cardNo) { showToast('请输入卡密号', 'error'); return; }
    if (!currentUser) { showToast('请先登录', 'error'); showLoginModal(); return; }
    try {
        const data = await api('/redeem', 'POST', { cardNo });
        showToast(data.message, 'success');
        $('cardNoInput').value = '';
        await refreshUser();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ===== 消息 =====
async function loadMessages() {
    if (!currentUser) { showToast('请先登录', 'error'); showLoginModal(); return; }
    const list = $('messagesList');
    list.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div>';
    try {
        const data = await api('/messages');
        if (data.messages.length === 0) {
            list.innerHTML = '<div style="text-align:center;padding:40px;color:#999">暂无消息</div>';
            return;
        }
        list.innerHTML = data.messages.map(m => `
            <div class="message-item">
                <div class="message-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                </div>
                <div class="message-content">
                    <div class="message-title">${m.title}${!m.is_read ? '<span class="message-unread"></span>' : ''}</div>
                    <div class="message-text">${m.content}</div>
                    <div class="message-time">${fmtDate(m.created_at)}</div>
                </div>
            </div>
        `).join('');
    } catch {
        list.innerHTML = '<div style="text-align:center;padding:40px;color:#f5576c">加载失败</div>';
    }
}

// ===== 拼团 =====
async function loadGroupBuys() {
    const list = $('groupBuyList');
    list.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div>';
    try {
        const data = await api('/group-buys');
        if (data.groupBuys.length === 0) {
            list.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#999">暂无拼团活动</div>';
            return;
        }
        list.innerHTML = data.groupBuys.map(gb => {
            const progress = Math.min(100, (gb.current_count / gb.required_count) * 100);
            const remaining = Math.max(0, Math.ceil((new Date(gb.end_time) - new Date()) / 86400000));
            return `
            <div class="group-buy-card">
                <div class="group-buy-info">
                    <div style="font-weight:600;font-size:14px">${gb.title || gb.product_title || '拼团活动'}</div>
                    <div class="group-buy-price">
                        <span class="group-price">¥${fmtPrice(gb.group_price)}</span>
                        <span class="original-price">¥${fmtPrice(gb.original_price)}</span>
                    </div>
                    <div class="group-buy-progress">
                        <div class="group-buy-progress-bar" style="width:${progress}%"></div>
                        <div class="group-buy-progress-text">${gb.current_count}/${gb.required_count}人</div>
                    </div>
                    <div class="group-buy-countdown">${remaining > 0 ? '剩余' + remaining + '天' : '即将结束'}</div>
                </div>
                <button class="btn-group-buy" onclick="joinGroupBuy(${gb.id})">参与拼团</button>
            </div>`;
        }).join('');
    } catch {
        list.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#f5576c">加载失败</div>';
    }
}

function joinGroupBuy(id) {
    if (!currentUser) { showToast('请先登录', 'error'); showLoginModal(); return; }
    showToast('拼团功能开发中', '');
}

// ===== 红包 =====
async function loadRedPackets() {
    if (!currentUser) { showToast('请先登录', 'error'); showLoginModal(); return; }
    const grid = $('redPacketGrid');
    grid.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div>';
    try {
        const data = await api('/red-packets');
        if (data.packets.length === 0) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#999">暂无红包</div>';
            return;
        }
        grid.innerHTML = data.packets.map(rp => `
            <div class="red-packet-card">
                <div class="red-packet-amount">${parseFloat(rp.amount)}<span>元</span></div>
                <div class="red-packet-title">${rp.title || '现金红包'}</div>
                <div class="red-packet-min">满${rp.min_spend}元可用</div>
                <button class="btn-claim-rp" ${rp.user_status === 'unused' ? '' : 'disabled'} 
                    onclick="${rp.user_status === 'unused' ? `claimRedPacket(${rp.id})` : ''}">
                    ${rp.user_status === 'unused' ? '立即领取' : (rp.user_status === 'used' ? '已领取' : '已使用')}
                </button>
                <div style="font-size:11px;opacity:.7;margin-top:4px">剩余${rp.remaining}个</div>
            </div>
        `).join('');
    } catch {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#f5576c">加载失败</div>';
    }
}

async function claimRedPacket(id) {
    try {
        const data = await api('/red-packets/claim', 'POST', { packetId: id });
        showToast(data.message, 'success');
        await refreshUser();
        loadRedPackets();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ===== QQ群 =====
async function loadQQGroups() {
    try {
        const data = await api('/qq-groups');
        const section = $('qqSection');
        section.innerHTML = `
            <h3>客服QQ群</h3>
            <div class="qq-groups">
                ${data.groups.map(g => `
                    <div class="qq-group-card">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
                        </svg>
                        <div>
                            <div style="font-size:13px;color:#666">${g.name}</div>
                            <div class="qq-no">${g.group_no}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        // 同时更新footer
        const footer = $('footerQQGroups');
        if (footer) {
            footer.innerHTML = data.groups.map(g => `<p>QQ群：${g.group_no}</p>`).join('');
        }
    } catch {}
}

// ===== 后台QQ群管理 =====
async function loadAdminQQGroups() {
    const content = $('adminContent');
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div>';
    try {
        const data = await api('/admin/qq-groups');
        content.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                <h3 style="font-size:18px">QQ群管理</h3>
                <button class="btn-admin btn-primary" onclick="showAddQQGroup()">添加QQ群</button>
            </div>
            <div class="admin-table">
                <table>
                    <thead><tr><th>序号</th><th>群名称</th><th>群号</th><th>排序</th><th>状态</th><th>操作</th></tr></thead>
                    <tbody>
                        ${data.groups.map((g, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td><input type="text" value="${g.name}" id="qqg-name-${g.id}" style="width:100px;padding:4px 8px;border:1px solid #ddd;border-radius:4px"></td>
                                <td><input type="text" value="${g.group_no}" id="qqg-no-${g.id}" style="width:120px;padding:4px 8px;border:1px solid #ddd;border-radius:4px"></td>
                                <td><input type="number" value="${g.sort_order}" id="qqg-sort-${g.id}" style="width:60px;padding:4px 8px;border:1px solid #ddd;border-radius:4px"></td>
                                <td>${g.status === 1 ? '<span style="color:#10b981">启用</span>' : '<span style="color:#ef4444">禁用</span>'}</td>
                                <td>
                                    <button class="btn-admin" onclick="saveQQGroup(${g.id})">保存</button>
                                    <button class="btn-admin btn-danger" onclick="toggleQQGroupStatus(${g.id}, ${g.status})">${g.status === 1 ? '禁用' : '启用'}</button>
                                    <button class="btn-admin btn-danger" onclick="deleteQQGroup(${g.id})">删除</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        content.innerHTML = `<div style="text-align:center;padding:40px;color:#f5576c">加载失败：${err.message}</div>`;
    }
}

function showAddQQGroup() {
    const content = $('adminContent');
    const formHtml = `
        <div style="background:var(--bg);padding:20px;border-radius:8px;margin-bottom:20px">
            <h4 style="margin-bottom:16px">添加QQ群</h4>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
                <div>
                    <label style="display:block;margin-bottom:6px;font-size:13px;color:#666">群名称</label>
                    <input type="text" id="newQqgName" placeholder="如：一群" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:6px">
                </div>
                <div>
                    <label style="display:block;margin-bottom:6px;font-size:13px;color:#666">群号</label>
                    <input type="text" id="newQqgNo" placeholder="QQ群号" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:6px">
                </div>
                <div>
                    <label style="display:block;margin-bottom:6px;font-size:13px;color:#666">排序</label>
                    <input type="number" id="newQqgSort" value="0" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:6px">
                </div>
            </div>
            <div style="margin-top:16px;text-align:right">
                <button class="btn-admin" onclick="loadAdminQQGroups()">取消</button>
                <button class="btn-admin btn-primary" onclick="addQQGroup()">确认添加</button>
            </div>
        </div>
    `;
    content.innerHTML = formHtml + content.innerHTML;
}

async function addQQGroup() {
    const name = $('newQqgName').value.trim();
    const group_no = $('newQqgNo').value.trim();
    const sort_order = parseInt($('newQqgSort').value) || 0;
    if (!group_no) { showToast('群号不能为空', 'error'); return; }
    try {
        await api('/admin/qq-groups', 'POST', { group_no, name, sort_order });
        showToast('添加成功', 'success');
        loadAdminQQGroups();
        loadQQGroups();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function saveQQGroup(id) {
    const name = $(`qqg-name-${id}`).value.trim();
    const group_no = $(`qqg-no-${id}`).value.trim();
    const sort_order = parseInt($(`qqg-sort-${id}`).value) || 0;
    try {
        await api(`/admin/qq-groups/${id}`, 'PUT', { name, group_no, sort_order });
        showToast('保存成功', 'success');
        loadQQGroups();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function toggleQQGroupStatus(id, currentStatus) {
    try {
        await api(`/admin/qq-groups/${id}`, 'PUT', { status: currentStatus === 1 ? 0 : 1 });
        showToast('操作成功', 'success');
        loadAdminQQGroups();
        loadQQGroups();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteQQGroup(id) {
    if (!confirm('确定要删除这个QQ群吗？')) return;
    try {
        await api(`/admin/qq-groups/${id}`, 'DELETE');
        showToast('删除成功', 'success');
        loadAdminQQGroups();
        loadQQGroups();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ===== 后台管理 =====
function adminTab(tab, el) {
    document.querySelectorAll('.admin-nav a').forEach(a => a.classList.remove('active'));
    el.classList.add('active');
    if (tab === 'dashboard') loadAdminDashboard();
    else if (tab === 'users') loadAdminUsers();
    else if (tab === 'products') loadAdminProducts();
    else if (tab === 'orders') loadAdminOrders();
    else if (tab === 'recharges') loadAdminRecharges();
    else if (tab === 'withdrawals') loadAdminWithdrawals();
    else if (tab === 'messages') loadAdminMessages();
    else if (tab === 'announcements') loadAdminAnnouncements();
    else if (tab === 'banners') loadAdminBanners();
    else if (tab === 'cards') loadAdminCards();
    else if (tab === 'qq-groups') loadAdminQQGroups();
    else if (tab === 'pay-settings') loadAdminPaySettings();
    else if (tab === 'site-settings') loadAdminSiteSettings();
    else if (tab === 'backup') loadAdminBackup();
}

async function loadAdmin() {
    if (!currentUser || currentUser.role !== 'admin') { showToast('无权限', 'error'); navigate('home'); return; }
    loadAdminDashboard();
}

async function loadAdminDashboard() {
    const content = $('adminContent');
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div>';
    try {
        const data = await api('/admin/stats');
        content.innerHTML = `
            <div class="admin-stats-grid">
                <div class="stat-card">
                    <div class="stat-icon" style="background:linear-gradient(135deg,#667eea,#764ba2)">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/></svg>
                    </div>
                    <div class="stat-value">${data.stats.users}</div>
                    <div class="stat-label">总用户数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background:linear-gradient(135deg,#f5576c,#fa5252)">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M9 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2h-4"/><rect x="9" y="2" width="6" height="9" rx="2"/></svg>
                    </div>
                    <div class="stat-value">${data.stats.orders}</div>
                    <div class="stat-label">总订单数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background:linear-gradient(135deg,#43e97b,#38f9d7)">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                    </div>
                    <div class="stat-value">¥${data.stats.revenue.toFixed(2)}</div>
                    <div class="stat-label">总交易额</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background:linear-gradient(135deg,#fa8231,#f6a609)">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </div>
                    <div class="stat-value">${data.stats.todayOrders}</div>
                    <div class="stat-label">今日订单</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background:linear-gradient(135deg,#667eea,#764ba2)">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M20 7L12 3 4 7m16 0l-8 4m8-4v10l-8 4-8-4V7"/></svg>
                    </div>
                    <div class="stat-value">${data.stats.products}</div>
                    <div class="stat-label">商品数量</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background:linear-gradient(135deg,#f5576c,#fa5252)">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                    </div>
                    <div class="stat-value">¥${data.stats.rechargeTotal.toFixed(2)}</div>
                    <div class="stat-label">总充值额</div>
                </div>
            </div>
            <h3 style="margin:24px 0 16px;font-size:18px">最近订单</h3>
            <div class="admin-table">
                <table>
                    <thead><tr><th>订单号</th><th>用户</th><th>商品</th><th>金额</th><th>状态</th><th>时间</th></tr></thead>
                    <tbody>
                        ${data.recentOrders.map(o => `<tr>
                            <td>${o.order_no}</td>
                            <td>${o.username}</td>
                            <td>${o.product_title}</td>
                            <td>¥${fmtPrice(o.total)}</td>
                            <td>${o.status}</td>
                            <td>${fmtDate(o.created_at)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        content.innerHTML = '<div style="text-align:center;padding:40px;color:#f5576c">加载失败</div>';
    }
}

async function loadAdminUsers() {
    const content = $('adminContent');
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div>';
    try {
        const data = await api('/admin/users?pageSize=100');
        content.innerHTML = `
            <h3 style="margin-bottom:16px;font-size:18px">用户管理</h3>
            <div class="admin-toolbar">
                <input type="text" placeholder="搜索用户名/手机/QQ" id="userSearch" onkeypress="if(event.key==='Enter')loadAdminUsersSearch()">
                <button class="btn-admin" onclick="loadAdminUsersSearch()">搜索</button>
            </div>
            <div class="admin-table">
                <table>
                    <thead><tr><th>ID</th><th>用户名</th><th>手机</th><th>QQ</th><th>角色/等级</th><th>余额</th><th>状态</th><th>操作</th></tr></thead>
                    <tbody>
                        ${data.users.map(u => {
                            const isAdmin = u.role === 'admin';
                            return `<tr>
                            <td>${u.id}</td>
                            <td>${u.username}</td>
                            <td>${u.phone || '-'}</td>
                            <td>${u.qq || '-'}</td>
                            <td>${isAdmin ? '<span style="color:#f5576c;font-weight:600">管理员</span>' : getAgentLevelText(u.agent_level)}</td>
                            <td>¥${parseFloat(u.balance).toFixed(2)}</td>
                            <td>${u.status === 1 ? '正常' : '封禁'}</td>
                            <td>
                                <button class="btn-admin" style="padding:4px 12px;font-size:12px" onclick="editUser(${u.id})">编辑</button>
                                <button class="btn-admin success" style="padding:4px 12px;font-size:12px" onclick="adminAddBalance(${u.id})">调余额</button>
                                ${isAdmin ? '' : `<button class="btn-admin ${u.status === 1 ? 'danger' : 'success'}" style="padding:4px 12px;font-size:12px" onclick="adminToggleUser(${u.id}, ${u.status === 1 ? 0 : 1})">${u.status === 1 ? '封禁' : '解封'}</button>`}
                            </td>
                        </tr>`}).join('')}
                    </tbody>
                </table>
            </div>
            <div id="userFormContainer"></div>
        `;
    } catch (err) {
        content.innerHTML = '<div style="text-align:center;padding:40px;color:#f5576c">加载失败</div>';
    }
}

function getAgentLevelText(level) {
    const lv = parseInt(level) || 0;
    if (lv === 1) return '<span style="color:#cd7f32">铜牌代理</span>';
    if (lv === 2) return '<span style="color:#c0c0c0">银牌代理</span>';
    if (lv === 3) return '<span style="color:#ffd700">金牌代理</span>';
    return '普通用户';
}

function editUser(id) {
    const data = api('/admin/users?pageSize=100').then(d => {
        const user = d.users.find(u => u.id === id);
        if (!user) { showToast('用户不存在', 'error'); return; }
        const container = $('userFormContainer');
        container.innerHTML = `
            <div class="modal-overlay" style="display:flex;position:fixed;z-index:3000">
                <div class="modal-box" style="max-width:480px">
                    <button class="modal-close" onclick="closeModalByContainer('userFormContainer')">&times;</button>
                    <h2>编辑用户</h2>
                    <div class="admin-form-group"><label>用户名</label><input type="text" id="editUsername" value="${user.username}"></div>
                    <div class="admin-form-group"><label>手机号</label><input type="text" id="editPhone" value="${user.phone || ''}"></div>
                    <div class="admin-form-group"><label>QQ号</label><input type="text" id="editQQ" value="${user.qq || ''}"></div>
                    ${user.role === 'admin' ? `
                    <div class="admin-form-group">
                        <label>角色</label>
                        <div style="padding:8px 12px;background:#fff5f5;border:1px solid #fecaca;border-radius:6px;color:#f5576c;font-weight:600">管理员（不可更改）</div>
                    </div>
                    ` : `
                    <div class="admin-form-group">
                        <label>代理等级</label>
                        <select id="editAgentLevel" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:6px">
                            <option value="0" ${user.agent_level == 0 ? 'selected' : ''}>普通用户</option>
                            <option value="1" ${user.agent_level == 1 ? 'selected' : ''}>铜牌代理</option>
                            <option value="2" ${user.agent_level == 2 ? 'selected' : ''}>银牌代理</option>
                            <option value="3" ${user.agent_level == 3 ? 'selected' : ''}>金牌代理</option>
                        </select>
                    </div>
                    `}
                    <div class="admin-form-group">
                        <label>账号状态</label>
                        <select id="editStatus" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:6px">
                            <option value="1" ${user.status == 1 ? 'selected' : ''}>正常</option>
                            <option value="0" ${user.status == 0 ? 'selected' : ''}>封禁</option>
                        </select>
                    </div>
                    <button class="btn-primary btn-full" onclick="saveUserEdit(${user.id})">保存</button>
                </div>
            </div>
        `;
    });
}

async function saveUserEdit(id) {
    try {
        const payload = {
            username: $('editUsername').value.trim(),
            phone: $('editPhone').value.trim(),
            qq: $('editQQ').value.trim(),
            status: parseInt($('editStatus').value)
        };
        const agentLevelEl = $('editAgentLevel');
        if (agentLevelEl) payload.agent_level = parseInt(agentLevelEl.value);
        await api(`/admin/users/${id}`, 'PUT', payload);
        showToast('保存成功', 'success');
        $('userFormContainer').innerHTML = '';
        loadAdminUsers();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function loadAdminUsersSearch() {
    const keyword = $('userSearch').value.trim();
    const content = $('adminContent');
    try {
        const data = await api(`/admin/users?keyword=${encodeURIComponent(keyword)}`);
        content.innerHTML = `
            <h3 style="margin-bottom:16px;font-size:18px">用户管理</h3>
            <div class="admin-toolbar">
                <input type="text" placeholder="搜索用户名/手机/QQ" value="${keyword}" id="userSearch" onkeypress="if(event.key==='Enter')loadAdminUsersSearch()">
                <button class="btn-admin" onclick="loadAdminUsersSearch()">搜索</button>
            </div>
            <div class="admin-table">
                <table>
                    <thead><tr><th>ID</th><th>用户名</th><th>手机</th><th>QQ</th><th>余额</th><th>角色</th><th>状态</th><th>操作</th></tr></thead>
                    <tbody>
                        ${data.users.map(u => `<tr>
                            <td>${u.id}</td>
                            <td>${u.username}</td>
                            <td>${u.phone || '-'}</td>
                            <td>${u.qq || '-'}</td>
                            <td>¥${parseFloat(u.balance).toFixed(2)}</td>
                            <td>${u.role === 'admin' ? '管理员' : '用户'}</td>
                            <td>${u.status === 1 ? '正常' : '封禁'}</td>
                            <td>
                                <button class="btn-admin success" style="padding:4px 12px;font-size:12px" onclick="adminAddBalance(${u.id})">调余额</button>
                                <button class="btn-admin ${u.status === 1 ? 'danger' : 'success'}" style="padding:4px 12px;font-size:12px" onclick="adminToggleUser(${u.id}, ${u.status === 1 ? 0 : 1})">${u.status === 1 ? '封禁' : '解封'}</button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch {}
}

async function adminToggleUser(id, status) {
    try {
        await api(`/admin/users/${id}/status`, 'POST', { status });
        showToast('操作成功', 'success');
        loadAdminUsers();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function adminAddBalance(id) {
    try {
        const data = await api('/admin/users?pageSize=100');
        const user = data.users.find(u => u.id === id);
        if (!user) { showToast('用户不存在', 'error'); return; }
        
        const principal = parseFloat(user.principal_balance) || 0;
        const bonus = parseFloat(user.bonus_balance) || 0;
        
        const container = $('userFormContainer');
        container.innerHTML = `
            <div class="admin-modal" onclick="closeUserBalanceModal(event)">
                <div class="admin-modal-content" style="max-width:460px" onclick="event.stopPropagation()">
                    <div class="admin-modal-header">
                        <h3>调整余额 - ${user.username}</h3>
                        <button class="modal-close" onclick="closeUserBalanceModal()">×</button>
                    </div>
                    <div class="admin-modal-body">
                        <div style="background:#f5f7fa;padding:16px;border-radius:8px;margin-bottom:16px;text-align:center">
                            <div style="font-size:13px;color:#999;margin-bottom:4px">当前总余额</div>
                            <div style="font-size:28px;font-weight:700;color:#f5576c">¥${parseFloat(user.balance).toFixed(2)}</div>
                            <div style="display:flex;justify-content:center;gap:20px;margin-top:10px;font-size:12px">
                                <span style="color:#667eea">本金：¥${principal.toFixed(2)}</span>
                                <span style="color:#f59e0b">赠送金：¥${bonus.toFixed(2)}</span>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>调整方式</label>
                            <div style="display:flex;gap:10px">
                                <label style="flex:1;padding:10px;border:1px solid #e0e0e0;border-radius:8px;cursor:pointer;text-align:center" id="balActionAdd" onclick="selectBalanceAction('add')">
                                    <input type="radio" name="balAction" value="add" checked style="display:none">
                                    <span style="color:#43e97b;font-weight:600">+ 增加余额</span>
                                </label>
                                <label style="flex:1;padding:10px;border:1px solid #e0e0e0;border-radius:8px;cursor:pointer;text-align:center" id="balActionSub" onclick="selectBalanceAction('sub')">
                                    <input type="radio" name="balAction" value="sub" style="display:none">
                                    <span style="color:#f5576c;font-weight:600">- 扣除余额</span>
                                </label>
                                <label style="flex:1;padding:10px;border:1px solid #e0e0e0;border-radius:8px;cursor:pointer;text-align:center" id="balActionSet" onclick="selectBalanceAction('set')">
                                    <input type="radio" name="balAction" value="set" style="display:none">
                                    <span style="color:#667eea;font-weight:600">= 设置为</span>
                                </label>
                            </div>
                        </div>
                        <div class="form-group" id="balanceTypeGroup">
                            <label>增加到</label>
                            <div style="display:flex;gap:10px">
                                <label style="flex:1;padding:10px;border:2px solid #667eea;border-radius:8px;cursor:pointer;text-align:center;background:#f5f3ff" id="balTypePrincipal" onclick="selectBalanceType('principal')">
                                    <input type="radio" name="balType" value="principal" checked style="display:none">
                                    <span style="color:#667eea;font-weight:600">本金账户</span>
                                </label>
                                <label style="flex:1;padding:10px;border:1px solid #e0e0e0;border-radius:8px;cursor:pointer;text-align:center" id="balTypeBonus" onclick="selectBalanceType('bonus')">
                                    <input type="radio" name="balType" value="bonus" style="display:none">
                                    <span style="color:#f59e0b;font-weight:600">赠送金</span>
                                </label>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>金额（元）</label>
                            <input type="number" id="balanceAmount" placeholder="请输入金额" step="0.01" min="0">
                        </div>
                        <div class="form-group">
                            <label>操作备注（选填）</label>
                            <input type="text" id="balanceRemark" placeholder="例如：活动赠送、扣款等">
                        </div>
                    </div>
                    <div class="admin-modal-footer">
                        <button class="btn-admin" onclick="closeUserBalanceModal()">取消</button>
                        <button class="btn-admin primary" onclick="submitBalanceChange(${user.id})">确认调整</button>
                    </div>
                </div>
            </div>
        `;
        selectBalanceAction('add');
        currentBalanceType = 'principal';
    } catch (err) {
        showToast(err.message, 'error');
    }
}

let currentBalanceAction = 'add';
let currentBalanceType = 'principal';

function selectBalanceAction(action) {
    currentBalanceAction = action;
    ['Add', 'Sub', 'Set'].forEach(a => {
        const el = $('balAction' + a);
        if (el) {
            el.style.borderColor = a.toLowerCase() === action ? '#667eea' : '#e0e0e0';
            el.style.background = a.toLowerCase() === action ? '#f5f3ff' : '#fff';
        }
    });
    // 只有增加时显示类型选择
    const typeGroup = $('balanceTypeGroup');
    if (typeGroup) {
        typeGroup.style.display = action === 'add' ? 'block' : 'none';
    }
}

function selectBalanceType(type) {
    currentBalanceType = type;
    ['principal', 'bonus'].forEach(t => {
        const el = $('balType' + t.charAt(0).toUpperCase() + t.slice(1));
        if (el) {
            el.style.borderColor = t === type ? (t === 'principal' ? '#667eea' : '#f59e0b') : '#e0e0e0';
            el.style.borderWidth = t === type ? '2px' : '1px';
            el.style.background = t === type ? (t === 'principal' ? '#f5f3ff' : '#fffbeb') : '#fff';
        }
    });
}

function closeUserBalanceModal() {
    const container = $('userFormContainer');
    if (container) container.innerHTML = '';
}

async function submitBalanceChange(userId) {
    const amount = parseFloat($('balanceAmount').value);
    const remark = $('balanceRemark')?.value?.trim() || '';
    if (isNaN(amount) || amount < 0) {
        showToast('请输入有效金额', 'error');
        return;
    }
    try {
        await api(`/admin/users/${userId}/balance`, 'POST', { 
            amount: amount, 
            action: currentBalanceAction,
            balanceType: currentBalanceType,
            remark: remark
        });
        showToast('余额调整成功', 'success');
        closeUserBalanceModal();
        loadAdminUsers();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function loadAdminProducts() {
    const content = $('adminContent');
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div>';
    try {
        const data = await api('/admin/products');
        content.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <h3 style="font-size:18px">商品管理</h3>
                <button class="btn-admin" onclick="showProductForm()">添加商品</button>
            </div>
            <div class="admin-table">
                <table>
                    <thead><tr><th>ID</th><th>标题</th><th>分类</th><th>价格</th><th>库存</th><th>销量</th><th>状态</th><th>操作</th></tr></thead>
                    <tbody>
                        ${data.products.map(p => `<tr>
                            <td>${p.id}</td>
                            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${p.title}</td>
                            <td>${p.category}</td>
                            <td>¥${fmtPrice(p.price)}</td>
                            <td>${p.stock === 999999 ? '无限' : p.stock}</td>
                            <td>${p.sales}</td>
                            <td>${p.status === 1 ? '上架' : '下架'}</td>
                            <td>
                                <button class="btn-admin" style="padding:4px 12px;font-size:12px" onclick="editProduct(${p.id})">编辑</button>
                                <button class="btn-admin danger" style="padding:4px 12px;font-size:12px" onclick="deleteProduct(${p.id})">下架</button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <div id="productFormContainer"></div>
        `;
    } catch (err) {
        content.innerHTML = '<div style="text-align:center;padding:40px;color:#f5576c">加载失败</div>';
    }
}

function showProductForm(product = null) {
    const container = $('productFormContainer');
    container.innerHTML = `
        <div class="modal-overlay" style="display:flex;position:fixed;z-index:3000">
            <div class="modal-box" style="max-width:560px;max-height:90vh;overflow-y:auto">
                <button class="modal-close" onclick="closeModalByContainer('productFormContainer')">&times;</button>
                <h2>${product ? '编辑商品' : '添加商品'}</h2>
                <div class="admin-form-group"><label>标题</label><input type="text" id="prodTitle" value="${product?.title || ''}"></div>
                <div class="admin-form-group"><label>描述</label><textarea id="prodDesc" rows="2">${product?.description || ''}</textarea></div>
                <div class="admin-form-group"><label>普通价格</label><input type="number" step="0.0001" id="prodPrice" value="${product?.price || ''}"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
                    <div class="admin-form-group"><label>铜牌代理价</label><input type="number" step="0.0001" id="prodBronzePrice" value="${product?.bronze_price || ''}"></div>
                    <div class="admin-form-group"><label>银牌代理价</label><input type="number" step="0.0001" id="prodSilverPrice" value="${product?.silver_price || ''}"></div>
                    <div class="admin-form-group"><label>金牌代理价</label><input type="number" step="0.0001" id="prodGoldPrice" value="${product?.gold_price || ''}"></div>
                </div>
                <div class="admin-form-group"><label>原价</label><input type="number" step="0.01" id="prodOrigPrice" value="${product?.original_price || ''}"></div>
                <div class="admin-form-group"><label>分类</label><input type="text" id="prodCategory" value="${product?.category || '其他网课'}"></div>
                <div class="admin-form-group"><label>库存</label><input type="number" id="prodStock" value="${product?.stock || 999999}"></div>
                <div class="admin-form-group"><label>商品图片</label>
                    ${createImageUploader('prodImage', 'prodImagePreview', product?.image || '')}
                </div>
                <div class="admin-form-group" style="display:flex;gap:20px">
                    <label><input type="checkbox" id="prodHot" ${product?.is_hot ? 'checked' : ''}> 热销</label>
                    <label><input type="checkbox" id="prodNew" ${product?.is_new ? 'checked' : ''}> 新品</label>
                </div>
                <button class="btn-primary btn-full" onclick="saveProduct(${product?.id || 0})">保存</button>
            </div>
        </div>
    `;
}

async function saveProduct(id) {
    const data = {
        title: $('prodTitle').value.trim(),
        description: $('prodDesc').value.trim(),
        price: parseFloat($('prodPrice').value),
        originalPrice: $('prodOrigPrice').value ? parseFloat($('prodOrigPrice').value) : null,
        category: $('prodCategory').value.trim() || '其他网课',
        stock: parseInt($('prodStock').value) || 999999,
        image: $('prodImage').value.trim(),
        isHot: $('prodHot').checked,
        isNew: $('prodNew').checked,
        status: 1,
        bronze_price: $('prodBronzePrice').value ? parseFloat($('prodBronzePrice').value) : null,
        silver_price: $('prodSilverPrice').value ? parseFloat($('prodSilverPrice').value) : null,
        gold_price: $('prodGoldPrice').value ? parseFloat($('prodGoldPrice').value) : null,
    };
    if (!data.title || !data.price) { showToast('请填写标题和价格', 'error'); return; }
    try {
        if (id) await api(`/admin/products/${id}`, 'PUT', data);
        else await api('/admin/products', 'POST', data);
        showToast('保存成功', 'success');
        $('productFormContainer').innerHTML = '';
        loadAdminProducts();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function editProduct(id) {
    try {
        const data = await api(`/products/${id}`);
        showProductForm(data.product);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteProduct(id) {
    if (!confirm('确认下架该商品？')) return;
    try {
        await api(`/admin/products/${id}`, 'DELETE');
        showToast('下架成功', 'success');
        loadAdminProducts();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function loadAdminOrders() {
    const content = $('adminContent');
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div>';
    try {
        const data = await api('/admin/orders');
        const statusText = { 'paid': '已付款', 'processing': '处理中', 'completed': '已完成', 'cancelled': '已取消', 'pending': '待付款' };
        content.innerHTML = `
            <h3 style="margin-bottom:16px;font-size:18px">订单管理</h3>
            <div class="admin-table">
                <table>
                    <thead><tr><th>订单号</th><th>用户</th><th>商品</th><th>账号</th><th>金额</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
                    <tbody>
                        ${data.orders.map(o => `<tr>
                            <td>${o.order_no}</td>
                            <td>${o.username}</td>
                            <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis">${o.product_title}</td>
                            <td>${o.account || '-'}</td>
                            <td>¥${fmtPrice(o.total)}</td>
                            <td>${statusText[o.status] || o.status}</td>
                            <td>${fmtDate(o.created_at)}</td>
                            <td>
                                <select onchange="updateOrderStatus(${o.id}, this.value)" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px">
                                    <option value="">状态</option>
                                    <option value="processing">处理中</option>
                                    <option value="completed">已完成</option>
                                    <option value="cancelled">取消</option>
                                </select>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        content.innerHTML = '<div style="text-align:center;padding:40px;color:#f5576c">加载失败</div>';
    }
}

async function updateOrderStatus(id, status) {
    if (!status) return;
    try {
        await api(`/admin/orders/${id}/status`, 'POST', { status });
        showToast('更新成功', 'success');
        loadAdminOrders();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ===== 充值审核 =====
let rechargeFilter = 'all';
async function loadAdminRecharges() {
    const content = $('adminContent');
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div>';
    try {
        const data = await api('/admin/recharges?status=' + rechargeFilter, false); // 不缓存
        const statusMap = {
            'pending': { text: '待支付', color: '#999' },
            'waiting_confirm': { text: '待审核', color: '#f59e0b' },
            'success': { text: '已到账', color: '#10b981' },
            'rejected': { text: '已拒绝', color: '#ef4444' }
        };
        const methodMap = { 'wechat': '微信', 'alipay': '支付宝' };
        content.innerHTML = `
            <h3 style="margin-bottom:16px;font-size:18px">充值审核</h3>
            <div class="admin-toolbar">
                <div style="display:flex;gap:8px">
                    <button class="btn-admin ${rechargeFilter==='all'?'primary':''}" onclick="filterRecharges('all')">全部</button>
                    <button class="btn-admin ${rechargeFilter==='waiting_confirm'?'primary':''}" onclick="filterRecharges('waiting_confirm')">待审核</button>
                    <button class="btn-admin ${rechargeFilter==='success'?'primary':''}" onclick="filterRecharges('success')">已通过</button>
                    <button class="btn-admin ${rechargeFilter==='rejected'?'primary':''}" onclick="filterRecharges('rejected')">已拒绝</button>
                </div>
            </div>
            <div class="admin-table">
                <table>
                    <thead><tr><th>ID</th><th>用户</th><th>手机号</th><th>金额</th><th>赠送</th><th>支付方式</th><th>状态</th><th>提交时间</th><th>操作</th></tr></thead>
                    <tbody>
                        ${data.recharges.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:40px;color:#999">暂无数据</td></tr>' : 
                        data.recharges.map(r => {
                            const st = statusMap[r.status] || { text: r.status, color: '#999' };
                            return `<tr>
                                <td>#${r.id}</td>
                                <td>${r.username || '-'}</td>
                                <td>${r.phone || '-'}</td>
                                <td style="font-weight:600;color:#f5576c">¥${parseFloat(r.amount).toFixed(2)}</td>
                                <td>¥${parseFloat(r.bonus || 0).toFixed(2)}</td>
                                <td>${methodMap[r.method] || r.method || '-'}</td>
                                <td><span style="color:${st.color};font-weight:500">${st.text}</span></td>
                                <td>${fmtDate(r.created_at)}</td>
                                <td>
                                    ${r.status === 'waiting_confirm' ? `
                                        <button class="btn-admin success" style="padding:4px 10px;font-size:12px" onclick="approveRecharge(${r.id})">通过</button>
                                        <button class="btn-admin danger" style="padding:4px 10px;font-size:12px" onclick="rejectRecharge(${r.id})">拒绝</button>
                                    ` : r.status === 'success' ? 
                                        `<span style="color:#10b981;font-size:12px">已到账</span>` :
                                    r.status === 'rejected' ?
                                        `<span style="color:#ef4444;font-size:12px">已拒绝${r.reject_reason ? '：' + r.reject_reason : ''}</span>` :
                                        `<span style="color:#999;font-size:12px">待支付</span>`
                                    }
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        content.innerHTML = '<div style="text-align:center;padding:40px;color:#f5576c">加载失败</div>';
    }
}

function filterRecharges(status) {
    rechargeFilter = status;
    loadAdminRecharges();
}

async function approveRecharge(id) {
    if (!confirm('确认通过此充值申请？通过后余额将自动到账。')) return;
    try {
        await api(`/admin/recharges/${id}/approve`, 'POST', {});
        showToast('审核通过，已到账', 'success');
        loadAdminRecharges();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function rejectRecharge(id) {
    const reason = prompt('请输入拒绝原因（选填）：');
    if (reason === null) return;
    try {
        await api(`/admin/recharges/${id}/reject`, 'POST', { reason });
        showToast('已拒绝', 'success');
        loadAdminRecharges();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ===== 提现审核 =====
let withdrawFilter = 'all';
async function loadAdminWithdrawals() {
    const content = $('adminContent');
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div>';
    try {
        const data = await api('/admin/withdrawals?status=' + withdrawFilter, false);
        const statusMap = {
            'pending': { text: '待审核', color: '#f59e0b' },
            'approved': { text: '已通过', color: '#10b981' },
            'rejected': { text: '已拒绝', color: '#ef4444' }
        };
        content.innerHTML = `
            <h3 style="margin-bottom:16px;font-size:18px">提现审核</h3>
            <div class="admin-toolbar">
                <div style="display:flex;gap:8px">
                    <button class="btn-admin ${withdrawFilter==='all'?'primary':''}" onclick="filterWithdrawals('all')">全部</button>
                    <button class="btn-admin ${withdrawFilter==='pending'?'primary':''}" onclick="filterWithdrawals('pending')">待审核</button>
                    <button class="btn-admin ${withdrawFilter==='approved'?'primary':''}" onclick="filterWithdrawals('approved')">已通过</button>
                    <button class="btn-admin ${withdrawFilter==='rejected'?'primary':''}" onclick="filterWithdrawals('rejected')">已拒绝</button>
                </div>
            </div>
            <div class="admin-table">
                <table>
                    <thead><tr><th>单号</th><th>用户</th><th>金额</th><th>手续费</th><th>实际到账</th><th>微信号</th><th>姓名</th><th>状态</th><th>提交时间</th><th>操作</th></tr></thead>
                    <tbody>
                        ${data.withdrawals.length === 0 ? '<tr><td colspan="10" style="text-align:center;padding:40px;color:#999">暂无数据</td></tr>' : 
                        data.withdrawals.map(w => {
                            const st = statusMap[w.status] || { text: w.status, color: '#999' };
                            return `<tr>
                                <td>${w.withdraw_no}</td>
                                <td>${w.username || '-'}</td>
                                <td style="font-weight:600;color:#f5576c">¥${parseFloat(w.amount).toFixed(2)}</td>
                                <td>¥${parseFloat(w.fee).toFixed(2)}</td>
                                <td style="color:#10b981">¥${parseFloat(w.actual_amount).toFixed(2)}</td>
                                <td>${w.wechat_account || '-'}</td>
                                <td>${w.wechat_name || '-'}</td>
                                <td><span style="color:${st.color};font-weight:500">${st.text}</span></td>
                                <td>${fmtDate(w.created_at)}</td>
                                <td>
                                    ${w.status === 'pending' ? `
                                        <button class="btn-admin success" style="padding:4px 10px;font-size:12px" onclick="viewWithdraw(${w.id})">查看</button>
                                        <button class="btn-admin success" style="padding:4px 10px;font-size:12px" onclick="approveWithdraw(${w.id})">通过</button>
                                        <button class="btn-admin danger" style="padding:4px 10px;font-size:12px" onclick="rejectWithdraw(${w.id})">拒绝</button>
                                    ` : w.status === 'approved' ? 
                                        `<button class="btn-admin" style="padding:4px 10px;font-size:12px" onclick="viewWithdraw(${w.id})">查看</button>` :
                                    w.status === 'rejected' ?
                                        `<button class="btn-admin" style="padding:4px 10px;font-size:12px" onclick="viewWithdraw(${w.id})">查看</button>` :
                                        ''
                                    }
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <div id="withdrawDetailContainer"></div>
        `;
    } catch (err) {
        content.innerHTML = '<div style="text-align:center;padding:40px;color:#f5576c">加载失败</div>';
    }
}

function filterWithdrawals(status) {
    withdrawFilter = status;
    loadAdminWithdrawals();
}

async function viewWithdraw(id) {
    try {
        const data = await api('/admin/withdrawals?status=all', false);
        const w = data.withdrawals.find(x => x.id === id);
        if (!w) return;
        const statusMap = {
            'pending': { text: '待审核', color: '#f59e0b' },
            'approved': { text: '已通过', color: '#10b981' },
            'rejected': { text: '已拒绝', color: '#ef4444' }
        };
        const st = statusMap[w.status] || { text: w.status, color: '#999' };
        const container = $('withdrawDetailContainer');
        container.innerHTML = `
            <div class="admin-modal" onclick="closeWithdrawDetail(event)">
                <div class="admin-modal-content" style="max-width:480px" onclick="event.stopPropagation()">
                    <div class="admin-modal-header">
                        <h3>提现详情 - ${w.withdraw_no}</h3>
                        <button class="modal-close" onclick="closeWithdrawDetail()">×</button>
                    </div>
                    <div class="admin-modal-body">
                        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee">
                            <span style="color:#666">用户</span><span>${w.username || '-'}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee">
                            <span style="color:#666">提现金额</span><span style="color:#f5576c;font-weight:600">¥${parseFloat(w.amount).toFixed(2)}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee">
                            <span style="color:#666">手续费 (30%)</span><span>¥${parseFloat(w.fee).toFixed(2)}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee">
                            <span style="color:#666">实际到账</span><span style="color:#10b981;font-weight:600">¥${parseFloat(w.actual_amount).toFixed(2)}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee">
                            <span style="color:#666">微信号</span><span>${w.wechat_account || '-'}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee">
                            <span style="color:#666">收款人姓名</span><span>${w.wechat_name || '-'}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee">
                            <span style="color:#666">状态</span><span style="color:${st.color};font-weight:500">${st.text}</span>
                        </div>
                        <div style="padding:8px 0">
                            <div style="color:#666;margin-bottom:8px">微信收款码</div>
                            ${w.qrcode_image ? `<img src="${w.qrcode_image}" style="max-width:200px;max-height:200px;border-radius:8px;border:1px solid #eee">` : '<div style="color:#999;font-size:13px">未上传</div>'}
                        </div>
                        ${w.remark ? `<div style="padding:8px 0"><div style="color:#666;margin-bottom:4px">备注</div><div style="font-size:13px">${w.remark}</div></div>` : ''}
                        ${w.reject_reason ? `<div style="padding:8px 0"><div style="color:#ef4444;margin-bottom:4px">拒绝原因</div><div style="font-size:13px;color:#ef4444">${w.reject_reason}</div></div>` : ''}
                    </div>
                    <div class="admin-modal-footer">
                        <button class="btn-admin" onclick="closeWithdrawDetail()">关闭</button>
                    </div>
                </div>
            </div>
        `;
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function closeWithdrawDetail(event) {
    if (event && event.target !== event.currentTarget) return;
    $('withdrawDetailContainer').innerHTML = '';
}

async function approveWithdraw(id) {
    if (!confirm('确认通过此提现申请？通过后请及时转账给用户。')) return;
    try {
        await api(`/admin/withdrawals/${id}/approve`, 'POST', {});
        showToast('审核通过', 'success');
        loadAdminWithdrawals();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function rejectWithdraw(id) {
    const reason = prompt('请输入拒绝原因（选填）：');
    if (reason === null) return;
    try {
        await api(`/admin/withdrawals/${id}/reject`, 'POST', { reason });
        showToast('已拒绝，金额已退回', 'success');
        loadAdminWithdrawals();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function loadAdminAnnouncements() {
    const content = $('adminContent');
    content.innerHTML = `
        <h3 style="margin-bottom:16px;font-size:18px">公告管理</h3>
        <div class="admin-form-group"><label>标题</label><input type="text" id="annTitle" placeholder="公告标题"></div>
        <div class="admin-form-group"><label>内容</label><textarea id="annContent" rows="3" placeholder="公告内容"></textarea></div>
        <button class="btn-admin" onclick="createAnnouncement()">发布公告</button>
        <h4 style="margin:24px 0 12px">已有公告</h4>
        <div class="admin-table" id="annTable"><div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div></div>
    `;
    try {
        const data = await api('/announcements');
        $('annTable').innerHTML = `
            <table>
                <thead><tr><th>ID</th><th>标题</th><th>内容</th><th>操作</th></tr></thead>
                <tbody>
                    ${data.announcements.map(a => `<tr>
                        <td>${a.id}</td>
                        <td>${a.title || '-'}</td>
                        <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis">${a.content}</td>
                        <td><button class="btn-admin danger" style="padding:4px 12px;font-size:12px" onclick="deleteAnnouncement(${a.id})">删除</button></td>
                    </tr>`).join('')}
                </tbody>
            </table>
        `;
    } catch {}
}

async function createAnnouncement() {
    const title = $('annTitle').value.trim();
    const content = $('annContent').value.trim();
    if (!content) { showToast('请输入公告内容', 'error'); return; }
    try {
        await api('/admin/announcements', 'POST', { title, content });
        showToast('发布成功', 'success');
        loadAdminAnnouncements();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteAnnouncement(id) {
    if (!confirm('确认删除？')) return;
    try {
        await api(`/admin/announcements/${id}`, 'DELETE');
        showToast('删除成功', 'success');
        loadAdminAnnouncements();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function loadAdminBanners() {
    const content = $('adminContent');
    try {
        const data = await api('/banners');
        content.innerHTML = `
            <h3 style="margin-bottom:16px;font-size:18px">Banner管理</h3>
            <div class="admin-form-group"><label>Banner图片</label>
                ${createImageUploader('bannerImage', 'bannerImagePreview', '')}
            </div>
            <div class="admin-form-group"><label>跳转链接</label><input type="text" id="bannerLink" placeholder="选填"></div>
            <button class="btn-admin btn-primary" onclick="createBanner()">添加Banner</button>
            <div style="margin-top:24px">
                <h4 style="margin-bottom:12px">现有Banner</h4>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
                    ${(data.banners || []).map(b => `
                        <div style="border:1px solid #eee;border-radius:8px;overflow:hidden">
                            <img src="${b.image}" style="width:100%;height:100px;object-fit:cover">
                            <div style="padding:8px;font-size:12px;color:#666">
                                ${b.link ? `<div>链接: ${b.link.substring(0,20)}...</div>` : ''}
                                <button class="btn-admin danger" style="margin-top:6px;padding:2px 8px;font-size:11px" onclick="deleteBanner(${b.id})">删除</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    } catch (err) {
        content.innerHTML = '<div style="text-align:center;padding:40px;color:#f5576c">加载失败</div>';
    }
}

async function createBanner() {
    const image = $('bannerImage').value.trim();
    if (!image) { showToast('请上传或输入图片地址', 'error'); return; }
    const link = $('bannerLink').value.trim();
    try {
        await api('/admin/banners', 'POST', { image, link });
        showToast('添加成功', 'success');
        loadAdminBanners();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteBanner(id) {
    if (!confirm('确定删除这个Banner吗？')) return;
    try {
        await api(`/admin/banners/${id}`, 'DELETE');
        showToast('删除成功', 'success');
        loadAdminBanners();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function loadAdminCards() {
    const content = $('adminContent');
    content.innerHTML = `
        <h3 style="margin-bottom:16px;font-size:18px">卡密管理</h3>
        <div style="display:flex;gap:12px;margin-bottom:20px">
            <div class="admin-form-group" style="flex:1"><label>生成数量</label><input type="number" id="cardCount" value="1" min="1"></div>
            <div class="admin-form-group" style="flex:1"><label>面值</label><input type="number" step="0.01" id="cardValue" value="10"></div>
            <button class="btn-admin" style="align-self:flex-end" onclick="generateCards()">生成</button>
        </div>
        <div class="admin-table" id="cardsTable"><div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div></div>
    `;
    try {
        const data = await api('/admin/cards');
        $('cardsTable').innerHTML = `
            <table>
                <thead><tr><th>ID</th><th>卡密号</th><th>面值</th><th>状态</th><th>使用者</th><th>时间</th></tr></thead>
                <tbody>
                    ${data.cards.map(c => `<tr>
                        <td>${c.id}</td>
                        <td style="font-family:monospace">${c.card_no}</td>
                        <td>¥${parseFloat(c.card_value).toFixed(2)}</td>
                        <td>${c.status === 'used' ? '已使用' : '未使用'}</td>
                        <td>${c.used_username || '-'}</td>
                        <td>${fmtDate(c.created_at)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        `;
    } catch {}
}

async function generateCards() {
    const count = parseInt($('cardCount').value) || 1;
    const value = parseFloat($('cardValue').value) || 10;
    try {
        const data = await api('/admin/cards', 'POST', { count, value });
        showToast(`生成${data.cards.length}张卡密`, 'success');
        loadAdminCards();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function loadAdminPaySettings() {
    const content = $('adminContent');
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div>';
    try {
        const data = await api('/admin/pay-settings');
        const s = data.settings || {};
        content.innerHTML = `
            <h3 style="margin-bottom:20px;font-size:18px">支付设置</h3>
            <div class="admin-form">
                <div class="admin-form-group">
                    <label>支付页面标题</label>
                    <input type="text" id="paySetTitle" value="${s.pay_title || ''}" placeholder="扫码支付">
                </div>
                <div class="admin-form-group">
                    <label>支付提示语</label>
                    <input type="text" id="paySetTip" value="${s.pay_tip || ''}" placeholder="请扫描下方二维码完成支付">
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
                    <div class="admin-form-group">
                        <label>微信收款码</label>
                        ${createImageUploader('payWechatQr', 'payWechatQrPreview', s.wechat_qr || '')}
                    </div>
                    <div class="admin-form-group">
                        <label>支付宝收款码</label>
                        ${createImageUploader('payAlipayQr', 'payAlipayQrPreview', s.alipay_qr || '')}
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
                    <div class="admin-form-group">
                        <label>微信收款账号（选填）</label>
                        <input type="text" id="payWechatAccount" value="${s.wechat_account || ''}" placeholder="微信账号">
                    </div>
                    <div class="admin-form-group">
                        <label>支付宝收款账号（选填）</label>
                        <input type="text" id="payAlipayAccount" value="${s.alipay_account || ''}" placeholder="支付宝账号">
                    </div>
                </div>
                <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
                <h4 style="margin-bottom:16px">支付成功页面设置</h4>
                <div class="admin-form-group">
                    <label>成功页标题</label>
                    <input type="text" id="paySuccessTitle" value="${s.success_title || ''}" placeholder="支付成功">
                </div>
                <div class="admin-form-group">
                    <label>成功页内容</label>
                    <textarea id="paySuccessContent" rows="3" placeholder="您的支付已提交，系统将在1-5分钟内自动到账...">${s.success_content || ''}</textarea>
                </div>
                <div class="admin-form-group">
                    <label>成功页跳转链接（选填，设置后支付成功将自动跳转）</label>
                    <input type="text" id="paySuccessRedirect" value="${s.success_redirect_url || ''}" placeholder="https://...">
                </div>
                <div style="margin-top:20px">
                    <button class="btn-admin btn-primary" onclick="savePaySettings()">保存设置</button>
                </div>
            </div>
        `;
    } catch (err) {
        content.innerHTML = `<div style="text-align:center;padding:40px;color:#f5576c">加载失败：${err.message}</div>`;
    }
}

// ===== 图片上传工具 =====
async function uploadImage(file, inputId) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const result = await api('/admin/upload', 'POST', {
                    image: e.target.result,
                    filename: file.name
                });
                resolve(result.url);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
}

function createImageUploader(inputId, previewId, currentValue) {
    return `
        <div style="position:relative">
            <input type="text" id="${inputId}" value="${currentValue || ''}" placeholder="图片URL" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:6px;padding-right:90px">
            <label style="position:absolute;right:4px;top:50%;transform:translateY(-50%);padding:4px 12px;background:var(--primary);color:#fff;border-radius:4px;font-size:12px;cursor:pointer">
                上传
                <input type="file" accept="image/*" style="display:none" onchange="handleImageUpload(this, '${inputId}', '${previewId}')">
            </label>
        </div>
        <div id="${previewId}" style="margin-top:10px;min-height:120px;border:1px dashed #ddd;border-radius:8px;display:flex;align-items:center;justify-content:center;background:#fafafa">
            ${currentValue ? `<img src="${currentValue}" style="max-width:120px;max-height:120px">` : '<span style="color:#999;font-size:13px">图片预览</span>'}
        </div>
    `;
}

async function handleImageUpload(input, urlInputId, previewId) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        showToast('图片大小不能超过5MB', 'error');
        return;
    }
    try {
        showToast('上传中...', 'info');
        const url = await uploadImage(file);
        $(urlInputId).value = url;
        $(previewId).innerHTML = `<img src="${url}" style="max-width:120px;max-height:120px">`;
        showToast('上传成功', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function savePaySettings() {
    try {
        await api('/admin/pay-settings', 'PUT', {
            pay_title: val('paySetTitle'),
            pay_tip: val('paySetTip'),
            wechat_qr: val('payWechatQr'),
            alipay_qr: val('payAlipayQr'),
            wechat_account: val('payWechatAccount'),
            alipay_account: val('payAlipayAccount'),
            success_title: val('paySuccessTitle'),
            success_content: val('paySuccessContent'),
            success_redirect_url: val('paySuccessRedirect'),
        });
        showToast('保存成功', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function loadAdminSiteSettings() {
    const content = $('adminContent');
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>加载中...</p></div>';
    try {
        const data = await api('/admin/site-settings');
        const s = data.settings || {};
        content.innerHTML = `
            <h3 style="margin-bottom:20px;font-size:18px">站点设置</h3>
            <div class="admin-form">
                <div class="admin-form-group">
                    <label>网站名称</label>
                    <input type="text" id="siteName" value="${s.site_name || ''}" placeholder="一屿刷课平台">
                </div>
                <div class="admin-form-group">
                    <label>网站描述</label>
                    <input type="text" id="siteDesc" value="${s.site_desc || ''}" placeholder="专业刷课服务平台">
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
                    <div class="admin-form-group">
                        <label>客服电话</label>
                        <input type="text" id="sitePhone" value="${s.service_phone || ''}" placeholder="17712328993">
                    </div>
                    <div class="admin-form-group">
                        <label>客服QQ</label>
                        <input type="text" id="siteQQ" value="${s.service_qq || ''}" placeholder="2947543703">
                    </div>
                </div>
                <div class="admin-form-group">
                    <label>底部版权文字</label>
                    <input type="text" id="siteFooter" value="${s.footer_text || ''}" placeholder="一屿文化出品">
                </div>
                <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
                <h4 style="margin-bottom:16px">维护模式</h4>
                <div class="admin-form-group" style="display:flex;align-items:center;gap:12px">
                    <label><input type="checkbox" id="maintenanceMode" ${s.maintenance_mode ? 'checked' : ''}> 开启维护模式</label>
                    <span style="color:#999;font-size:12px">开启后用户端将显示维护弹窗</span>
                </div>
                <div class="admin-form-group">
                    <label>维护标题</label>
                    <input type="text" id="maintenanceTitle" value="${s.maintenance_title || '系统维护中'}" placeholder="系统维护中">
                </div>
                <div class="admin-form-group">
                    <label>维护内容</label>
                    <textarea id="maintenanceContent" rows="3" placeholder="系统正在维护升级中...">${s.maintenance_content || ''}</textarea>
                </div>
                <div style="margin-top:20px">
                    <button class="btn-admin btn-primary" onclick="saveSiteSettings()">保存设置</button>
                </div>
            </div>
        `;
    } catch (err) {
        content.innerHTML = `<div style="text-align:center;padding:40px;color:#f5576c">加载失败：${err.message}</div>`;
    }
}

async function saveSiteSettings() {
    try {
        const maintenanceModeEl = $('maintenanceMode');
        await api('/admin/site-settings', 'PUT', {
            site_name: val('siteName'),
            site_desc: val('siteDesc'),
            service_phone: val('sitePhone'),
            service_qq: val('siteQQ'),
            footer_text: val('siteFooter'),
            maintenance_mode: maintenanceModeEl?.checked ? 1 : 0,
            maintenance_title: val('maintenanceTitle'),
            maintenance_content: val('maintenanceContent'),
        });
        showToast('保存成功', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ===== 消息群发 =====
async function loadAdminMessages() {
    const content = $('adminContent');
    content.innerHTML = `
        <h3 style="margin-bottom:20px;font-size:18px">消息群发</h3>
        <div class="admin-form">
            <div class="admin-form-group">
                <label>消息标题</label>
                <input type="text" id="broadcastTitle" placeholder="请输入消息标题">
            </div>
            <div class="admin-form-group">
                <label>消息内容</label>
                <textarea id="broadcastContent" rows="6" placeholder="请输入消息内容"></textarea>
            </div>
            <div style="color:#999;font-size:12px;margin-bottom:16px">
                此消息将发送给所有正常状态的用户
            </div>
            <button class="btn-admin btn-primary" onclick="sendBroadcast()">一键发送</button>
        </div>
    `;
}

async function sendBroadcast() {
    const title = $('broadcastTitle').value.trim();
    const content = $('broadcastContent').value.trim();
    if (!title || !content) { showToast('请填写标题和内容', 'error'); return; }
    if (!confirm('确定要向所有用户发送这条消息吗？')) return;
    try {
        const result = await api('/admin/messages/broadcast', 'POST', { title, content });
        showToast(`发送成功，共发送给 ${result.sent_count} 位用户`, 'success');
        $('broadcastTitle').value = '';
        $('broadcastContent').value = '';
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ===== 数据备份 =====
async function loadAdminBackup() {
    const content = $('adminContent');
    content.innerHTML = `
        <h3 style="margin-bottom:20px;font-size:18px">数据备份</h3>
        <div class="admin-form">
            <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin-bottom:20px">
                <p style="color:#0369a1;margin:0 0 8px 0"><strong>数据备份说明</strong></p>
                <p style="color:#0369a1;font-size:13px;margin:0">
                    备份包含：商品、分类、Banner、公告、卡密、QQ群、充值套餐、支付设置、站点设置、订单、用户（不含密码）、充值记录等全部数据。<br>
                    建议每次更新代码前先备份，更新后恢复数据。
                </p>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
                <div style="border:1px solid #eee;border-radius:8px;padding:20px">
                    <h4 style="margin-bottom:12px">导出备份</h4>
                    <p style="color:#666;font-size:13px;margin-bottom:16px">将全站数据导出为JSON文件，保存到本地</p>
                    <button class="btn-admin btn-primary" onclick="exportBackup()">导出备份文件</button>
                </div>
                <div style="border:1px solid #eee;border-radius:8px;padding:20px">
                    <h4 style="margin-bottom:12px">恢复备份</h4>
                    <p style="color:#666;font-size:13px;margin-bottom:16px">从备份文件恢复数据（商品等配置会覆盖，用户和订单只追加）</p>
                    <input type="file" id="restoreFile" accept=".json" style="display:none" onchange="importBackup(event)">
                    <label class="btn-admin" style="display:inline-block;cursor:pointer" onclick="$('restoreFile').click()">选择备份文件</label>
                </div>
            </div>
        </div>
    `;
}

async function exportBackup() {
    try {
        showToast('正在生成备份...', 'info');
        const result = await api('/admin/backup');
        // 下载文件
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename || 'backup.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('备份导出成功', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm('确定要恢复数据吗？商品等配置数据将被覆盖！')) {
        event.target.value = '';
        return;
    }
    try {
        showToast('正在恢复数据...', 'info');
        const text = await file.text();
        const data = JSON.parse(text);
        await api('/admin/restore', 'POST', { data });
        showToast('数据恢复成功', 'success');
        event.target.value = '';
    } catch (err) {
        showToast('恢复失败：' + err.message, 'error');
        event.target.value = '';
    }
}

// ===== 移动端菜单 =====
function toggleMobileMenu() { $('navMenu').classList.toggle('show'); }

// ===== 回到顶部 =====
window.addEventListener('scroll', () => {
    if (window.scrollY > 300) $('backToTop').classList.add('show');
    else $('backToTop').classList.remove('show');
});

// ===== QQ登录回调处理 =====
function handleQQCallback() {
    const params = new URLSearchParams(window.location.hash.replace('#/qq-login?', ''));
    const qqToken = params.get('token');
    if (qqToken) {
        token = qqToken;
        localStorage.setItem('yy_token', token);
        checkLogin().then(() => {
            showToast('QQ登录成功', 'success');
            navigate('home');
        });
    }
}

// ===== 初始化 =====
async function init() {
    handleQQCallback();
    navigate('home'); // 先显示页面框架
    
    // 先初始化Banner（用静态默认值）
    initBanner();
    // 异步加载Banner数据，加载完后重新初始化
    loadBanners().then(() => {
        // 清除旧定时器和dots
        if (bannerTimer) clearInterval(bannerTimer);
        $('bannerDots').innerHTML = '';
        bannerIndex = 0;
        initBanner();
    }).catch(() => {
        // 加载失败保持默认Banner
    });
    
    // 并行加载其他数据
    loadAnnouncements();
    loadCategories();
    loadProducts();
    loadQQGroups();
    
    // 登录和维护模式检查（需要等待）
    await checkLogin();
    checkMaintenanceMode();
}

// 加载Banner
async function loadBanners() {
    try {
        const data = await api('/banners', 'GET', null, false); // 不缓存Banner
        const banners = data.banners || [];
        if (banners.length === 0) return; // 使用静态默认Banner
        
        const gradients = {
            purple: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            pink: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            blue: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            green: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            orange: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            violet: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
        };
        const gradientList = Object.values(gradients);
        
        const carousel = $('bannerCarousel');
        carousel.innerHTML = banners.map((b, i) => {
            const gradient = gradients[b.color] || gradientList[i % gradientList.length];
            const title = b.title || '一屿刷课平台';
            const subtitle = b.subtitle || '';
            // 双层结构：外层渐变背景始终存在，内层图片覆盖在上
            return `
                <div class="banner-slide ${i === 0 ? 'active' : ''}" style="background: ${gradient};" ${b.link ? `onclick="window.open('${b.link}')"` : ''}>
                    ${b.image ? `<img src="${b.image}" class="banner-bg-img" onerror="this.style.display='none'">` : ''}
                    <div class="banner-content">
                        <h2>${title}</h2>
                        ${subtitle ? `<p>${subtitle}</p>` : ''}
                        ${!b.image ? '<span class="banner-tag">全场好物 限时优惠</span>' : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        // 重置banner状态
        bannerIndex = 0;
        $('bannerDots').innerHTML = '';
    } catch (err) {
        console.warn('Load banners failed, using defaults:', err.message);
    }
}

async function checkMaintenanceMode() {
    try {
        const data = await api('/site-settings');
        const s = data.settings || {};
        if (s.maintenance_mode && currentUser?.role !== 'admin') {
            showMaintenanceModal(s.maintenance_title || '系统维护中', s.maintenance_content || '系统正在维护升级中，请稍后再试。');
        }
    } catch {}
}

function showMaintenanceModal(title, content) {
    const existing = $('maintenanceModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'maintenanceModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:32px;max-width:400px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
            <div style="width:64px;height:64px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                </svg>
            </div>
            <h2 style="margin:0 0 12px 0;font-size:20px;color:#333">${title}</h2>
            <p style="margin:0 0 24px 0;color:#666;line-height:1.6">${content}</p>
            <button onclick="closeMaintenanceModal()" style="padding:10px 32px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px">我知道了</button>
        </div>
    `;
    document.body.appendChild(modal);
}
function closeMaintenanceModal() {
    const modal = $('maintenanceModal');
    if (modal) modal.remove();
}

init();
