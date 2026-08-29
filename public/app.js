/**
 * ============================================================
 *  高德地图 · 多目的地路线规划 —— 前端逻辑
 *  流程：地址 → 后端地理编码(/api/geocode) → 顺路排序
 *        → 后端驾车规划(/api/route) → 地图渲染标记 + 路线
 *
 *  【v2 修复记录】
 *   1. 地图加载失败：增加安全密钥/白名单诊断提示、脚本加载失败与
 *      地图初始化失败的错误区分、complete 事件确认
 *   2. 途经地址不显示：地址输入后实时调用后端地理编码并在地图上打点，
 *      增/删/改/移地址时地图标记同步更新（列表 ↔ 地图 双向同步）
 * ============================================================
 *  ⚙️ Key 配置（重要）：
 *   - 下方 JS_KEY / JS_SECURITY_CODE 是【前端 JS API Key + 安全密钥】
 *     （用于加载高德地图 JS API 2.0。在控制台申请「Web端(JS API)」类型 Key。
 *      ⚠️ 高德 2021-12-02 之后申请的 Key 强制要求安全密钥：若控制台
 *      该 Key 生成了「安全密钥(jscode)」，必须填到 JS_SECURITY_CODE，
 *      否则地图初始化会失败。同时控制台需配置域名白名单，
 *      必须同时包含 localhost 和 127.0.0.1。）
 *   - 【后端 Web 服务 Key】（地理编码/路线规划接口用）配置在项目根目录 config.js，
 *     只存在服务器端，前端不会也不应接触到它。
 * ============================================================
 */

/* ================= ① 配置区 ================= */
// 高德「Web端(JS API)」Key 与安全密钥
// 公开仓库场景：真实值请通过 URL 参数注入（部署后无需改代码）：
//   访问地址形如  http://你的域名/?amapKey=你的JSKey&amapSecret=你的安全密钥
// 或直接修改下方占位符。
const JS_KEY = new URLSearchParams(location.search).get("amapKey") || "YOUR_JS_API_KEY";
const JS_SECURITY_CODE = new URLSearchParams(location.search).get("amapSecret") || "";
const MAP_STYLE = "amap://styles/dark"; // 地图样式：dark 暗色 / normal 标准 / light 浅色

/* ================= ② 状态 ================= */
const state = {
  addresses: [],        // [{ text, lng, lat, marker }] 途经地址；marker 为地图标记实例
  map: null,            // AMap.Map 实例
  routeMarkers: [],     // 规划完成后的路线标记（按顺序编号）
  polyline: null,       // AMap.Polyline 实例（路线）
  mapReady: false,      // 地图是否初始化完成
};

/* ================= ③ DOM 引用 ================= */
const $ = (id) => document.getElementById(id);
const originInput = $("origin-input");
const addrList = $("addr-list");
const addrCount = $("addr-count");
const addBtn = $("add-addr-btn");
const planBtn = $("plan-btn");
const statusEl = $("status");
const summaryEl = $("summary");
// 批量添加相关
const batchBtn = $("batch-btn");
const batchArea = $("batch-area");
const batchInput = $("batch-input");
const batchConfirm = $("batch-confirm");
const batchCancel = $("batch-cancel");

/* ================= ④ 状态提示 ================= */
function setStatus(msg, type = "") {
  statusEl.textContent = msg;
  statusEl.className = "status " + type;
}

function showSummary(html) {
  summaryEl.innerHTML = html;
  summaryEl.classList.remove("hidden");
}

