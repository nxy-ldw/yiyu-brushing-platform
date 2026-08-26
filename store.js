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
  const tables = ['users','products','categories','orders','recharges','banners','announcements','card_keys','group_buys','red_packets','user_red_packets','messages','qq_groups','recharge_packages','pay_settings','site_settings'];
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
      { name: '学习通', icon: '', sort_order: 1, status: 1 },
      { name: '其他网课', icon: '', sort_order: 2, status: 1 },
      { name: '点赞关注', icon: '', sort_order: 3, status: 1 },
      { name: '客服QQ群', icon: '', sort_order: 4, status: 1 },
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
      ['DY高速手工赞【当天完成】', '', 0.101, '点赞关注', 'https://xxgzs.vip/api/material/image/md5?md5=225294355d302d35654221e97c592c3d', 987, 999999],
      ['DY高速手工关注【当天完成】', '① dy粉丝下单需开启： 【隐私设置】→【在他人关注和粉丝列表公开显示】 未开启无效&nbsp;②&nbsp; 下单账号为私密账号 或做单过程中设置为私密账号 系统将直接核算完成', 0.182, '点赞关注', 'https://xxgzs.vip/api/material/image/md5?md5=225294355d302d35654221e97c592c3d', 305, 999999],
      ['福利款 知到 慢刷', '全包规律学习 视频课件+作业+习惯分+互动分+见面课+考试等等。有习惯分的课程会规律学习每天1:1观看30分钟视频，结课前未完成会一次性看完。官方题库，包高分，智能分配IP，无视异地无异常，不出现异地', 0.42, '学习通', 'https://xxgzs.vip/api/material/image/md5?md5=26ed6502abbc0cbf913431c1aed51420', 904, 999999],
      ['选修课学习通包考试', '全包、视频+ppt+ 音频＋章节测试＋阅读＋直播课 (支持直播回放)app考试(支持人脸），夜间休息【学校名称请一定写学校名称！！】账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检', 0.45, '学习通', 'https://xxgzs.vip/api/material/image/md5?md5=6efa99912a996f5218fc988112855a08', 349, 999999],
      ['顶级-学习通全包  选修课专业课全能版', '包课件,测验,互动测验,作业,讨论,课程内考试,APP考试,24h学习不休息不清进度,支持特殊题型:阅读理解,完形填空,听力题,排序题,连线题,共用选项题【学校名称请一定写学校名称！！】账号密码 填写', 1.414, '学习通', 'https://xxgzs.vip/api/material/image/md5?md5=6efa99912a996f5218fc988112855a08', 1244, 999999],
      ['顶级-学习通考试 专业课选修课全能版', '包考试,在线考试,收件箱考试,APP考试,主观题AI作答,考试支持特殊题型:阅读理解,听力题,连线题,完形填空,共用选项题,排序题考完自动交卷，如果不需要交卷，请买另外一个商品【学校名称请一定写学校名', 0.808, '学习通', 'https://xxgzs.vip/api/material/image/md5?md5=6efa99912a996f5218fc988112855a08', 378, 999999],
      ['顶级 学习通考试（只保存不提交）', '仅保存，不会自动提交考试，适合在教室考试的，或者考完需要看下试卷里面内容的客户仅包考试,在线考试,收件箱考试,APP考试,主观题AI作答,考试支持特殊题型:阅读理解,听力题,连线题,完形填空,共用选项', 0.8585, '学习通', 'https://xxgzs.vip/api/material/image/md5?md5=6efa99912a996f5218fc988112855a08', 721, 999999],
      ['学起plus 全包', '查课格式：学校 账号 密码时长，次数，作业，考试【学校名称请一定写学校名称！！】账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 1.5352, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=23ba2eacdc6745ffb5ad146c513232bc', 230, 999999],
      ['智慧职教四合一 - 智慧职教MOOC职教云资源库AI课【全包】', '【Ai课】【mooc】: 全包（所有类型课件+作业考试测验+ai讨论+时长），官库满分，支持随机考试。附件作业，考试带随机6-10分钟作答时长。 官方题库 优势：课件和考试每天检测更新 【职教云】课件', 0.93, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=d310d46aad904416d23ec778f49084fe', 671, 999999],
      ['奶昔-知到/智慧树 单考试', '包考试，官方题库。翻转课不支持。上号后会挂10-20分钟时长后再提交。【学校名称请一定写学校名称！！】账号密码 填写��时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 0.354, '学习通', 'https://xxgzs.vip/api/material/image/md5?md5=26ed6502abbc0cbf913431c1aed51420', 730, 999999],
      ['奶昔-知到/智慧树 慢刷', '全包规律学习 视频课件+作业+习惯分+互动分+见面课+考试等等。有习惯分的课程会规律学习每天1:1观看30分钟视频，结课前未完成会一次性看完。官方题库，包高分，智能分配IP，无视异地无异常，不出现异地', 0.808, '学习通', 'https://xxgzs.vip/api/material/image/md5?md5=26ed6502abbc0cbf913431c1aed51420', 122, 999999],
      ['保密观', '查课格式：账号 密码视频，时长，证书，秒单账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 0.56, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=c954add3738f46f373d7a51de4f0df82', 183, 999999],
      ['单独时长  U校园', '单独时长，学校处填写数字即可，单位小时，最高支持50。账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 0.707, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=77289ac5b7da980e996712effd4e6b46', 439, 999999],
      ['单独时长（整本）U校园AI版', '单独时长，学校处填写数字即可，单位小时，最高支持50。账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 0.6262, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=3c856dcf9ab969e9ea774ba04167a06d', 163, 999999],
      ['U校园AI班测', 'U校园AI作业完成模式，满分不提交，客户自己上��交卷【学校名称请一定写学校名称！！】账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 0.606, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=3c856dcf9ab969e9ea774ba04167a06d', 596, 999999],
      ['U校园AI单元', 'U校园AI完成整个单元，【学校名称请一定写学校名称！！】账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 0.404, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=3c856dcf9ab969e9ea774ba04167a06d', 573, 999999],
      ['U校园AI版【整本】', '包满分 + 时长【学校名称请一定写学校名称！！】账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 1.21, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=3c856dcf9ab969e9ea774ba04167a06d', 565, 999999],
      ['U校园班级测试', '仅完成测试题目【学校名称请一定写学校名称！！】账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 0.6363, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=77289ac5b7da980e996712effd4e6b46', 647, 999999],
      ['U校园单元', 'U校园仅处理单元内容，完成整个单元教材【学校名称请一定写学校名称！！】账号密码 填写的时候前后不要有空格显示暂无数据就是��号信息错误自己检查正确后再查课下单', 0.4242, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=77289ac5b7da980e996712effd4e6b46', 304, 999999],
      ['U校园【整本】', '包满分 + 时长【学校名称请一定写学校名称！！】账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 1.19, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=77289ac5b7da980e996712effd4e6b46', 322, 999999],
      ['MSE微课 单元', '全包，官方题库答题，秒单包时长。为确保学习时间轨迹看起来正常，显示的学习时间会从2天前开始。网址：https://microlesson.rcgtjy.com/【学校名称请一定写学校名称！！】账号密码', 1.414, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=979477076b6581d94109cd6343d61291', 612, 999999],
      ['MSE微课', '全包，官方题库答题，秒单包时长。为确保学习时间轨迹看起来正常，显示的学习时间会从2天前开始。网址：https://microlesson.rcgtjy.com/【学校名称请一定写学校名称！！】账号密码', 2.929, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=979477076b6581d94109cd6343d61291', 626, 999999],
      ['iSmart 单元', ' 时长默认10分钟左右一个页面。总时长看课程多少决定班级测试不包，需单独下单。【学校名称请一定写学校名称！！】账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 0.61, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=44ab933118ad442b11b0966b42ec7b06', 356, 999999],
      ['ismart班测', '客观题基本满分，连线题不做，时长20min左右【学校名称请一定写学校名称！！】账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 0.25, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=44ab933118ad442b11b0966b42ec7b06', 334, 999999],
      ['ismart整本', '时长默认10分钟左右一个页面。总时长看课程多少决定班级测试不包，需单独下单。【学校名��请一定写学校名称！！】账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 1.313, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=44ab933118ad442b11b0966b42ec7b06', 402, 999999],
      ['清华社英语 整本班级测试(作业)', '包课程下的全部班测(作业)，如有新出测验重刷即可!客观题满分，录音自动根据性别上传，翻译等主观题调用AI作答！【学校名称请一定写学校名称！！】账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息', 1.92, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=4b490025f37f3138c6c1dc41fb0da595', 148, 999999],
      ['清华社英语-单元', '包做题+时长。正确率98以上。支持闯关模式！录音自动根据性别上传。【学校名称请一定写学校名称！！】账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 0.909, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=4b490025f37f3138c6c1dc41fb0da595', 844, 999999],
      ['清华社英语-整本', '包做题+时长。正确率98以上。支持闯关模式！录音自动根据性别上传。最高30小时，默认16小时；时长一比一完成，期间不能挤号。包完成课程内所有班级测试，包课程下的全部班测(作业)，如有新出测验重刷即可!', 2.828, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=4b490025f37f3138c6c1dc41fb0da595', 656, 999999],
      ['池馆（按单元）', '又名新时代外语！按单元作业全包！账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 0.303, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=f9aef054e3a8bbf031a673224031cfb7', 678, 999999],
      ['池馆（按本）', '又名新时代外语！ 视频作业全包！账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 0.909, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=f9aef054e3a8bbf031a673224031cfb7', 140, 999999],
      ['中国大学mooc', '全包除主观题，包讨论，包旧版/新版考试，考试只包客观题！账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 0.657, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=a9ce1cd003a1c11a5f9932ebe670ce40', 129, 999999],
      ['长江雨课堂', '包视频，讨论，作业，考试账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 1.8382, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=9d7fd42fd877c68e89343a3a0911f6af', 527, 999999],
      ['雨课堂', '包视频，讨论，作业，考试账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单', 1.818, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=9d7fd42fd877c68e89343a3a0911f6af', 1006, 999999],
      ['智慧树小程序 校内运行 AI课', '包进度，掌握度。 校内运行课程。智慧树小程序课程', 0.828, '学习通', 'https://xxgzs.vip/api/material/image/md5?md5=435947ec854076dd112adf95f2942aa3', 143, 999999],
      ['【霍希】新国开-5天500次-包做不计分项目', '学习次数+学习天数+自动识别用户地区+当天完成+当晚查看+秒上号+一号一ip+视频+形考+大作业+终考+所有不计分项目+所有带分项目+时长+次数+论坛账号密码 填写的时候前后不要有空格显示暂无数据就是', 3.232, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=af73da9bf64de598020dfa0088e421e8', 241, 999999],
      ['青书学堂全包', '全包。1天左右刷完课件+讨论+资料+登录+作业+录播+考试，签到分不包，教师点评分需要老师评分。作业包满��，讨论是围绕课程主题的高质量讨论。人脸上传地址：faceupload.yehuimei.xy', 1.818, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=7c27eac51bef48841579d3ac652cb030', 620, 999999],
      ['随行课堂/welearn单元', '查询方式：账号 密码。可做时长和测试题。时长一单元2h左右，分数96+【学校名称请一定写学校名称！！】账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单      ', 0.3535, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=acc32a4254721c18afe38f403c68c28d', 811, 999999],
      ['随行课堂/welearn整本', '查询方式：账号 密码。包课件+时长+作业。时长一单元2h左右，分数96+【学校名称请一定写学校名称！！】账号密码 填写的时候前后不要有空格显示暂无数据就是账号信息错误自己检查正确后再查课下单     ', 0.858, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=acc32a4254721c18afe38f403c68c28d', 364, 999999],
      ['智慧职教四合一 - 智慧职教MOOC职教云资源库AI课【全包】', '【Ai课】【mooc】: 全包（所有类型课件+作业考试测验+ai讨论+时长），官库满分，支持随机考试。附件作业，考试带随机6-10分钟作答时长。 稳定不漏 官方题库 优势：课件和考试每天检测更新 【职', 0.909, '其他网课', 'https://xxgzs.vip/api/material/image/md5?md5=d310d46aad904416d23ec778f49084fe', 954, 999999]
    ];
    for (const [title, desc, price, cat, image, sales, stock] of products) {
      insert('products', {
        title, description: desc, price, original_price: null,
        image, category: cat, stock,
        sales,
        is_hot: sales > 500, is_new: false, sort_order: 0, status: 1,
      });
    }
    console.log('Seed products inserted');
  }

  if (data.pay_settings.length === 0) {
    insert('pay_settings', {
      id: 1,
      wechat_qr: '',
      alipay_qr: '',
      pay_title: '扫码支付',
      pay_tip: '请扫描下方二维码完成支付，支持微信和支付宝',
      success_title: '支付成功',
      success_content: '您的支付已提交，系统将在1-5分钟内自动到账。如长时间未到账请联系客服。',
      success_redirect_url: '',
      wechat_account: '',
      alipay_account: '',
      updated_at: new Date().toISOString(),
    });
  }

  if (data.site_settings.length === 0) {
    insert('site_settings', {
      id: 1,
      site_name: '一屿刷课平台',
      site_desc: '专业刷课服务平台',
      service_phone: '17712328993',
      service_qq: '2947543703',
      footer_text: '一屿文化出品',
      maintenance_mode: 0,
      maintenance_title: '系统维护中',
      maintenance_content: '系统正在维护升级中，请稍后再试。如有紧急问题请联系客服。',
      updated_at: new Date().toISOString(),
    });
  }

  if (data.banners.length === 0) {
    insert('banners', { title: '一屿刷课平台', subtitle: '专业 · 快速 · 安全 · 信赖', image: '', link: '', sort_order: 0, status: 1, color: 'purple' });
    insert('banners', { title: '充值大优惠', subtitle: '充100送20 · 充500送150', image: '', link: '', sort_order: 1, status: 1, color: 'pink' });
    insert('banners', { title: '学习通全包', subtitle: '专业课选修课全能版', image: '', link: '', sort_order: 2, status: 1, color: 'blue' });
    insert('banners', { title: '全系列覆盖', subtitle: 'U校园 · 智慧树 · 雨课堂', image: '', link: '', sort_order: 3, status: 1, color: 'green' });
  }

  scheduleSave();
  console.log('JSON database initialized successfully');
}

module.exports = {
  load, findOne, findMany, insert, update, remove, count, sum, initData,
  getData: () => { load(); return data; },
};
