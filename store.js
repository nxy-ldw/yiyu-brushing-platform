const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'db.json');

let data = null;
let nextIds = {};

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  if (data) return data;
  ensureDir();
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    data = JSON.parse(raw);
  } catch {
    data = {};
  }
  const tables = ['users','products','categories','orders','recharges','banners','announcements','card_keys','group_buys','red_packets','user_red_packets','messages','qq_groups','recharge_packages'];
  for (const t of tables) {
    if (!data[t]) data[t] = [];
    if (!nextIds[t]) nextIds[t] = (data[t].length > 0 ? Math.max(...data[t].map(r => r.id || 0)) : 0) + 1;
  }
  return data;
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      ensureDir();
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('Save error:', e.message);
    }
  }, 500);
}

function genId(table) {
  load();
  const id = nextIds[table]++;
  return id;
}

function findOne(table, conditions) {
  load();
  const rows = data[table] || [];
  return rows.find(r => {
    for (const [key, val] of Object.entries(conditions)) {
      if (r[key] != val) return false;
    }
    return true;
  });
}

function findMany(table, conditions = {}, options = {}) {
  load();
  let rows = (data[table] || []).filter(r => {
    for (const [key, val] of Object.entries(conditions)) {
      if (val && typeof val === 'object' && val.$like) {
        const str = String(r[key] || '');
        if (!str.toLowerCase().includes(String(val.$like).toLowerCase())) return false;
      } else if (val !== undefined && val !== null) {
        if (r[key] != val) return false;
      }
    }
    return true;
  });

  if (options.sort) {
    rows.sort((a, b) => {
      for (const [field, dir] of Object.entries(options.sort)) {
        if (a[field] < b[field]) return dir === 'desc' ? 1 : -1;
        if (a[field] > b[field]) return dir === 'desc' ? -1 : 1;
      }
      return 0;
    });
  }

  const total = rows.length;
  if (options.limit) {
    const offset = options.offset || 0;
    rows = rows.slice(offset, offset + options.limit);
  }
  return { rows, total };
}

function insert(table, obj) {
  load();
  const id = genId(table);
  const record = { id, ...obj, created_at: obj.created_at || new Date().toISOString() };
  data[table].push(record);
  scheduleSave();
  return record;
}

function update(table, conditions, updates) {
  load();
  let updated = 0;
  for (const row of (data[table] || [])) {
    let match = true;
    for (const [key, val] of Object.entries(conditions)) {
      if (row[key] != val) { match = false; break; }
    }
    if (match) {
      for (const [key, val] of Object.entries(updates)) {
        if (val && typeof val === 'object' && val.$inc !== undefined) {
          row[key] = (parseFloat(row[key]) || 0) + val.$inc;
        } else {
          row[key] = val;
        }
      }
      row.updated_at = new Date().toISOString();
      updated++;
    }
  }
  if (updated > 0) scheduleSave();
  return updated;
}

function remove(table, conditions) {
  load();
  const before = data[table].length;
  data[table] = data[table].filter(r => {
    for (const [key, val] of Object.entries(conditions)) {
      if (r[key] != val) return true;
    }
    return false;
  });
  const removed = before - data[table].length;
  if (removed > 0) scheduleSave();
  return removed;
}

function count(table, conditions = {}) {
  load();
  return (data[table] || []).filter(r => {
    for (const [key, val] of Object.entries(conditions)) {
      if (r[key] != val) return false;
    }
    return true;
  }).length;
}

function sum(table, field, conditions = {}) {
  load();
  return (data[table] || [])
    .filter(r => {
      for (const [key, val] of Object.entries(conditions)) {
        if (r[key] != val) return false;
      }
      return true;
    })
    .reduce((sum, r) => sum + (parseFloat(r[field]) || 0), 0);
}