/* ================= ⑤ 地图初始化（v2 增强版） ================= */
function initMap() {
  if (!JS_KEY) {
    showMapError("未配置高德 JS API Key", "请编辑 app.js 顶部的 JS_KEY");
    return;
  }

  // ⚠️ 安全密钥必须在加载脚本【之前】设置（高德官方要求）
  if (JS_SECURITY_CODE) {
    window._AMapSecurityConfig = { securityJsCode: JS_SECURITY_CODE };
  }

  const script = document.createElement("script");
  script.src = `https://webapi.amap.com/maps?v=2.0&key=${JS_KEY}`;

  script.onload = () => {
    try {
      // 创建地图实例；若 Key 无效/安全密钥缺失，这里会抛错或卡在加载中
      state.map = new AMap.Map("map-container", {
        zoom: 11,
        center: [116.397428, 39.90923],
        mapStyle: MAP_STYLE,
      });

      // complete 事件 = 地图瓦片加载完成，才真正可用
      state.map.on("complete", () => {
        state.mapReady = true;
        setStatus("地图加载完成，请填写出发地和途经地址", "ok");
        syncAddressMarkers(); // 地图就绪后补画已解析的地址标记
      });
    } catch (err) {
      console.error("地图初始化失败:", err);
      showMapError("地图初始化失败", "常见原因见下方说明，请检查控制台（F12）报错");
    }
  };

  script.onerror = () => {
    showMapError(
      "地图脚本加载失败（网络错误）",
      "请检查网络是否能访问 webapi.amap.com，或是否存在代理拦截"
    );
  };

  document.head.appendChild(script);

  // 兜底诊断：10 秒内地图未 complete，多半是 Key/安全密钥/白名单问题
  setTimeout(() => {
    if (!state.mapReady) {
      showMapError(
        "地图加载失败：域名白名单校验未通过（INVALID_USER_DOMAIN）",
        `你当前访问的域名是：<code style="color:#4f8cff">${window.location.host}</code><br>` +
        "请在【高德控制台 → 应用管理 → 该 Key → 设置】的<strong>域名白名单</strong>中，<br>" +
        "<strong>同时添加</strong> localhost 和 127.0.0.1（用英文逗号或分号分隔），保存后刷新本页。<br>" +
        "提示：请用 Chrome/Edge 直接访问 http://localhost:3000 测试，" +
        "内置预览面板的代理域名无法提前加入白名单。"
      );
    }
  }, 10000);
}

// 地图错误占位提示
function showMapError(title, detail) {
  if (state.map) return; // 地图已正常，不覆盖
  $("map-container").innerHTML = `
    <div class="map-placeholder">
      <div class="icon">⚠️</div>
      <p style="color:#ff8c8c;font-weight:600">${title}</p>
      <p style="font-size:12px;max-width:420px;text-align:center;line-height:1.8">${detail}</p>
    </div>`;
}

/* ================= ⑥ 地址列表管理（v2：与地图标记双向同步） ================= */
function addAddressRow(text = "") {
  state.addresses.push({ text, lng: null, lat: null, marker: null });
  renderAddressList();
  const inputs = addrList.querySelectorAll(".addr-input");
  inputs[inputs.length - 1]?.focus();
}

function removeAddress(index) {
  const addr = state.addresses[index];
  // 同步移除地图标记
  if (addr.marker) { addr.marker.remove(); addr.marker = null; }
  state.addresses.splice(index, 1);
  renderAddressList();
  syncAddressMarkers();
}

function moveAddress(index, dir) {
  const target = index + dir;
  if (target < 0 || target >= state.addresses.length) return;
  [state.addresses[index], state.addresses[target]] =
    [state.addresses[target], state.addresses[index]];
  renderAddressList();
  syncAddressMarkers(); // 顺序变化后刷新编号
}

// 输入防抖：停止输入 600ms 后自动解析坐标
const debounceTimers = {};
function debounceResolve(i) {
  clearTimeout(debounceTimers[i]);
  debounceTimers[i] = setTimeout(() => resolveAddress(i), 600);
}

