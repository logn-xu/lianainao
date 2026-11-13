# 我们的日常

一个给两个人用的微信小程序：一起记日常、看统计，还能互相点菜下厨。基于微信云开发，数据以云端为准、本地缓存兜底；未开通云环境时记录仍会保存在本机。

## 功能

### 日常

- 五类记录：奶茶、放纵餐、姨妈、运动、小事，支持数量、备注、原图上传与编辑。
- 时光记录时间线、月历热力图、小统计（月度汇总、周期预测、连续打卡）。
- 双人同步：本地先写缓存再排队上传，云端结果合并回本地；换手机或重装后可用邀请码恢复绑定。

### 御膳房

- 两人互相当厨师和食客：为 TA 定制菜单，或点 TA 写的菜。
- 订单状态由云函数校验流转：待制作 → 制作中 → 待用餐 → 已完成 / 已取消；支持制作记录、图片和用餐评分。
- 内置 20 条菜品与「一件小事」模板（带配图）。首次开伙自动补齐；新增菜品时可选模板一键预填，也可从空白自定义，选完仍能修改任意字段。
- 预置菜单按版本增量补齐，用户删掉的菜不会被自动补回来。

### 我的

- 昵称、头像、在一起的日子、平均周期。
- 创建 / 加入情侣空间（6 位邀请码）、立即同步、复制数据备份、解除绑定。

## 目录结构

```
├── app.js / app.json / app.wxss     小程序入口、页面注册与全局样式
├── pages/
│   ├── index/                      日常：时光记录、月历、小统计
│   ├── kitchen/                    御膳房：点餐、订单、菜单管理
│   └── mine/                       我的：资料、情侣空间、同步
├── components/                     composer、record-feed、stats-panel、navigation-bar
├── utils/                          store、sync、cloud、kitchen、images、stats、types、util
├── images/dishes/                  20 张内置模板配图（随小程序包发布）
└── cloudfunctions/api/             唯一云函数
    ├── index.js                    入口、动作路由、集合初始化
    ├── kitchen.js                  御膳房业务与预置模板
    └── package.json                依赖 wx-server-sdk ~2.6.3
```

## 快速开始

1. 用微信开发者工具导入本项目，填入自己的 AppID，并**开通云开发**。
2. 如果账号有多个云环境，把环境 ID 填到 `app.js` 的 `globalData.cloudEnv`；留空则使用默认环境。
3. 右键 `cloudfunctions/api` →「上传并部署：云端安装依赖」，确认 `index.js` 与 `kitchen.js` 一起上传。
4. 编译运行：进入「我的」创建情侣空间并把邀请码发给 TA；首次进入「御膳房」会自动建集合并补齐内置模板。
5. 若页面提示数据库未就绪，可在状态卡片点「初始化数据库」。弹窗会显示每个集合的创建结果、当前云环境 ID 和本次补齐的模板数量；若某项失败，也会给出具体原因。

## 云函数 API

小程序端统一通过 `utils/cloud.js` 调用 `api` 云函数，由 `event.action` 分发：

| 分类 | action |
| --- | --- |
| 情侣空间 | `state`、`createCouple`、`joinCouple`、`saveProfile`、`unbind` |
| 日常记录 | `listRecords`、`addRecord`、`updateRecord`、`deleteRecord`、`clearRecords` |
| 初始化 | `initDb` |
| 御膳房 | `getKitchen`、`saveDish`、`deleteDish`、`createOrder`、`startCooking`、`saveCooking`、`cancelOrder`、`reviewOrder` |

数据库集合共 4 个，首次调用时自动创建：

- `couples`：情侣空间、邀请码、成员、周期设置
- `records`：日常记录
- `kitchenDishes`：菜单（含预置模板）
- `kitchenOrders`：订单与状态流转

## 数据与资源

- 本地缓存键：`couple_profile_v1`（资料）、`couple_records_v1`（记录与待上传队列）。
- 内置模板配图位于 `images/dishes/`，是小程序包内本地路径，不依赖云存储或域名配置。
- 用户上传的原图存到云存储 `daily/yyyymmdd/` 目录，数据库里保存 `cloud://` 文件 ID。
- `.cloudbase/`（开发者工具云函数容器缓存）与 `node_modules/` 已在 `.gitignore` 中排除。

## 常见问题

- **提示「云函数未更新」或 `UNKNOWN_ACTION`**：云端跑的还是旧版 `api`，按「快速开始」第 3 步重新上传部署。
- **控制台里看不到集合**：核对初始化弹窗里的云环境 ID 与控制台当前所选环境是否一致；多环境时需在 `app.js` 指定 `cloudEnv`。
- **一直停在「正在准备小厨房…」**：查看开发者工具 Console 与云函数日志；`cloud.call` 的失败原因会带在错误详情里。
- **保存模板菜后配图丢失**：说明云端 `normalizeImages` 还是旧版，重新部署云函数即可。
- 御膳房目前**不涉及支付**，只负责把心意送到 TA 手上。