function initData() {
  load();
  const bcrypt = require('bcryptjs');

  if (!data.users || data.users.length === 0) {
    const hashedPassword = bcrypt.hashSync('lch200707175412', 10);
    insert('users', {
      username: 'yiyuwenhua',
      password: hashedPassword,
      phone: '17712328993',
      qq: '2947543703',
      balance: 9999,
      role: 'admin',
      avatar: '',
      status: 1,
    });
    console.log('Admin user created: yiyuwenhua');
  }

  if (data.categories.length === 0) {
    const cats = [
      { name: '全部', icon: '', sort_order: 0, status: 1 },
      { name: '常用', icon: '', sort_order: 1, status: 1 },
      { name: '学习通', icon: '', sort_order: 2, status: 1 },
      { name: '知到/智慧树', icon: '', sort_order: 3, status: 1 },
      { name: '智慧职教', icon: '', sort_order: 4, status: 1 },
      { name: 'U校园', icon: '', sort_order: 5, status: 1 },
      { name: '其他网课', icon: '', sort_order: 6, status: 1 },
      { name: '点赞关注', icon: '', sort_order: 7, status: 1 },
      { name: '客服QQ群', icon: '', sort_order: 8, status: 1 },
    ];
    for (const c of cats) insert('categories', c);
  }

  if (data.recharge_packages.length === 0) {
    const packages = [
      { amount: 10, bonus: 1, sort_order: 0, status: 1 },
      { amount: 30, bonus: 4, sort_order: 1, status: 1 },
      { amount: 50, bonus: 8, sort_order: 2, status: 1 },
      { amount: 100, bonus: 20, sort_order: 3, status: 1 },
      { amount: 500, bonus: 150, sort_order: 4, status: 1 },
    ];
    for (const p of packages) insert('recharge_packages', p);
  }

  if (data.qq_groups.length === 0) {
    const groups = [
      { group_no: '818682616', name: '二群', sort_order: 0, status: 1 },
      { group_no: '1098134604', name: '五群', sort_order: 1, status: 1 },
      { group_no: '790551986', name: '六群', sort_order: 2, status: 1 },
      { group_no: '1065974158', name: '九群', sort_order: 3, status: 1 },
    ];
    for (const g of groups) insert('qq_groups', g);
  }

  if (data.announcements.length === 0) {
    insert('announcements', { title: '欢迎来到一屿刷课平台', content: '欢迎回家！请先登录本站，再下单！变化不大！大家稍微熟悉一下就明白了！主要变化在于界面切换，更加流畅！电脑使用更完美！', sort_order: 0, status: 1 });
    insert('announcements', { title: '充值优惠', content: '在线充值10送1，30送4，50送8，100送20，500送150。推荐买余额充值卡，下单使用余额支付，不需要跳转支付宝，避免有时跳转有问题没刷上！', sort_order: 1, status: 1 });
    insert('announcements', { title: '关于支付', content: '请一定按页面显示金额付款，多付少付都不能到账！很重要！付错无法处理！不管你是多付还是少付！', sort_order: 2, status: 1 });
  }

  if (data.products.length === 0) {
    const products = [
      ['DY高速手工赞【当天完成】', '抖音高速手工点赞，当天完成，快速安全', 0.1010, '点赞关注'],
      ['DY高速手工关注【当天完成】', '抖音高速手工关注，当天完成，快速安全', 0.1820, '点赞关注'],
      ['福利款 知到 慢刷', '知到慢刷服务，性价比之选', 0.4200, '知到/智慧树'],
      ['选修课学习通包考试', '学习通选修课考试包过服务', 0.4500, '学习通'],
      ['顶级-学习通全包 选修课专业课全能版', '学习通全包服务，选修课专业课全能版', 1.4140, '学习通'],
      ['顶级-学习通考试 专业课选修课全能版', '学习通考试服务，专业课选修课全能版', 0.8080, '学习通'],
      ['顶级 学习通考试（只保存不提交）', '学习通考试，只保存不提交模式', 0.8585, '学习通'],
      ['学起plus 全包', '学起plus全包服务', 1.5352, '其他网课'],
      ['智慧职教四合一 MOOC职教云资源库AI课【全包】', '智慧职教四合一全包服务', 0.9300, '智慧职教'],
      ['奶昔-知到/智慧树 单考试', '知到/智慧树单考试服务', 0.3540, '知到/智慧树'],
      ['奶昔-知到/智慧树 慢刷', '知到/智慧树慢刷服务', 0.8080, '知到/智慧树'],
      ['保密观', '保密观刷课服务', 0.5600, '其他网课'],
      ['单独时长 U校园', 'U校园单时长服务', 0.7070, 'U校园'],
      ['单独时长（整本）U校园AI版', 'U校园AI版整本单时长', 0.6262, 'U校园'],
      ['U校园AI班测', 'U校园AI版班级测试', 0.6060, 'U校园'],
      ['U校园AI单元', 'U校园AI版单元测试', 0.4040, 'U校园'],
      ['U校园AI版【整本】', 'U校园AI版整本服务', 1.2100, 'U校园'],
      ['U校园班级测试', 'U校园班级测试服务', 0.6363, 'U校园'],
      ['U校园单元', 'U校园单元测试服务', 0.4242, 'U校园'],
      ['U校园【整本】', 'U校园整本服务', 1.1900, 'U校园'],
    ];
    for (const [title, desc, price, cat] of products) {
      insert('products', {
        title, description: desc, price, original_price: null,
        image: '', category: cat, stock: 999999,
        sales: Math.floor(Math.random() * 1000) + 100,
        is_hot: true, is_new: false, sort_order: 0, status: 1,
      });
    }
    console.log('Seed products inserted');
  }

  if (data.banners.length === 0) {
    insert('banners', { image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=modern%20education%20platform%20banner%20with%20books%20and%20graduation%20cap%20blue%20gradient%20background&image_size=landscape_16_9', link: '', sort_order: 0, status: 1 });
    insert('banners', { image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=online%20learning%20promotion%20banner%20with%20discount%20tags%20purple%20gradient&image_size=landscape_16_9', link: '', sort_order: 1, status: 1 });
    insert('banners', { image: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=study%20exam%20preparation%20banner%20with%20clock%20and%20books%20green%20blue%20gradient&image_size=landscape_16_9', link: '', sort_order: 2, status: 1 });
  }

  scheduleSave();
  console.log('JSON database initialized successfully');
}

module.exports = {
  load, findOne, findMany, insert, update, remove, count, sum, initData,
  getData: () => { load(); return data; },
};