// 单个地址 → 坐标，成功后更新地图标记
async function resolveAddress(index) {
  const addr = state.addresses[index];
  const text = (addr.text || "").trim();
  if (!text) return;

  setStatus(`正在解析「${text}」的坐标...`);
  try {
    const { lng, lat } = await geocode(text);
    addr.lng = lng;
    addr.lat = lat;
    syncAddressMarkers();
    setStatus(`「${text}」坐标解析成功 ✓`, "ok");
  } catch (err) {
    addr.lng = null;
    addr.lat = null;
    syncAddressMarkers();
    setStatus(`❌ 「${text}」解析失败：${err.message}`, "error");
  }
}

// 核心：把 state.addresses 同步渲染为地图标记（编号 + 标题）
function syncAddressMarkers() {
  if (!state.map || !state.mapReady) return;

  state.addresses.forEach((addr, i) => {
    if (addr.lng == null || addr.lat == null) {
      // 无坐标：若有旧标记则移除
      if (addr.marker) { addr.marker.remove(); addr.marker = null; }
      return;
    }
    const pos = [addr.lng, addr.lat];
    if (addr.marker) {
      // 已有标记：仅更新位置与编号文字（地址可能被编辑）
      addr.marker.setPosition(pos);
      addr.marker.setContent(markerContent(i + 1, "#4f8cff"));
    } else {
      // 无标记：新建
      addr.marker = new AMap.Marker({
        position: pos,
        content: markerContent(i + 1, "#4f8cff"),
        title: addr.text,
      });
      addr.marker.on("click", () => {
        addr.marker.setLabel({
          content: `<div style="background:#fff;padding:4px 8px;border-radius:4px;font-size:12px;color:#333">${addr.text}</div>`,
          direction: "top",
        });
      });
      state.map.add(addr.marker);
    }
  });

  // 让所有有坐标的标记都在视野内
  const visible = state.addresses.filter((a) => a.marker).map((a) => a.marker);
  if (visible.length > 0) state.map.setFitView(visible, false, [60, 60, 60, 60]);
}

// 标记样式：编号圆形
function markerContent(num, color) {
  return `<div style="
    width:28px;height:28px;border-radius:50%;
    background:${color};color:#fff;
    display:flex;align-items:center;justify-content:center;
    font-size:13px;font-weight:bold;border:2px solid #fff;
    box-shadow:0 2px 6px rgba(0,0,0,.4);">${num}</div>`;
}

