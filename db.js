const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/yiyu',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

pool.on('connect', (client) => {
  client.on('error', () => {});
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        qq VARCHAR(20),
        balance DECIMAL(10,2) DEFAULT 0,
        role VARCHAR(20) DEFAULT 'user',
        avatar VARCHAR(255) DEFAULT '',
        status INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,4) NOT NULL,
        original_price DECIMAL(10,2),
        image VARCHAR(255),
        category VARCHAR(100) DEFAULT '常用',
        stock INT DEFAULT 999999,
        sales INT DEFAULT 0,
        is_hot BOOLEAN DEFAULT false,
        is_new BOOLEAN DEFAULT false,
        sort_order INT DEFAULT 0,
        status INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        icon VARCHAR(255),
        sort_order INT DEFAULT 0,
        status INT DEFAULT 1
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_no VARCHAR(50) UNIQUE NOT NULL,
        user_id INT NOT NULL,
        product_id INT NOT NULL,
        product_title VARCHAR(255),
        price DECIMAL(10,4) NOT NULL,
        quantity INT DEFAULT 1,
        total DECIMAL(10,4) NOT NULL,
        account VARCHAR(255),
        password_hint VARCHAR(255),
        remark TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        progress VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS recharges (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        bonus DECIMAL(10,2) DEFAULT 0,
        method VARCHAR(50) DEFAULT 'balance',
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS banners (
        id SERIAL PRIMARY KEY,
        image VARCHAR(255) NOT NULL,
        link VARCHAR(255),
        sort_order INT DEFAULT 0,
        status INT DEFAULT 1
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255),
        content TEXT,
        sort_order INT DEFAULT 0,
        status INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS card_keys (
        id SERIAL PRIMARY KEY,
        card_no VARCHAR(100) UNIQUE NOT NULL,
        card_value DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'unused',
        used_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        used_at TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS group_buys (
        id SERIAL PRIMARY KEY,
        product_id INT NOT NULL,
        title VARCHAR(255),
        group_price DECIMAL(10,4),
        original_price DECIMAL(10,4),
        required_count INT DEFAULT 3,
        current_count INT DEFAULT 0,
        end_time TIMESTAMP,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS red_packets (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255),
        amount DECIMAL(10,2),
        min_spend DECIMAL(10,2) DEFAULT 0,
        total_count INT DEFAULT 100,
        remaining INT DEFAULT 100,
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        status INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_red_packets (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        packet_id INT NOT NULL,
        status VARCHAR(20) DEFAULT 'unused',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255),
        content TEXT,
        type VARCHAR(50) DEFAULT 'system',
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS qq_groups (
        id SERIAL PRIMARY KEY,
        group_no VARCHAR(50) NOT NULL,
        name VARCHAR(100),
        sort_order INT DEFAULT 0,
        status INT DEFAULT 1
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS recharge_packages (
        id SERIAL PRIMARY KEY,
        amount DECIMAL(10,2) NOT NULL,
        bonus DECIMAL(10,2) NOT NULL,
        sort_order INT DEFAULT 0,
        status INT DEFAULT 1
      );
    `);

    const adminCheck = await client.query("SELECT id FROM users WHERE username = 'yiyuwenhua'");
    if (adminCheck.rows.length === 0) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = bcrypt.hashSync('lch200707175412', 10);
      await client.query(
        "INSERT INTO users (username, password, phone, qq, role, balance) VALUES ($1, $2, $3, $4, 'admin', 9999)",
        ['yiyuwenhua', hashedPassword, '17712328993', '2947543703']
      );
      console.log('Admin user created: yiyuwenhua');
    }

    const catCheck = await client.query("SELECT COUNT(*) as cnt FROM categories");
    if (parseInt(catCheck.rows[0].cnt) === 0) {
      const cats = [
        ['全部', '', 0], ['常用', '', 1], ['学习通', '', 2],
        ['知到/智慧树', '', 3], ['智慧职教', '', 4], ['U校园', '', 5],
        ['其他网课', '', 6], ['点赞关注', '', 7], ['客服QQ群', '', 8]
      ];
      for (const [name, icon, sort] of cats) {
        await client.query(
          "INSERT INTO categories (name, icon, sort_order) VALUES ($1, $2, $3)",
          [name, icon, sort]
        );
      }
    }

    const pkgCheck = await client.query("SELECT COUNT(*) as cnt FROM recharge_packages");
    if (parseInt(pkgCheck.rows[0].cnt) === 0) {
      const packages = [
        [10, 1, 0], [30, 4, 1], [50, 8, 2], [100, 20, 3], [500, 150, 4]
      ];
      for (const [amount, bonus, sort] of packages) {
        await client.query(
          "INSERT INTO recharge_packages (amount, bonus, sort_order) VALUES ($1, $2, $3)",
          [amount, bonus, sort]
        );
      }
    }

    const qqCheck = await client.query("SELECT COUNT(*) as cnt FROM qq_groups");
    if (parseInt(qqCheck.rows[0].cnt) === 0) {
      const groups = [
        ['818682616', '二群', 0],
        ['1098134604', '五群', 1],
        ['790551986', '六群', 2],
        ['1065974158', '九群', 3]
      ];
      for (const [group_no, name, sort] of groups) {
        await client.query(
          "INSERT INTO qq_groups (group_no, name, sort_order) VALUES ($1, $2, $3)",
          [group_no, name, sort]
        );
      }
    }

    const annCheck = await client.query("SELECT COUNT(*) as cnt FROM announcements");
    if (parseInt(annCheck.rows[0].cnt) === 0) {
      await client.query(
        "INSERT INTO announcements (title, content, sort_order) VALUES ($1, $2, $3)",
        ['欢迎来到一屿刷课平台', '欢迎回家！请先登录本站，再下单！变化不大！大家稍微熟悉一下就明白了！主要变化在于界面切换，更加流畅！电脑使用更完美！', 0]
      );
      await client.query(
        "INSERT INTO announcements (title, content, sort_order) VALUES ($1, $2, $3)",
        ['充值优惠', '在线充值10送1，30送4，50送8，100送20，500送150。推荐买余额充值卡，下单使用余额支付，不需要跳转支付宝，避免有时跳转有问题没刷上！', 1]
      );
      await client.query(
        "INSERT INTO announcements (title, content, sort_order) VALUES ($1, $2, $3)",
        ['关于支付', '请一定按页面显示金额付款，多付少付都不能到账！很重要！付错无法处理！不管你是多付还是少付！', 2]
      );
    }

    const prodCheck = await client.query("SELECT COUNT(*) as cnt FROM products");
    if (parseInt(prodCheck.rows[0].cnt) === 0) {
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
        ['U校园【整本】', 'U校园整本服务', 1.1900, 'U校园']
      ];
      for (const [title, desc, price, cat] of products) {
        await client.query(
          "INSERT INTO products (title, description, price, category, sales, is_hot) VALUES ($1, $2, $3, $4, $5, $6)",
          [title, desc, price, cat, Math.floor(Math.random() * 1000) + 100, true]
        );
      }
      console.log('Seed products inserted');
    }

    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
