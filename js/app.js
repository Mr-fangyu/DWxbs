/* 党务小博士 · 前端逻辑 */
(function () {
  "use strict";

  const state = {
    token: localStorage.getItem("dsh_token") || "",
    user: null,
    conversationId: null,
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ============================ 图标 / 头像 ============================
  const MASCOT_AVATAR = "/static/assets/icons/xiaoboshi-avatar.png";

  function mascotHtml() {
    return `<img class="mascot-img" src="${MASCOT_AVATAR}" alt="党务小博士" />`;
  }

  // ============================ 工具 ============================
  function toast(msg, type) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast show " + (type || "");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => (t.className = "toast"), 2400);
  }

  async function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    if (state.token) opts.headers["X-Token"] = state.token;
    const res = await fetch(path, opts);
    if (res.status === 401 || res.status === 403) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || "无权限访问");
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || ("请求失败 " + res.status));
    }
    return res.json();
  }

  // ============================ 轻量 Markdown 渲染 ============================
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function renderInline(s) {
    return esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }
  function renderMarkdown(text) {
    const lines = text.split("\n");
    let html = "", listType = null, para = [];
    const closeList = () => { if (listType) { html += `</${listType}>`; listType = null; } };
    const flushPara = () => { if (para.length) { html += `<p>${renderInline(para.join("<br>"))}</p>`; para = []; } };
    for (let line of lines) {
      const t = line.trim();
      if (/^#{1,3}\s/.test(t)) { closeList(); flushPara(); html += `<h3>${renderInline(t.replace(/^#{1,3}\s*/, ""))}</h3>`; continue; }
      const ol = t.match(/^(\d+)[\.、]\s*(.*)/);
      const ul = t.match(/^[-•]\s*(.*)/);
      if (ol || ul) {
        const type = ol ? "ol" : "ul", content = ol ? ol[2] : ul[1];
        if (listType !== type) { closeList(); listType = type; html += `<${type}>`; }
        html += `<li>${renderInline(content)}</li>`;
        continue;
      }
      if (t === "") { closeList(); flushPara(); continue; }
      closeList(); para.push(t);
    }
    closeList(); flushPara();
    return html;
  }

  // ============================ 角色弹窗 ============================
  function openRoleModal() {
    const m = $("#role-modal");
    if (!m) return;
    m.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    const first = m.querySelector(".role-card");
    if (first) first.focus();
  }
  function closeRoleModal() {
    const m = $("#role-modal");
    if (!m) return;
    m.classList.add("hidden");
    document.body.style.overflow = "";
  }

  // ============================ 桌面宠物（全局悬浮） ============================
  /* ---------- 配置 ---------- */
  const PET_CFG = {
    posKey: "dsh_pet_pos_v2",   // 分场景记忆：{ landing:{x,y}, app:{x,y} }
    minKey: "dsh_pet_min",
    actionMs: 1600,
    restAfter: 22000,           // 空闲 → 主动休息提醒
    dozeAfter: 48000,           // 打盹
    sleepAfter: 85000,          // 睡觉
    wanderAfter: 150000,        // 自行溜达
    angryAfter: 230000,         // 生气
    greetBack: 40000,           // 离开超过该时长后回来 → 打招呼
    focusWindow: 15000,         // 专注度统计窗口
    moveWeight: 0.3,            // 鼠标移动计权（低于点击/按键）
    actWeight: 2.0,             // 点击 / 按键 / 滚轮计权
    focusScore: 12,             // 窗口内加权分 ≥ 该值视为"用户专注 → 静默"
    gravity: 1500,              // 甩飞物理：重力 px/s²
    airDrag: 0.9955,            // 空气阻尼
    restitution: 0.52,          // 弹性系数
    restSpeed: 28,              // 静止判定 px/s
    flingMin: 340,              // 触发甩飞的最小速度 px/s
  };
  const BASE_MOODS = ["idle", "focus", "resting", "dozing", "sleeping", "wandering", "angry"];
  const PET_ACTIONS = ["is-hopping", "is-swaying", "is-wiggling"];
  const PET_TIPS = {
    landing: [
      "点我就能选择身份哦～",
      "有问题随时来问我！",
      "发展党员、党费、组织关系…我都懂",
      "提问别超过 35 个字，我会答得更准～",
      "按住我可以拖走，甩一下我会飞出去",
      "党务流程不清楚？问我准没错",
    ],
    app: [
      "有问题随时问我～",
      "点我就回到问答",
      "别忘了：提问别超过 35 个字",
      "我可以帮你查党务流程和材料清单",
      "累了就歇会儿，我一直在这儿",
      "按住我可以拖走，甩一下我会飞出去",
    ],
  };
  const REST_TIPS = [
    "起来动一动吧，坐久了腰会酸的～",
    "喝口水再继续，我等你～",
    "看看远处，让眼睛歇一会儿",
    "要不要伸个懒腰？",
  ];
  const ANGRY_TIPS = [
    "哼！都不理我…",
    "喂～我在这儿呢！",
    "再不理我，我可要生气了！",
    "你是不是把我忘了…",
  ];
  const GREET_BACK_TIPS = [
    "你回来啦～",
    "嘿，我等你好久了！",
    "欢迎回来！有什么要问的吗？",
  ];

  const pet = {
    dragging: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0,
    samples: [], bubbleTimer: 0, blinkTimer: 0, minimizeTimer: 0,
    minimized: false, tip: 0, mood: "idle", lastWander: 0, said: {},
  };
  // 用户活跃度（用于专注 / 休息判定）
  const activity = { last: Date.now(), marks: [], mmAt: 0 };
  // 甩飞物理状态
  const phys = { on: false, x: 0, y: 0, vx: 0, vy: 0, raf: 0, last: 0 };

  function petEl() { return document.getElementById("pet"); }
  function inApp() { const a = $("#app"); return !!a && !a.classList.contains("hidden"); }
  function petTips() { return inApp() ? PET_TIPS.app : PET_TIPS.landing; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ---------- 位置 ---------- */
  function setPetPosRaw(x, y) {
    const el = petEl();
    if (!el) return;
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.classList.toggle("bubble-left", x < 190);
  }

  /** 夹取到视口内并定位 */
  function setPetPos(x, y) {
    const el = petEl();
    if (!el) return;
    const w = el.offsetWidth || 152;
    const h = el.offsetHeight || 190;
    x = Math.max(6, Math.min(x, window.innerWidth - w - 6));
    y = Math.max(6, Math.min(y, window.innerHeight - h - 6));
    setPetPosRaw(x, y);
  }

  function defaultPetPos() {
    const el = petEl();
    const w = el ? el.offsetWidth : 152;
    const h = el ? el.offsetHeight : 190;
    if (window.innerWidth <= 820) {
      return { x: (window.innerWidth - w) / 2, y: window.innerHeight - h - 30 };
    }
    if (inApp()) {
      // 右下角，上移避开聊天输入条（约 96px）
      return { x: window.innerWidth - w - 30, y: window.innerHeight - h - 104 };
    }
    return { x: window.innerWidth - w - 68, y: window.innerHeight - h - 56 };
  }

  function readPetPosStore() {
    try { return JSON.parse(localStorage.getItem(PET_CFG.posKey) || "{}") || {}; } catch (e) { return {}; }
  }

  function savePetPos() {
    const el = petEl();
    if (!el) return;
    const store = readPetPosStore();
    store[inApp() ? "app" : "landing"] = {
      x: parseFloat(el.style.left) || 0,
      y: parseFloat(el.style.top) || 0,
    };
    try { localStorage.setItem(PET_CFG.posKey, JSON.stringify(store)); } catch (e) { /* 隐私模式忽略 */ }
  }

  function initPetPosition() {
    const el = petEl();
    if (!el) return;
    const saved = readPetPosStore()[inApp() ? "app" : "landing"];
    if (saved && isFinite(saved.x) && isFinite(saved.y)) { setPetPos(saved.x, saved.y); return; }
    const d = defaultPetPos();
    setPetPos(d.x, d.y);
  }

  /* ---------- 说话 ---------- */
  function petSay(text, hold) {
    const el = petEl(), bubble = $("#pet-bubble"), txt = $("#pet-bubble-text");
    if (!el || !bubble || !txt || pet.minimized) return;
    txt.textContent = text;
    bubble.classList.add("show");
    el.classList.add("is-talking");
    clearTimeout(pet.bubbleTimer);
    pet.bubbleTimer = setTimeout(() => {
      bubble.classList.remove("show");
      el.classList.remove("is-talking");
    }, hold || 4200);
  }

  /** 同一 key 在 everyMs 内只提示一次，避免刷屏 */
  function sayOnce(key, text, hold, everyMs) {
    const now = Date.now();
    if (now - (pet.said[key] || 0) < (everyMs || 60000)) return false;
    pet.said[key] = now;
    petSay(text, hold);
    return true;
  }

  function petNextTip() {
    const tips = petTips();
    pet.tip = (pet.tip + 1) % tips.length;
    petSay(tips[pet.tip]);
  }

  /* ---------- 一次性动作 ---------- */
  function petAction(cls, ms) {
    const el = petEl();
    if (!el) return;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  function petGreet(text) {
    const el = petEl();
    if (!el || pet.minimized || pet.dragging || phys.on) return;
    setBaseMood("idle");                 // 同步 mood 状态，避免睡眠类残留
    petAction("is-greeting", 2200);
    petSay(text || pick(GREET_BACK_TIPS), 3400);
    activity.last = Date.now();
  }

  /* ---------- 眨眼 ---------- */
  function scheduleBlink() {
    clearTimeout(pet.blinkTimer);
    const delay = 2400 + Math.random() * 4200;
    pet.blinkTimer = setTimeout(() => {
      const el = petEl();
      if (el && !pet.dragging && !phys.on && !pet.minimized &&
          !el.classList.contains("is-sleeping") &&
          !el.classList.contains("is-dozing") &&
          $("#role-modal").classList.contains("hidden")) {
        petAction("is-blinking", 320);
      }
      scheduleBlink();
    }, delay);
  }

  /* ---------- 用户活跃度 ---------- */
  function markActivity(kind) {
    const now = Date.now();
    const gap = now - activity.last;
    activity.last = now;
    // mousemove 高频，节流为 500ms 计一次；计权低于点击/按键
    if (kind === "move") {
      if (now - activity.mmAt < 500) return;
      activity.mmAt = now;
    }
    activity.marks.push({ t: now, w: kind === "move" ? PET_CFG.moveWeight : PET_CFG.actWeight });
    if (activity.marks.length > 200) activity.marks.shift();

    // 长时间没互动后回来 → 打招呼
    if (gap > PET_CFG.greetBack) petGreet();
  }

  function focusScore() {
    const now = Date.now();
    let s = 0;
    for (let i = activity.marks.length - 1; i >= 0; i--) {
      if (now - activity.marks[i].t < PET_CFG.focusWindow) s += activity.marks[i].w;
      else break;
    }
    return s;
  }

  /* ---------- 情绪状态机 ---------- */
  function setBaseMood(m) {
    const el = petEl();
    if (!el || m === pet.mood) return;
    if (BASE_MOODS.includes(pet.mood)) el.classList.remove("is-" + pet.mood);
    pet.mood = m;
    el.classList.add("is-" + m);

    if (m === "dozing") sayOnce("doze", "有点儿困了…眯一会儿", 3200, 120000);
    if (m === "sleeping") { petSay("Zzz…", 2600); }
    if (m === "angry") sayOnce("angry", pick(ANGRY_TIPS), 4200, 70000);
    if (m === "resting") sayOnce("rest", pick(REST_TIPS), 4200, 55000);
  }

  /** 每秒评估一次：专注 / 休息 / 打盹 / 睡觉 / 溜达 / 生气 */
  function petMoodTick() {
    const el = petEl();
    if (!el || pet.dragging || phys.on || pet.minimized) return;
    if (!$("#role-modal").classList.contains("hidden")) return;

    const idle = Date.now() - activity.last;
    const score = focusScore();

    // 用户专注工作 → 保持静默（只保留极缓呼吸与眨眼）
    if (score >= PET_CFG.focusScore && idle < 8000) { setBaseMood("focus"); return; }

    if (idle > PET_CFG.angryAfter) { setBaseMood("angry"); return; }
    if (idle > PET_CFG.wanderAfter) {
      setBaseMood("wandering");
      if (Math.random() < 0.45) petWander();          // 自己溜达，内部有 30s 节流
      return;
    }
    if (idle > PET_CFG.sleepAfter) { setBaseMood("sleeping"); return; }
    if (idle > PET_CFG.dozeAfter) { setBaseMood("dozing"); return; }
    if (idle > PET_CFG.restAfter) { setBaseMood("resting"); return; }
    setBaseMood("idle");
  }

  /** 每 5.4s 一次的小动作 / 闲聊（专注与睡眠状态下静默） */
  function petIdleTick() {
    const el = petEl();
    if (!el || pet.dragging || phys.on || pet.minimized) return;
    if (!$("#role-modal").classList.contains("hidden")) return;
    if (pet.mood === "focus" || pet.mood === "sleeping" || pet.mood === "dozing" || pet.mood === "angry") return;

    // 正在读书 / 敲键盘 / 飞行时不叠加其它动作
    if (el.classList.contains("is-reading") || el.classList.contains("is-typing") ||
        el.classList.contains("is-flying") || el.classList.contains("is-talking")) return;

    // 偶尔自己翻翻党规（读书）
    if (Math.random() < 0.14) { petAmuse("read", 9000); return; }
    if (Math.random() < 0.35) { petNextTip(); return; }
    const action = pick(PET_ACTIONS);
    el.classList.add(action);
    setTimeout(() => el.classList.remove(action), PET_CFG.actionMs);
  }

  /* ---------- 读书 / 敲键盘（消遣动作） ---------- */
  function petAmuse(kind, ms) {
    const el = petEl();
    if (!el || pet.dragging || phys.on) return;
    el.classList.remove("is-reading", "is-typing");
    el.classList.add(kind === "read" ? "is-reading" : "is-typing");
    clearTimeout(pet.minimizeTimer);
    pet.minimizeTimer = setTimeout(() => el.classList.remove("is-reading", "is-typing"), ms || 9000);
    if (kind === "read") sayOnce("read", "我翻翻党规…", 2400, 90000);
  }

  /* ---------- AI 工作状态联动 ---------- */
  function petAIWorking(on) {
    const el = petEl();
    if (!el) return;
    if (on) {
      el.classList.remove("is-reading", "is-cheer", "is-upset");
      clearTimeout(pet.minimizeTimer);
      el.classList.add("is-typing");
      petSay("让我查一查党务资料…", 3200);
    } else {
      el.classList.remove("is-typing");
    }
  }
  function petAIDone(ok) {
    const el = petEl();
    if (!el) return;
    el.classList.remove("is-typing");
    if (ok) {
      petAction("is-cheer", 1500);
      petSay("查到啦，你看看～", 3000);
    } else {
      petAction("is-upset", 1500);
      petSay("哎呀，我这边好像出问题了…", 3200);
    }
  }

  /* ---------- 自行溜达 ---------- */
  function petWander() {
    const el = petEl();
    if (!el || pet.dragging || phys.on || pet.minimized) return;
    if (Date.now() - pet.lastWander < 30000) return;
    pet.lastWander = Date.now();

    const w = el.offsetWidth, h = el.offsetHeight;
    const nx = 16 + Math.random() * Math.max(20, window.innerWidth - w - 32);
    const ny = 30 + Math.random() * Math.max(20, window.innerHeight - h - 60);
    el.classList.add("is-walking");
    setPetPos(nx, ny);
    sayOnce("wander", pick(["这就去转转～", "我去那边看看", "活动活动腿脚～"]), 2200, 40000);
    setTimeout(() => { el.classList.remove("is-walking"); savePetPos(); }, 1980);
  }

  /* ---------- 甩飞物理 ---------- */
  function stopFlight() {
    if (!phys.on) return;
    phys.on = false;
    cancelAnimationFrame(phys.raf);
    const el = petEl();
    if (el) { el.classList.remove("is-flying"); el.style.transform = ""; }
    savePetPos();
    if (pet.mood === "idle") petAction("is-hopping", 950);
  }

  function startFlight() {
    const el = petEl();
    if (!el) return;
    phys.on = true;
    phys.last = performance.now();
    el.classList.remove("is-dragging", "is-walking", "is-reading", "is-typing");
    el.classList.add("is-flying");
    phys.raf = requestAnimationFrame(flightStep);
  }

  function flightStep(now) {
    if (!phys.on) return;
    const el = petEl();
    if (!el) { phys.on = false; return; }

    let dt = (now - phys.last) / 1000;
    phys.last = now;
    dt = Math.min(Math.max(dt, 0.001), 0.05);

    const w = el.offsetWidth, h = el.offsetHeight;
    const minX = 4, minY = 4;
    const maxX = Math.max(minX, window.innerWidth - w - 4);
    const maxY = Math.max(minY, window.innerHeight - h - 4);

    phys.vy += PET_CFG.gravity * dt;
    const damp = Math.pow(PET_CFG.airDrag, dt * 60);
    phys.vx *= damp; phys.vy *= damp;
    phys.x += phys.vx * dt;
    phys.y += phys.vy * dt;

    let bumped = false;
    if (phys.x <= minX) { phys.x = minX; phys.vx = Math.abs(phys.vx) * PET_CFG.restitution; if (Math.abs(phys.vx) > 80) bumped = true; }
    else if (phys.x >= maxX) { phys.x = maxX; phys.vx = -Math.abs(phys.vx) * PET_CFG.restitution; if (Math.abs(phys.vx) > 80) bumped = true; }
    if (phys.y <= minY) { phys.y = minY; phys.vy = Math.abs(phys.vy) * PET_CFG.restitution; if (Math.abs(phys.vy) > 80) bumped = true; }
    else if (phys.y >= maxY) {
      phys.y = maxY;
      if (Math.abs(phys.vy) > 70) { phys.vy = -Math.abs(phys.vy) * PET_CFG.restitution; bumped = true; }
      else { phys.vy = 0; }
      phys.vx *= 0.86;                       // 地面摩擦
    }
    if (bumped) petAction("is-bumped", 320);

    setPetPosRaw(phys.x, phys.y);
    // 飞行姿态：按水平速度倾斜
    const tilt = Math.max(-26, Math.min(26, phys.vx * 0.035));
    el.style.transform = `rotate(${tilt.toFixed(1)}deg)`;

    const still = Math.abs(phys.vx) < PET_CFG.restSpeed && Math.abs(phys.vy) < PET_CFG.restSpeed;
    const grounded = phys.y >= maxY - 1.5;
    if (still && grounded) { stopFlight(); return; }
    phys.raf = requestAnimationFrame(flightStep);
  }

  /* ---------- 场景同步 ---------- */
  function syncPetScene() {
    const el = petEl(), mini = $("#pet-mini");
    if (!el) return;
    const app = inApp();
    el.classList.toggle("in-app", app);
    if (mini) mini.classList.toggle("in-app", app);
    pet.tip = 0;
    if (phys.on) stopFlight();
    requestAnimationFrame(() => {
      initPetPosition();
      petSay(app ? "我在系统里陪着你～有党务问题随时点我" : "欢迎回来，点我选择身份～", 4200);
    });
  }

  /* ---------- 收起 / 唤出 ---------- */
  function setPetMinimized(min) {
    const el = petEl(), mini = $("#pet-mini");
    if (min && phys.on) stopFlight();
    pet.minimized = min;
    if (el) el.classList.toggle("hidden", min);
    if (mini) mini.classList.toggle("hidden", !min);
    try { localStorage.setItem(PET_CFG.minKey, min ? "1" : "0"); } catch (e) { /* ignore */ }
    if (!min) {
      activity.last = Date.now();
      setBaseMood("idle");
      petIdleTick();
      petSay("我回来啦～", 2400);
    }
  }

  /* ---------- 点击：待机页 → 角色弹窗；系统内 → 回到问答 ---------- */
  function petActivate() {
    if (phys.on) return;
    activity.last = Date.now();
    if (inApp()) {
      switchView("chat");
      const input = $("#chat-input");
      if (input) setTimeout(() => input.focus(), 60);
      petSay("在这儿呢～直接输入你的党务问题吧", 3200);
    } else {
      openRoleModal();
    }
  }

  /* ---------- 初始化 ---------- */
  function initPet() {
    const el = petEl();
    if (!el) return;

    el.classList.toggle("in-app", inApp());
    const miniBtn = $("#pet-mini");
    if (miniBtn) miniBtn.classList.toggle("in-app", inApp());
    initPetPosition();
    el.classList.add("pet-enter");
    setTimeout(() => el.classList.remove("pet-enter"), 800);

    // 恢复上次的收起状态
    let minSaved = false;
    try { minSaved = localStorage.getItem(PET_CFG.minKey) === "1"; } catch (e) { /* ignore */ }
    if (minSaved) setPetMinimized(true);

    // ---- 用户活跃度采集 ----
    ["keydown", "pointerdown", "wheel"].forEach((evName) =>
      document.addEventListener(evName, () => markActivity(evName), { passive: true }));
    document.addEventListener("mousemove", () => markActivity("move"), { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) markActivity("visible");
    });

    // ---- 拖拽 / 点击 / 甩飞 ----
    el.addEventListener("pointerdown", (e) => {
      if (e.button || e.target.closest("#pet-min")) return;
      if (phys.on) stopFlight();
      el.classList.remove("is-walking", "is-reading", "is-typing");
      pet.dragging = true;
      pet.moved = false;
      pet.samples = [];
      pet.sx = e.clientX; pet.sy = e.clientY;
      const r = el.getBoundingClientRect();
      pet.ox = r.left; pet.oy = r.top;
      el.classList.add("is-dragging");
      el.style.transform = "";
      if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
      markActivity("drag");
    });

    el.addEventListener("pointermove", (e) => {
      if (!pet.dragging) return;
      const dx = e.clientX - pet.sx, dy = e.clientY - pet.sy;
      if (!pet.moved && Math.abs(dx) + Math.abs(dy) > 5) pet.moved = true;
      if (pet.moved) setPetPos(pet.ox + dx, pet.oy + dy);
      const t = performance.now();
      pet.samples.push({ t, x: e.clientX, y: e.clientY });
      if (pet.samples.length > 10) pet.samples.shift();
    });

    const endDrag = () => {
      if (!pet.dragging) return;
      pet.dragging = false;
      el.classList.remove("is-dragging");

      if (!pet.moved) { petActivate(); return; }

      // 计算释放速度 → 决定是否甩飞
      const now = performance.now();
      const recent = pet.samples.filter((s) => now - s.t < 130);
      let vx = 0, vy = 0;
      if (recent.length >= 2) {
        const a = recent[0], b = recent[recent.length - 1];
        const dt = Math.max(16, b.t - a.t) / 1000;
        vx = (b.x - a.x) / dt;
        vy = (b.y - a.y) / dt;
      }
      const speed = Math.hypot(vx, vy);

      if (speed > PET_CFG.flingMin) {
        phys.x = parseFloat(el.style.left) || 0;
        phys.y = parseFloat(el.style.top) || 0;
        phys.vx = vx; phys.vy = vy;
        startFlight();
        if (speed > 900) petSay("哇——飞起来啦！", 2600);
      } else {
        savePetPos();
        el.classList.add("is-hopping");
        setTimeout(() => el.classList.remove("is-hopping"), 1000);
        petSay("这里也不错～", 2600);
      }
    };
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);

    // 收起按钮
    const minBtn = $("#pet-min");
    if (minBtn) minBtn.addEventListener("click", (e) => { e.stopPropagation(); setPetMinimized(true); });
    const mini = $("#pet-mini");
    if (mini) mini.addEventListener("click", () => setPetMinimized(false));

    // 键盘可达
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); petActivate(); }
    });

    // ---- 视线跟随（rAF 节流；飞行/拖拽时不干预） ----
    let lookRaf = 0;
    document.addEventListener("mousemove", (e) => {
      if (pet.dragging || phys.on || pet.minimized || lookRaf) return;
      lookRaf = requestAnimationFrame(() => {
        lookRaf = 0;
        if (pet.dragging || phys.on || pet.minimized) return;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const ratio = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth * 0.5)));
        el.style.transform = `rotate(${(ratio * 5).toFixed(2)}deg) translateX(${(ratio * 5).toFixed(2)}px)`;
      });
    });

    // 视口变化：夹回可视区；飞行中直接结束
    window.addEventListener("resize", () => {
      if (phys.on) { stopFlight(); }
      setPetPos(parseFloat(el.style.left) || 0, parseFloat(el.style.top) || 0);
    });

    // ---- 开场 ----
    setTimeout(() => { if (!pet.minimized) petSay(petTips()[0], 5200); }, 900);
    petAction("is-greeting", 2200);                 // 出场先打个招呼
    setTimeout(() => scheduleBlink(), 1200);
    setInterval(petIdleTick, 5400);                 // 小动作 / 闲聊
    setInterval(petMoodTick, 1000);                 // 情绪状态评估

    el.addEventListener("pointerenter", () => {
      if (!pet.dragging && !phys.on && !pet.minimized) {
        petSay(inApp() ? "有党务问题就问我～" : "要选哪个身份呢？", 2600);
      }
    });
  }

  function initLogin() {
    // 登录表单提交 → 调用 /api/login
    const form = $("#login-form");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const u = $("#login-username").value.trim();
        const p = $("#login-password").value;
        if (!u || !p) { showLoginError("请输入账号和密码"); return; }
        doLogin(u, p);
      });
    }

    // 演示账号卡片：点击只填入账密，不自动登录，需再点"登录"按钮
    $$(".hint-card").forEach((card) => {
      card.addEventListener("click", () => {
        $("#login-username").value = card.dataset.username;
        $("#login-password").value = card.dataset.password;
        showLoginError("");
        // 聚焦到登录按钮，方便回车提交，或用户自行点击登录
        $("#login-submit")?.focus();
      });
    });

    // 关闭角色弹窗：× / 遮罩空白 / Esc
    $("#role-modal-close").addEventListener("click", closeRoleModal);
    $("#role-modal").addEventListener("click", (e) => {
      if (e.target.id === "role-modal") closeRoleModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("#role-modal").classList.contains("hidden")) closeRoleModal();
    });

    // 已登录后切换身份：沿用演示令牌快捷切换
    $$("#role-grid .role-card").forEach((btn) => {
      btn.addEventListener("click", () => loginWithToken(btn.dataset.token));
    });
  }

  function showLoginError(msg) {
    const el = $("#login-error");
    if (!el) return;
    el.textContent = msg || "";
    el.style.display = msg ? "block" : "none";
  }

  // 账密登录：POST /api/login → 拿 token + 用户信息 → 进入主应用
  async function doLogin(username, password) {
    const btn = $("#login-submit");
    if (btn) { btn.disabled = true; btn.textContent = "登录中…"; }
    showLoginError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        showLoginError(data.detail || "登录失败");
        return;
      }
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem("dsh_token", data.token);
      enterApp(data);
    } catch (e) {
      showLoginError("网络异常：" + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "登录"; }
    }
  }

  // 演示令牌快捷登录（角色弹窗切换身份用）
  async function loginWithToken(token) {
    state.token = token;
    localStorage.setItem("dsh_token", token);
    // 已登录状态下切换身份：重载页面以获得干净的角色视图与权限
    if (state.user) { location.reload(); return; }
    try {
      const me = await api("/api/me");
      state.user = me.user;
      closeRoleModal();
      enterApp(me);
    } catch (e) {
      toast(e.message, "error");
    }
  }
  function enterApp(me) {
    $("#login-screen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    $("#user-name").textContent = me.user.name;
    $("#user-role").textContent = me.role_name;
    $("#user-avatar").textContent = me.user.name.charAt(0);
    $("#topbar-user").textContent = me.user.name + " · " + me.role_name;

    // 按权限显示导航与模块
    const perms = new Set(me.permissions);
    $("#nav-kb").style.display = perms.has("kb_read") ? "" : "none";
    $$(".nav-item").forEach((n) => {
      if (n.dataset.view === "dashboard" && !perms.has("branch_analytics")) n.style.display = "none";
    });
    $("#faq-panel").style.display = perms.has("faq_manage") ? "" : "none";

    switchView((location.hash || "").replace("#", "") || "chat");
    loadSuggestions();
    if (perms.has("branch_analytics")) loadDashboard();
    if (perms.has("kb_read")) loadDocuments();
    if (perms.has("faq_manage")) loadFaq();

    syncPetScene();   // 宠物随场景切换：缩小 + 移到系统内默认位置
  }

  // ============================ 视图切换 ============================
  function switchView(view) {
    if (!document.getElementById("view-" + view)) view = "chat";
    $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.view === view));
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
    if (location.hash !== "#" + view) history.replaceState(null, "", "#" + view);
    if (view === "dashboard") loadDashboard();
    if (view === "kb") loadDocuments();
    if (view === "chat") loadSuggestions();
  }

  // ============================ 智能问答 ============================
  const SUGGEST_PAGE = 8;   // 常见问题每批展示条数
  const MAX_LEN = 35;       // 提问字数上限（对应“提问规范”）
  let suggestPool = [];
  let suggestPos = 0;

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async function loadSuggestions(refresh) {
    const box = $("#suggestions");
    if (!box) return;
    try {
      if (!suggestPool.length) {
        suggestPool = shuffle(await api("/api/suggestions"));
        suggestPos = 0;
      } else if (refresh) {
        suggestPos += SUGGEST_PAGE;
        if (suggestPos + SUGGEST_PAGE > suggestPool.length) {
          suggestPool = shuffle(suggestPool);
          suggestPos = 0;
        }
      }
      const batch = suggestPool.slice(suggestPos, suggestPos + SUGGEST_PAGE);
      box.innerHTML = batch.map((q) => `<button type="button" class="faq-q">${esc(q)}</button>`).join("");
      box.querySelectorAll(".faq-q").forEach((b) =>
        b.addEventListener("click", () => sendMessage(b.textContent)));
    } catch (e) { /* ignore */ }
  }

  function updateCounter() {
    const input = $("#chat-input"), c = $("#input-counter");
    if (!input || !c) return;
    const left = MAX_LEN - input.value.length;
    c.textContent = left > 0 ? `您还可以输入${left}个字` : `已达到${MAX_LEN}字上限`;
    c.classList.toggle("full", left <= 5);
  }

  function addMessage(role, content, opts) {
    opts = opts || {};
    const wrap = document.createElement("div");
    wrap.className = "msg " + role;
    const avatar = role === "user"
      ? `<div class="msg-avatar">${state.user ? state.user.name.charAt(0) : "我"}</div>`
      : `<div class="msg-avatar">${mascotHtml()}</div>`;
    let bubble = `<div class="msg-bubble">${content}</div>`;

    let actions = "";
    if (role === "bot" && opts.messageId && !opts.refused) {
      actions = `<div class="msg-actions">
        <button class="feedback-btn" data-rating="1" data-mid="${opts.messageId}">👍 有帮助</button>
        <button class="feedback-btn" data-rating="-1" data-mid="${opts.messageId}">👎 需改进</button>
      </div>`;
    }
    wrap.innerHTML = avatar + bubble + actions;

    // 引用来源
    if (role === "bot" && opts.citations && opts.citations.length) {
      const cit = document.createElement("div");
      cit.className = "citations";
      cit.innerHTML = `<div class="cit-title">📖 引用来源（${opts.citations.length}）</div>` +
        opts.citations.map((c, i) =>
          `<div class="citation-item"><b>[${i + 1}]</b> 《${esc(c.source_name)}》${c.article_no ? " · " + esc(c.article_no) : ""}${c.excerpt ? `<span class="excerpt">${esc(c.excerpt)}</span>` : ""}</div>`
        ).join("");
      wrap.querySelector(".msg-bubble").appendChild(cit);
    }
    return wrap;
  }

  function addTyping() {
    const wrap = document.createElement("div");
    wrap.className = "msg bot";
    wrap.innerHTML = `<div class="msg-avatar">${mascotHtml()}</div>
      <div class="msg-bubble"><span class="typing"><span></span><span></span><span></span></span></div>`;
    wrap.id = "typing-indicator";
    $("#chat-messages").appendChild(wrap);
    scrollChat();
  }

  function removeTyping() {
    const t = $("#typing-indicator");
    if (t) t.remove();
  }

  function scrollChat() {
    const m = $("#chat-messages");
    m.scrollTop = m.scrollHeight;
  }

  async function sendMessage(text) {
    text = (text || "").trim();
    if (!text) return;
    const input = $("#chat-input");
    input.value = "";
    input.style.height = "auto";
    updateCounter();

    // 首轮提问后收起“常见问题”引导卡片
    const card = $("#faq-card");
    if (card) card.classList.add("hidden");

    $("#chat-messages").appendChild(addMessage("user", esc(text)));
    addTyping();
    const btn = $("#send-btn");
    btn.disabled = true;
    petAIWorking(true);                              // 宠物进入“敲键盘”检索状态

    try {
      const data = await api("/api/chat", {
        method: "POST",
        body: JSON.stringify({ question: text, conversation_id: state.conversationId, token: state.token }),
      });
      state.conversationId = data.conversation_id;
      removeTyping();

      const badge = data.safety_flag && data.safety_flag !== "正常"
        ? `<span class="safety-badge ${data.safety_flag}">${data.safety_flag}</span>` : "";
      const head = badge || (data.business_type && data.business_type !== "其他"
        ? `<span class="safety-badge normal">${data.business_type}</span>` : "");

      $("#chat-messages").appendChild(addMessage("bot", head + renderMarkdown(data.answer), {
        citations: data.citations,
        messageId: data.message_id,
        refused: data.refused,
      }));
      petAIDone(true);                               // 查到啦
    } catch (e) {
      removeTyping();
      $("#chat-messages").appendChild(addMessage("bot", "⚠️ " + esc(e.message)));
      petAIDone(false);                              // 出错
    } finally {
      btn.disabled = false;
      scrollChat();
    }
  }

  // ============================ 问答事件绑定 ============================
  function initChat() {
    $("#send-btn").addEventListener("click", () => sendMessage($("#chat-input").value));
    const input = $("#chat-input");
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input.value); }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 88) + "px";
      updateCounter();
    });
    updateCounter();

    // 常见问题“换一批”
    const refresh = $("#faq-refresh");
    if (refresh) refresh.addEventListener("click", () => loadSuggestions(true));

    $("#chat-messages").addEventListener("click", async (e) => {
      const btn = e.target.closest(".feedback-btn");
      if (!btn) return;
      const mid = btn.dataset.mid;
      if (!mid) return;
      try {
        await api("/api/feedback", { method: "POST", body: JSON.stringify({ message_id: mid, rating: Number(btn.dataset.rating), token: state.token }) });
        btn.classList.add("done");
        toast("感谢反馈", "success");
      } catch (err) { toast(err.message, "error"); }
    });
  }

  // ============================ 知识库管理 ============================
  async function loadDocuments() {
    try {
      const docs = await api("/api/kb/documents");
      $("#kb-count").textContent = docs.length + " 份";
      const box = $("#doc-table");
      box.innerHTML = docs.map((d) => `
        <div class="doc-row" data-id="${d.id}">
          <div class="doc-row-head">
            <span class="doc-title">${esc(d.title)}</span>
            <div class="doc-actions">
              ${d.publish_status === "已发布"
                ? `<button data-act="stop">停用</button>`
                : `<button data-act="publish">发布</button>`}
              <button data-act="view">查看片段</button>
              <button data-act="del" class="danger">删除</button>
            </div>
          </div>
          <div class="doc-meta">
            <span class="tag">${esc(d.business_type || "其他")}</span>
            <span class="tag gray">${esc(d.resource_type || "")}</span>
            <span class="tag ${d.publish_status === "已发布" ? "green" : "gray"}">${esc(d.publish_status)}</span>
            <span class="tag gray">${d.chunk_count} 片段 · ${esc(d.effective_status || "现行")}</span>
          </div>
          <div class="chunk-list hidden"></div>
        </div>`).join("");

      box.querySelectorAll(".doc-row").forEach((row) => {
        row.querySelector("[data-act='stop']")?.addEventListener("click", () => setDocStatus(row.dataset.id, "已停用"));
        row.querySelector("[data-act='publish']")?.addEventListener("click", () => setDocStatus(row.dataset.id, "已发布"));
        row.querySelector("[data-act='del']")?.addEventListener("click", () => deleteDoc(row.dataset.id));
        row.querySelector("[data-act='view']")?.addEventListener("click", () => toggleChunks(row.dataset.id, row));
      });
    } catch (e) { toast(e.message, "error"); }
  }

  async function toggleChunks(docId, row) {
    const list = row.querySelector(".chunk-list");
    if (!list.classList.contains("hidden")) { list.classList.add("hidden"); return; }
    if (list.dataset.loaded) { list.classList.remove("hidden"); return; }
    try {
      const data = await api("/api/kb/documents/" + docId);
      list.innerHTML = data.chunks.map((c) => `
        <div class="chunk-item">
          <div class="chunk-head">${esc(c.section || "")}${c.article_no ? " · " + esc(c.article_no) : ""}</div>
          <div class="chunk-body">${esc((c.content || "").slice(0, 160))}${(c.content || "").length > 160 ? "……" : ""}</div>
        </div>`).join("");
      list.dataset.loaded = "1";
      list.classList.remove("hidden");
    } catch (e) { toast(e.message, "error"); }
  }

  async function setDocStatus(id, status) {
    try {
      await api("/api/kb/status", { method: "POST", body: JSON.stringify({ document_id: id, status, token: state.token }) });
      toast("状态已更新", "success");
      loadDocuments();
    } catch (e) { toast(e.message, "error"); }
  }
  async function deleteDoc(id) {
    if (!confirm("确认删除该文档及其全部片段？")) return;
    try {
      await api("/api/kb/documents/" + id, { method: "DELETE" });
      toast("已删除", "success");
      loadDocuments();
    } catch (e) { toast(e.message, "error"); }
  }

  async function uploadText() {
    const title = $("#kb-title").value.trim();
    const content = $("#kb-content").value.trim();
    if (!title || !content) { toast("请填写标题和内容", "error"); return; }
    try {
      await api("/api/kb/upload_text", { method: "POST", body: JSON.stringify({ title, content, business_type: $("#kb-biz").value, token: state.token }) });
      toast("上传成功", "success");
      $("#kb-title").value = ""; $("#kb-content").value = "";
      loadDocuments();
    } catch (e) { toast(e.message, "error"); }
  }

  async function uploadFile(file) {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", $("#kb-title").value.trim() || file.name);
    fd.append("business_type", $("#kb-biz").value);
    try {
      const res = await fetch("/api/kb/upload", { method: "POST", headers: { "X-Token": state.token }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "上传失败");
      toast("文件上传成功", "success");
      loadDocuments();
    } catch (e) { toast(e.message, "error"); }
  }

  function initKb() {
    $("#kb-upload-text").addEventListener("click", uploadText);
    $("#kb-file").addEventListener("change", (e) => uploadFile(e.target.files[0]));
    $("#reindex-btn").addEventListener("click", async () => {
      try { await api("/api/kb/reindex", { method: "POST" }); toast("索引已重建", "success"); } catch (e) { toast(e.message, "error"); }
    });
  }

  // ============================ 看板 ============================
  async function loadDashboard() {
    try {
      const d = await api("/api/dashboard");
      renderStats(d);
      renderBizChart(d.business_distribution);
      renderTrend(d.trend);
      renderFreq(d.high_freq_questions);
      renderTraining(d.training_suggestions);
    } catch (e) { /* 无权限时静默 */ }
  }

  function renderStats(d) {
    const dist = d.business_distribution || [];
    const areaCount = dist.length;
    const total = d.total_questions || 0;
    const like = (d.feedback && d.feedback.like) || 0;
    const cards = [
      { label: "累计咨询问题", value: total, sub: "含演示数据" },
      { label: "覆盖业务领域", value: areaCount, sub: "发展党员 / 党费 / 转接…" },
      { label: "回答好评", value: like, sub: "👍 有帮助反馈" },
      { label: "培训建议", value: (d.training_suggestions || []).length, sub: "共性薄弱点方向" },
    ];
    $("#stat-cards").innerHTML = cards.map((c) =>
      `<div class="stat-card"><div class="stat-label">${c.label}</div><div class="stat-value">${c.value}</div><div class="stat-sub">${c.sub}</div></div>`).join("");
  }

  function renderBizChart(dist) {
    const box = $("#biz-chart");
    if (!dist.length) { box.innerHTML = '<div style="color:#8a94a0;font-size:13px">暂无数据</div>'; return; }
    const max = Math.max(...dist.map((x) => x.count));
    box.innerHTML = dist.map((x) => `
      <div class="bar-row">
        <span class="bar-label">${esc(x.business_type)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(x.count / max) * 100}%"></div></div>
        <span class="bar-val">${x.count} · ${x.pct}%</span>
      </div>`).join("");
  }

  function renderTrend(trend) {
    const box = $("#trend-chart");
    const vals = trend.map((t) => t.count);
    const max = Math.max(1, ...vals);
    const W = 560, H = 180, pad = 24;
    const step = (W - pad * 2) / Math.max(1, vals.length - 1);
    const points = vals.map((v, i) => [pad + i * step, H - pad - (v / max) * (H - pad * 2)]);
    const path = points.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = path + ` L ${points[points.length - 1][0]} ${H - pad} L ${pad} ${H - pad} Z`;
    const dots = points.map((p, i) =>
      `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#409eff"><title>${trend[i].date}: ${trend[i].count}</title></circle>`).join("");
    const labels = points.filter((_, i) => i % 3 === 0).map((p, i) =>
      `<text x="${p[0]}" y="${H - 6}" font-size="10" fill="#9aa4b0" text-anchor="middle">${trend[i * 3].date}</text>`).join("");
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#409eff" stop-opacity=".28"/><stop offset="1" stop-color="#409eff" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${area}" fill="url(#g)"/><path d="${path}" fill="none" stroke="#409eff" stroke-width="2.4"/>
      ${dots}${labels}</svg>`;
  }

  function renderFreq(list) {
    const box = $("#freq-list");
    if (!list.length) { box.innerHTML = '<li style="color:#8a94a0">暂无高频问题</li>'; return; }
    box.innerHTML = list.slice(0, 8).map((q, i) =>
      `<li><span class="freq-rank">${i + 1}</span><span class="freq-q">${esc(q.question)}</span><span class="freq-count">${q.count} 次</span></li>`).join("");
  }

  function renderTraining(list) {
    const box = $("#training-list");
    if (!list.length) { box.innerHTML = '<div style="color:#8a94a0;font-size:13px">暂无培训建议</div>'; return; }
    box.innerHTML = list.map((t) =>
      `<div class="training-item">
        <div class="t-topic">${esc(t.business_type)} · ${esc(t.topic)}</div>
        <div class="t-meta">咨询 ${t.count} 次 · 推荐学习：${esc((t.docs || []).join("、"))}</div>
      </div>`).join("");
  }

  // ============================ FAQ ============================
  async function loadFaq() {
    try {
      const list = await api("/api/faq");
      $("#faq-list").innerHTML = list.map((f) => `
        <div class="faq-item">
          <div class="faq-q">${esc(f.question)}</div>
          <div class="faq-a">${esc(f.answer)}</div>
        </div>`).join("");
    } catch (e) { /* ignore */ }
  }
  function initFaq() {
    $("#faq-add-btn").addEventListener("click", async () => {
      const q = $("#faq-q").value.trim(), a = $("#faq-a").value.trim();
      if (!q || !a) { toast("请填写问题和答复", "error"); return; }
      try {
        await api("/api/faq", { method: "POST", body: JSON.stringify({ question: q, answer: a, business_type: "其他", token: state.token }) });
        toast("已新增 FAQ", "success");
        $("#faq-q").value = ""; $("#faq-a").value = "";
        loadFaq();
      } catch (e) { toast(e.message, "error"); }
    });
  }

  // ============================ 启动 ============================
  function init() {
    initLogin();
    initPet();
    initChat();
    initKb();
    initFaq();
    $$(".nav-item").forEach((n) => n.addEventListener("click", () => switchView(n.dataset.view)));

    // 顶栏：切换身份 → 角色弹窗；关闭 → 退出到首页
    $("#switch-user").addEventListener("click", openRoleModal);
    $("#topbar-close").addEventListener("click", () => {
      localStorage.removeItem("dsh_token");
      location.reload();
    });

    // 支持 ?token=demo-official 直达（便于演示与截图）
    const urlToken = new URLSearchParams(location.search).get("token");
    if (urlToken) {
      state.token = urlToken;
      localStorage.setItem("dsh_token", urlToken);
    }

    // 已有令牌则自动登录
    if (state.token) {
      api("/api/me").then((me) => { state.user = me.user; enterApp(me); })
        .catch(() => { localStorage.removeItem("dsh_token"); state.token = ""; });
    }
  }
  document.addEventListener("DOMContentLoaded", init);
})();
