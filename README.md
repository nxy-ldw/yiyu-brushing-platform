# 一屿刷课平台

现代化刷课服务平台，基于 Node.js + Express + PostgreSQL 构建。

## 功能特性

### 用户系统
- 用户注册/登录（用户名+密码）
- QQ OAuth 登录
- JWT Token 认证
- 用户余额系统
- 消息中心

### 商品/服务
- 学习通全包/考试/选修课
- 知到/智慧树 慢刷/考试
- 智慧职教 MOOC/职教云/资源库
- U校园 AI版/整本/单元/班测
- 抖音点赞/关注
- 分类筛选 + 关键词搜索 + 多种排序

### 订单系统
- 余额支付下单
- 订单状态跟踪
- 进度查询
- 订单历史记录

### 充值系统
- 充值优惠：10送1 / 30送4 / 50送8 / 100送20 / 500送150
- 卡密兑换
- 红包领取

### 后台管理
- 数据看板（用户数/订单数/交易额/今日订单）
- 用户管理（搜索/封禁/充值余额）
- 商品管理（增删改查/上下架）
- 订单管理（状态更新）
- 公告管理
- Banner管理
- 卡密生成与管理
- 充值管理

### 其他功能
- 拼团活动
- 红包中心
- 公告系统
- QQ客服群展示

## 技术栈
- 后端：Node.js + Express
- 数据库：PostgreSQL
- 前端：HTML/CSS/JavaScript (SPA)
- 认证：JWT + bcrypt
- 第三方：QQ OAuth 2.0

## 本地开发
```bash
npm install
npm start
```

## 环境变量
| 变量名 | 说明 |
|--------|------|
| PORT | 服务端口（默认3000） |
| DATABASE_URL | PostgreSQL连接字符串 |
| JWT_SECRET | JWT密钥 |
| QQ_APP_ID | QQ互联AppID |
| QQ_APP_KEY | QQ互联AppKey |
| QQ_REDIRECT_URI | QQ登录回调地址 |

## Railway 部署
1. 在 GitHub 上 Fork 或 Clone 本仓库
2. 登录 [Railway](https://railway.app)
3. New Project → Deploy from GitHub repo
4. 选择本仓库
5. 添加 PostgreSQL 数据库服务
6. 设置环境变量
7. 自动部署

## License
MIT
