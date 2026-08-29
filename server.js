/**
 * ============================================================
 *  高德地图 · 多目的地路线规划 —— 后端代理服务 (Express)
 *  职责：
 *   1. 托管前端静态页面 (public/)
 *   2. 代理高德 Web 服务 API（地理编码 / 驾车路线规划）
 *      —— 在服务器端注入 Key，规避跨域问题，且 Key 不出后端
 * ============================================================
 */

const express = require("express");
const path = require("path");
const fs = require("fs");

// 极简 .env 加载（不引入 dotenv 依赖）：读取项目根目录 .env 到 process.env
(function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf8")
      .split("\n")
      .forEach((line) => {
        const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
      });
  }
})();

const config = require("./config");

const app = express();
const PORT = process.env.PORT || 3000; // Railway/云平台会注入 PORT 环境变量

/* ============ 工具：调用高德 Web 服务 API ============ */
/**
 * 发起 GET 请求到高德接口并校验返回状态
 * @param {string} apiPath - 高德接口路径，如 /v3/geocode/geo
 * @param {object} params  - 请求参数（不含 key，key 在此统一注入）
 * @returns {Promise<object>} 高德返回的 JSON 数据
 */
async function callAmap(apiPath, params) {
  if (!config.AMAP_WEB_KEY) {
    throw new Error("未配置 Web 服务 Key：请在项目根目录创建 .env（参照 .env.example）并设置 AMAP_WEB_KEY");
  }
  const query = new URLSearchParams({ ...params, key: config.AMAP_WEB_KEY });
  const url = `${config.AMAP_REST_HOST}${apiPath}?${query}`;
  const resp = await fetch(url);
  const data = await resp.json();

  // 高德约定：status=1 表示成功，其余为失败
  if (data.status !== "1") {
    throw new Error(`高德接口错误: ${data.info} (${data.infocode})`);
  }
  return data;
}

/* ============ 接口一：地理编码（地址 → 坐标） ============ */
app.get("/api/geocode", async (req, res) => {
  const address = (req.query.address || "").trim();
  if (!address) return res.json({ error: "缺少 address 参数" });

  try {
    const data = await callAmap("/v3/geocode/geo", { address });
    const geocode = data.geocodes && data.geocodes[0];
    if (!geocode) return res.json({ error: `「${address}」未解析到坐标` });

    res.json({
      address: geocode.formatted_address || address,
      location: geocode.location, // "lng,lat" 字符串
    });
  } catch (err) {
    res.json({ error: err.message });
  }
});

/* ============ 接口二：驾车路线规划 ============ */
// origin / destination 为 "lng,lat"，waypoints 为 "lng,lat;lng,lat"（可空）
app.get("/api/route", async (req, res) => {
  const { origin, destination, waypoints } = req.query;
  if (!origin || !destination) {
    return res.json({ error: "缺少 origin 或 destination 参数" });
  }

  try {
    const params = {
      origin,
      destination,
      show_fields: "cost", // 返回打车费用/耗时等附加字段（可选）
    };
    if (waypoints) params.waypoints = waypoints;

    const data = await callAmap("/v5/direction/driving", params);
    res.json(data);
  } catch (err) {
    res.json({ error: err.message });
  }
});

/* ============ 静态托管前端 ============ */
app.use(express.static(path.join(__dirname, "public")));

/* ============ 启动 ============ */
app.listen(PORT, () => {
  console.log(`✅ 高德路线规划测试项目已启动`);
  console.log(`   打开浏览器访问: http://localhost:${PORT}`);
  console.log(`   ⚠️ 若未配置 AMAP_WEB_KEY 环境变量，接口调用会提示未配置`);
});