function renderAddressList() {
  addrList.innerHTML = "";
  addrCount.textContent = state.addresses.length;

  state.addresses.forEach((addr, i) => {
    const li = document.createElement("li");
    li.className = "addr-item";

    li.innerHTML = `
      <span class="addr-index">${i + 1}</span>
      <input class="addr-input" type="text" placeholder="地址 ${i + 1}" value="${escapeHtml(addr.text)}">
      <div class="addr-ops">
        <button class="btn btn-op" title="上移" data-op="up">↑</button>
        <button class="btn btn-op" title="下移" data-op="down">↓</button>
        <button class="btn btn-op delete" title="删除" data-op="del">✕</button>
      </div>
    `;

    // v2：输入变化 → 同步 state → 防抖自动解析坐标 → 地图打点
    li.querySelector(".addr-input").addEventListener("input", (e) => {
      state.addresses[i].text = e.target.value;
      state.addresses[i].lng = null;
      state.addresses[i].lat = null;
      debounceResolve(i);
    });

    li.querySelector(".addr-ops").addEventListener("click", (e) => {
      const op = e.target.dataset.op;
      if (op === "up") moveAddress(i, -1);
      if (op === "down") moveAddress(i, 1);
      if (op === "del") removeAddress(i);
    });

    // ★ 关键修复：把新创建的 li 挂载到列表容器（此前遗漏导致列表永远为空）
    addrList.appendChild(li);
  });
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ================= ⑦ 调用后端 API ================= */
async function geocode(address) {
  const resp = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  if (!data.location) throw new Error(`未解析到坐标`);
  const [lng, lat] = data.location.split(",").map(Number);
  return { lng, lat };
}

// 规划用：返回 [出发地, ...途经点] 的坐标数组（有缓存的直接用，未解析的现场解析）
async function collectPoints(originText, addrTexts) {
  const points = [{ text: originText, ...(await geocode(originText)) }];
  setStatus(`出发地已解析 ✓，处理 ${addrTexts.length} 个途经地址...`);

  for (let i = 0; i < addrTexts.length; i++) {
    const addr = state.addresses[i];
    if (addr.lng != null && addr.lat != null) {
      points.push({ text: addrTexts[i], lng: addr.lng, lat: addr.lat }); // 复用已解析坐标
    } else {
      const { lng, lat } = await geocode(addrTexts[i]);                    // 现场解析
      points.push({ text: addrTexts[i], lng, lat });
    }
    setStatus(`地理编码：${i + 1}/${addrTexts.length} ✓`, "ok");
  }
  return points;
}

/* ================= ⑧ 顺路排序（最近邻启发式） ================= */
function nearestNeighborSort(points) {
  const result = [points[0]];
  const remaining = points.slice(1);

  let current = points[0];
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = distance(current, remaining[i]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    result.push(next);
    current = next;
  }
  return result;
}

function distance(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* ================= ⑨ 调用后端路线规划 ================= */
async function planRoute(orderedPoints) {
  const [origin, ...rest] = orderedPoints;
  const destination = rest.pop();
  const waypoints = rest;

  const params = new URLSearchParams({
    origin: `${origin.lng},${origin.lat}`,
    destination: `${destination.lng},${destination.lat}`,
  });
  if (waypoints.length > 0) {
    params.set("waypoints", waypoints.map((p) => `${p.lng},${p.lat}`).join(";"));
  }

  setStatus("正在请求驾车路线规划...");
  const resp = await fetch(`/api/route?${params}`);
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/* ================= ⑩ 渲染路线到地图 ================= */
function renderRoute(data, orderedPoints) {
  if (!state.map || !state.mapReady) {
    setStatus("地图未加载完成，无法渲染路线", "error");
    return;
  }

  // 清除旧的路线标记与路线
  state.routeMarkers.forEach((m) => m.remove());
  state.routeMarkers = [];
  if (state.polyline) state.polyline.remove();

  // 1) 路线顺序标记（起=蓝色，途经/终点按顺序，颜色轮换）
  const markerColors = ["#4f8cff", "#ff8c4f", "#5ddb7c", "#c86bff", "#ffd34f"];
  orderedPoints.forEach((p, i) => {
    const marker = new AMap.Marker({
      position: [p.lng, p.lat],
      content: markerContent(i === 0 ? "起" : i, markerColors[i % markerColors.length]),
      title: p.text,
    });
    marker.on("click", () => {
      marker.setLabel({
        content: `<div style="background:#fff;padding:4px 8px;border-radius:4px;font-size:12px;color:#333">${p.text}</div>`,
        direction: "top",
      });
    });
    state.map.add(marker);
    state.routeMarkers.push(marker);
  });

  // 2) 路线 polyline（取第一条方案）
  const path = data.route.paths?.[0]?.steps
    ?.flatMap((s) => (s.polyline || "").split(";"))
    .filter(Boolean)
    .map((seg) => seg.split(",").map(Number));

  if (path && path.length > 0) {
    state.polyline = new AMap.Polyline({
      path,
      strokeColor: "#4f8cff",
      strokeWeight: 6,
      strokeOpacity: 0.85,
      lineJoin: "round",
    });
    state.map.add(state.polyline);
  }

  // 3) 视野自适应
  state.map.setFitView(state.routeMarkers, false, [80, 80, 80, 80]);

  // 4) 摘要
  const first = data.route.paths?.[0];
  if (first) {
    const km = (first.distance / 1000).toFixed(1);
    const min = Math.round(first.duration / 60);
    showSummary(`
      <strong>✅ 路线规划完成</strong><br>
      总距离：<strong>${km} km</strong> ｜ 预计耗时：<strong>${min} 分钟</strong><br>
      途经顺序：${orderedPoints.map((p) => p.text).join(" → ")}
    `);
  }
}

/* ================= ⑪ 主流程：规划路线 ================= */
async function handlePlan() {
  const originText = originInput.value.trim();
  const addrTexts = state.addresses.map((a) => a.text.trim()).filter(Boolean);

  if (!originText) { setStatus("请先填写出发地", "error"); return; }
  if (addrTexts.length === 0) { setStatus("请至少添加一个途经地址", "error"); return; }
  if (addrTexts.length > 16) {
    setStatus("高德接口最多支持 16 个途经点，请减少地址数量", "error");
    return;
  }
  if (!state.mapReady) { setStatus("地图尚未加载完成，请稍后再试", "error"); return; }

  planBtn.disabled = true;
  summaryEl.classList.add("hidden");

  try {
    // 1) 收集坐标（复用已解析的）
    const points = await collectPoints(originText, addrTexts);

    // 2) 顺路排序
    setStatus("正在按顺路程度排序...");
    const ordered = nearestNeighborSort(points);
    ordered[0].text = originText;

    // 3) 驾车路线规划
    const data = await planRoute(ordered);

    // 4) 渲染
    setStatus("规划完成 ✓", "ok");
    renderRoute(data, ordered);
  } catch (err) {
    console.error(err);
    setStatus("❌ " + (err.message || "规划失败"), "error");
  } finally {
    planBtn.disabled = false;
  }
}

/* ================= ⑫ 事件绑定与初始化 ================= */
addBtn.addEventListener("click", () => addAddressRow());
planBtn.addEventListener("click", handlePlan);

originInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); addAddressRow(); }
});

