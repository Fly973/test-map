/**
 * ============================================================
 *  高德 API Key 配置（只存在于服务器端，不会暴露给前端）
 * ============================================================
 *  ⚙️ 安全说明（公开仓库部署）：
 *   - 本文件不包含真实 Key！真实 Key 通过【环境变量】注入，防止泄露到公开仓库。
 *   - 本地运行请在项目根目录创建 .env 文件（已被 .gitignore 忽略），写入：
 *       AMAP_WEB_KEY=你的Web服务Key
 *   - 或直接设置系统环境变量 AMAP_WEB_KEY。
 *
 *  ⚙️ 两种 Key 的区别（重要）：
 *   - AMAP_WEB_KEY    ：【Web服务】类型 Key，用于地理编码 / 路线规划接口
 *                       （restapi.amap.com）。请在控制台申请。
 *   - 前端 JS API Key ：【Web端(JS API)】类型 Key，用于加载地图 JS API，
 *                       配置在 public/app.js 顶部（同样建议用环境变量/占位符）。
 *
 *  📌 如何申请 Web 服务 Key：
 *   高德开放平台 (https://lbs.amap.com/) → 控制台 → 应用管理 →
 *   创建应用 → 添加 Key → 服务平台选择「Web服务」→ 复制 Key。
 * ============================================================
 */

// 从环境变量读取 Key；未设置时返回空串并给出提示
module.exports = {
  AMAP_WEB_KEY: process.env.AMAP_WEB_KEY || "",
  AMAP_REST_HOST: "https://restapi.amap.com",
};
