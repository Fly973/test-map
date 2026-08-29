# 高德地图 · 多目的地路线规划（Web API 调用流程测试）

一个跑通「高德 Web API」完整调用链的最小示例项目：
**地址 → 地理编码(转坐标) → 顺路排序 → 驾车路线规划 → 地图渲染**

## 技术栈

- 后端：Node.js + Express（代理高德接口，规避跨域，Key 不出后端）
- 前端：原生 HTML/CSS/JS + 高德地图 JS API 2.0

## 项目结构

```
amap-route-demo/
├── package.json        # 依赖与启动脚本
├── .env.example        # ⚙️ 环境变量模板（复制为 .env 填入真实 Key）
├── .gitignore          # 忽略 node_modules / .env
├── config.js           # 后端配置（Key 从环境变量读取，仓库内不含真实 Key）
├── server.js           # Express 后端代理 + 静态托管
├── README.md
└── public/             # 前端页面
    ├── index.html
    ├── style.css
    └── app.js          # ⚙️ 前端 JS API Key（支持 URL 参数注入）
```

## 需要两个 Key（类型不同，务必区分）

| 用途 | Key 类型 | 配置方式 |
|---|---|---|
| 地图加载 / 渲染 | 「Web端(JS API)」 | `public/app.js` 顶部 `JS_KEY`（或 URL 参数 `?amapKey=`） |
| 地理编码 / 路线规划 | 「Web服务」 | 环境变量 `AMAP_WEB_KEY`（见 `.env`） |

> ⚠️ 两种 Key 不能混用：用「Web端」Key 调 Web 服务接口会报
> `USERKEY_PLAT_NOMATCH (10009)`。申请方式见各文件顶部注释。

## 安全说明（公开仓库部署）

本仓库**不包含任何真实 Key**：
- 后端 Key 通过环境变量注入：复制 `.env.example` 为 `.env` 并填入 `AMAP_WEB_KEY`（`.env` 已被 git 忽略）
- 前端 Key 通过 URL 参数注入（部署后无需改代码）：
  ```
  http://你的域名/?amapKey=你的JSKey&amapSecret=你的安全密钥
  ```
  或直接修改 `public/app.js` 顶部的 `JS_KEY` / `JS_SECURITY_CODE` 占位符

## 运行步骤

```bash
# 1. 安装依赖（仅 express）
npm install

# 2. 配置 Key
cp .env.example .env        # 然后编辑 .env 填入 Web服务 Key
# 前端 Key：编辑 public/app.js，或访问时加 ?amapKey=xxx&amapSecret=xxx

# 3. 启动
npm start

# 4. 浏览器访问
#    http://localhost:3000
```

## 使用流程

1. 输入「出发地」
2. 点「＋ 添加地址」逐个添加，或点「📋 批量粘贴地址」一次性导入多个（支持换行/逗号/分号/顿号分隔）
3. 点「🚀 规划路线」
   - 后端逐个把地址转成坐标（`/api/geocode`）
   - 前端最近邻启发式按「顺路」重排
   - 后端调驾车路线规划（`/api/route`）
   - 地图渲染编号标记 + 路线 + 距离/耗时摘要
4. 右侧地图可自由拖拽/缩放

## 接口一览（后端）

| 接口 | 说明 |
|---|---|
| `GET /api/geocode?address=北京站` | 地址 → 坐标，返回 `{location: "lng,lat"}` |
| `GET /api/route?origin=..&destination=..&waypoints=..` | 驾车路线规划，waypoints 为 `lng,lat;lng,lat` |

## 限制与后续可扩展点

- 高德驾车接口单次最多 **16 个途经点**（前端已做提示）
- 可扩展：出行方式（公交/步行/骑行）、POI 搜索转坐标、分段规划超多点位