/* ---- 批量粘贴添加 ---- */
// 展开/收起批量输入区
batchBtn.addEventListener("click", () => {
  const isHidden = batchArea.classList.contains("hidden");
  if (isHidden) {
    batchArea.classList.remove("hidden");
    batchInput.focus();
  } else {
    batchArea.classList.add("hidden");
  }
});

batchCancel.addEventListener("click", () => {
  batchArea.classList.add("hidden");
  batchInput.value = "";
});

// 解析粘贴文本：按 换行/逗号/分号/顿号/空格 拆分，去掉空项
function parseBatchText(text) {
  return text
    .split(/[\n,，;；、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

batchConfirm.addEventListener("click", () => {
  const raw = batchInput.value;
  if (!raw.trim()) { setStatus("请先粘贴要添加的地址", "error"); return; }

  // 解析 + 去重（对已有地址也去重）
  const parsed = parseBatchText(raw);
  const existing = new Set(state.addresses.map((a) => a.text.trim()));
  const fresh = parsed.filter((t) => !existing.has(t));

  if (fresh.length === 0) {
    setStatus("所有地址都已存在，未新增", "error");
    batchArea.classList.add("hidden");
    batchInput.value = "";
    return;
  }

  // 批量加入（一次 push + 一次渲染，避免逐条重建 DOM）
  fresh.forEach((t) => state.addresses.push({ text: t, lng: null, lat: null, marker: null }));
  renderAddressList();
  syncAddressMarkers();

  // 收起输入区
  batchArea.classList.add("hidden");
  batchInput.value = "";

  const dup = parsed.length - fresh.length;
  setStatus(
    `✅ 已添加 ${fresh.length} 个地址${dup > 0 ? `（跳过 ${dup} 个重复）` : ""}，正在解析坐标...`,
    "ok"
  );

  // 逐个解析坐标（复用 debounce 逻辑，直接触发）
  fresh.forEach((addr, i) => {
    const idx = state.addresses.indexOf(addr);
    if (idx !== -1) debounceResolve(idx);
  });
});

// 初始添加两行示例地址（会自动解析并打点）
addAddressRow("北京站");
addAddressRow("颐和园");

initMap();
