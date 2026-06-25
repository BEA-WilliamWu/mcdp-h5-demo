<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";

const STORAGE_KEY = "mcdp-vue-demo-config-v1";

const placementOptions = {
  rotation: [
    { code: "home_rotation", name: "首页主轮播" },
    { code: "campaign_rotation_main", name: "活动页主轮播" },
    { code: "BCOPOC01", name: "BCO POC banner" }
  ],
  notice: [
    { code: "home_notice", name: "首页公告条" },
    { code: "payment_notice_top", name: "支付结果公告" }
  ],
  banner: [
    { code: "popup_banner", name: "首页弹屏" },
    { code: "loan_popup_entry", name: "贷款推荐弹屏" }
  ],
  buoy: [
    { code: "floating_buoy", name: "右下角浮标" },
    { code: "service_floating_buoy", name: "客服浮标入口" }
  ]
};

const placementGroups = [
  {
    value: "home",
    label: "首页 Web/H5",
    codes: {
      rotationCode: "home_rotation",
      noticeCode: "home_notice",
      bannerCode: "popup_banner",
      buoyCode: "floating_buoy"
    }
  },
  {
    value: "campaign",
    label: "活动营销页",
    codes: {
      rotationCode: "campaign_rotation_main",
      noticeCode: "home_notice",
      bannerCode: "popup_banner",
      buoyCode: "floating_buoy"
    }
  },
  {
    value: "payment",
    label: "支付结果页",
    codes: {
      rotationCode: "home_rotation",
      noticeCode: "payment_notice_top",
      bannerCode: "popup_banner",
      buoyCode: "floating_buoy"
    }
  },
  {
    value: "loan",
    label: "贷款推荐",
    codes: {
      rotationCode: "campaign_rotation_main",
      noticeCode: "home_notice",
      bannerCode: "loan_popup_entry",
      buoyCode: "floating_buoy"
    }
  },
  {
    value: "service",
    label: "客服服务",
    codes: {
      rotationCode: "home_rotation",
      noticeCode: "payment_notice_top",
      bannerCode: "popup_banner",
      buoyCode: "service_floating_buoy"
    }
  },
  {
    value: "custom",
    label: "自定义组合",
    codes: {
      rotationCode: "home_rotation",
      noticeCode: "payment_notice_top",
      bannerCode: "loan_popup_entry",
      buoyCode: "service_floating_buoy"
    }
  }
];

const mountDefs = [
  { key: "rotationCode", refName: "rotationMount", type: "rotation", label: "轮播", placeholder: '<div class="slot-placeholder"><span>rotation</span><strong>等待 MCDP 活动内容</strong></div>' },
  { key: "noticeCode", refName: "noticeMount", type: "notice", label: "公告", placeholder: '<div class="notice-placeholder"><span></span><p>等待 MCDP 公告文本</p></div>' },
  { key: "bannerCode", refName: "bannerMount", type: "banner", label: "弹屏", placeholder: '<div class="inline-placeholder">popup banner</div>' },
  { key: "buoyCode", refName: "buoyMount", type: "buoy", label: "浮标", placeholder: '<div class="inline-placeholder">floating buoy</div>' }
];

const rotationMount = ref(null);
const noticeMount = ref(null);
const bannerMount = ref(null);
const buoyMount = ref(null);
const mountRefs = {
  rotationMount,
  noticeMount,
  bannerMount,
  buoyMount
};

function localOrigin() {
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return window.location.origin;
  }
  return "http://localhost:5177";
}

function defaultConfig() {
  return {
    sdkUrl: "https://unpkg.com/@alipay-inc/mpaas-mcdp-h5-render/dist/index.js",
    appId: "ALIHK8DB6CA4171506",
    workspaceId: "default",
    tenantId: "KKSGIQRA",
    reportURL: localOrigin(),
    uploadURL: `${localOrigin()}/mdap`,
    userId: "web-demo-user",
    utdid: "web-demo-browser",
    zoneCategory: "home",
    rotationCode: "home_rotation",
    noticeCode: "home_notice",
    bannerCode: "popup_banner",
    buoyCode: "floating_buoy",
    appSecret: "",
    signType: "",
    encryptType: "",
    publicKey: ""
  };
}

const config = reactive(defaultConfig());
const ui = reactive({
  configOpen: false,
  sdkState: "未加载",
  gatewayStatus: "未请求",
  gatewayMemo: "",
  lastInit: "-",
  renderKey: 0
});
const logs = ref([]);
const mountStatus = ref([]);
const rotationSlides = ref([]);
const activeRotationIndex = ref(0);
let rotationTimer = 0;

const currentScene = computed(() => {
  return placementGroups.find((group) => group.value === config.zoneCategory) || placementGroups[0];
});

const mcdpCodes = computed(() => {
  return mountDefs.map((mount) => ({
    type: mount.type,
    label: mount.label,
    code: config[mount.key]
  }));
});

function maskConfig(value) {
  return {
    ...value,
    appSecret: value.appSecret ? "******" : "",
    secretKey: value.secretKey ? "******" : ""
  };
}

function nowTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

function appendLog(title, payload) {
  logs.value.unshift({
    time: nowTime(),
    title,
    payload: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)
  });
  logs.value = logs.value.slice(0, 20);
}

function clearRotationTimer() {
  if (rotationTimer) {
    window.clearInterval(rotationTimer);
    rotationTimer = 0;
  }
}

function startRotationTimer() {
  clearRotationTimer();
  if (rotationSlides.value.length > 1) {
    rotationTimer = window.setInterval(() => {
      activeRotationIndex.value = (activeRotationIndex.value + 1) % rotationSlides.value.length;
    }, 4200);
  }
}

function setRotationSlides(slides) {
  rotationSlides.value = slides;
  activeRotationIndex.value = 0;
  startRotationTimer();
}

function changeRotationSlide(step) {
  if (rotationSlides.value.length < 2) {
    return;
  }
  const nextIndex = (activeRotationIndex.value + step + rotationSlides.value.length) % rotationSlides.value.length;
  activeRotationIndex.value = nextIndex;
  startRotationTimer();
}

function selectRotationSlide(index) {
  activeRotationIndex.value = index;
  startRotationTimer();
}

function handleSlideClick(event, slide) {
  if (!slide.actionUrl) {
    event.preventDefault();
  }
}

function loadStoredConfig() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

function hydrateConfig() {
  Object.assign(config, defaultConfig(), loadStoredConfig());
}

function saveConfig() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config }));
  appendLog("saved", "参数已保存到 localStorage。");
}

function resetConfig() {
  window.localStorage.removeItem(STORAGE_KEY);
  Object.assign(config, defaultConfig());
  applyScene(config.zoneCategory);
  appendLog("reset", "已恢复默认参数。");
  initMcdp();
}

function applyScene(value) {
  const group = placementGroups.find((item) => item.value === value) || placementGroups[0];
  config.zoneCategory = group.value;
  Object.assign(config, group.codes);
}

function markCustom() {
  config.zoneCategory = "custom";
}

function mountCodeSummary() {
  return mcdpCodes.value.map((item) => ({
    type: item.type,
    label: item.label,
    code: item.code
  }));
}

function validateRequired(initConfig) {
  return ["appId", "workspaceId", "tenantId", "reportURL", "uploadURL"].filter((key) => !initConfig[key]);
}

function buildInitConfig() {
  const initConfig = {
    appId: config.appId,
    workspaceId: config.workspaceId,
    tenantId: config.tenantId,
    tenantid: config.tenantId,
    reportURL: config.reportURL,
    uploadURL: config.uploadURL,
    extraHeaderInfos: {
      tenantId: config.tenantId,
      tenantid: config.tenantId
    }
  };

  for (const key of ["userId", "utdid", "signType", "publicKey"]) {
    if (config[key]) {
      initConfig[key] = config[key];
    }
  }
  if (config.appSecret) {
    initConfig.appSecret = config.appSecret;
    initConfig.secretKey = config.appSecret;
  }
  if (config.encryptType) {
    initConfig.encryptType = Number(config.encryptType);
  }
  return initConfig;
}

function resetMountPlaceholders() {
  setRotationSlides([]);
  for (const mount of mountDefs) {
    const node = mountRefs[mount.refName].value;
    if (node) {
      node.innerHTML = mount.placeholder;
      node.dataset.mcdpCode = config[mount.key];
    }
  }
  mountStatus.value = mountDefs.map((mount) => ({
    type: mount.type,
    code: config[mount.key],
    rendered: false,
    textPreview: ""
  }));
}

function mountHasMcdpContent(node) {
  if (!node) {
    return false;
  }
  if (!node.textContent.trim() && !node.querySelector("img, a, video, canvas, svg")) {
    return false;
  }
  return !node.querySelector(".slot-placeholder, .notice-placeholder, .inline-placeholder");
}

function inspectRenderedContent() {
  mountStatus.value = mountDefs.map((mount) => {
    const node = mountRefs[mount.refName].value;
    const previewNode = node ? node.cloneNode(true) : null;
    if (previewNode) {
      previewNode.querySelectorAll("script, style").forEach((item) => item.remove());
    }
    const hasRotationSlides = mount.type === "rotation" && rotationSlides.value.length > 0;
    return {
      type: mount.type,
      code: config[mount.key],
      rendered: mountHasMcdpContent(node) || hasRotationSlides,
      textPreview: hasRotationSlides
        ? `MCDP 返回 ${rotationSlides.value.length} 张轮播素材`
        : previewNode ? previewNode.textContent.trim().replace(/\s+/g, " ").slice(0, 120) : ""
    };
  });
  appendLog("render check", {
    note: "rendered=true 表示展位容器已经被 MCDP WebSDK 返回内容替换。",
    mounts: mountStatus.value
  });
}

function parseMaybeJSON(value) {
  if (!value || typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed || !["{", "["].includes(trimmed[0])) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    return value;
  }
}

function findFirstArray(value, keys) {
  if (!value || typeof value !== "object") {
    return null;
  }
  for (const key of keys) {
    if (Array.isArray(value[key])) {
      return value[key];
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findFirstArray(item, keys);
      if (nested) {
        return nested;
      }
    }
    return null;
  }
  for (const nestedValue of Object.values(value)) {
    const nested = findFirstArray(parseMaybeJSON(nestedValue), keys);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function pickString(source, keys) {
  if (!source || typeof source !== "object") {
    return "";
  }
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function findURL(value) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    const directURL = value.match(/https?:\/\/[^\s"'<>]+/);
    return directURL ? directURL[0] : "";
  }
  if (typeof value === "object") {
    const preferred = pickString(value, ["hrefUrl", "url", "imageUrl", "imgUrl", "picUrl", "materialUrl", "content", "src"]);
    if (preferred) {
      return findURL(preferred) || preferred;
    }
    for (const nestedValue of Object.values(value)) {
      const url = findURL(parseMaybeJSON(nestedValue));
      if (url) {
        return url;
      }
    }
  }
  return "";
}

function zoneCodeOf(zone) {
  return pickString(zone, [
    "zoneCode",
    "spaceCode",
    "spaceKey",
    "slotCode",
    "viewCode",
    "code",
    "mcdpCode",
    "advertisingSpaceCode",
    "placementCode"
  ]);
}

function containsValue(value, expected) {
  if (!value || !expected) {
    return false;
  }
  if (typeof value === "string") {
    return value === expected || value.includes(expected);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsValue(parseMaybeJSON(item), expected));
  }
  if (typeof value === "object") {
    return Object.values(value).some((item) => containsValue(parseMaybeJSON(item), expected));
  }
  return false;
}

function normalizeRotationSlides(zone) {
  const objects = findFirstArray(zone, ["spaceObjectList", "objectList", "materialList", "materialInfoList", "items", "list"]) || [];
  const seen = new Set();
  return objects.map((object, index) => {
    const content = parseMaybeJSON(object.content);
    const imageUrl = findURL(pickString(object, ["hrefUrl", "imageUrl", "imgUrl", "picUrl", "materialUrl", "content", "src"])) || findURL(content);
    const actionUrl = pickString(object, ["actionUrl", "jumpUrl", "linkUrl", "redirectUrl", "targetUrl", "landingUrl"]) || findURL(object.action) || findURL(object.link);
    const title = pickString(object, ["title", "name", "objectName", "materialName", "spaceObjectName"]) || `MCDP 轮播素材 ${index + 1}`;
    return {
      id: pickString(object, ["id", "objectId", "materialId", "spaceObjectId"]) || `${imageUrl}-${index}`,
      imageUrl,
      actionUrl,
      title
    };
  }).filter((slide) => {
    if (!slide.imageUrl) {
      return false;
    }
    const key = `${slide.imageUrl}|${slide.actionUrl}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function syncMcdpPayload(body) {
  const payload = parseMaybeJSON(body);
  const spaces = findFirstArray(payload, ["spaceInfoList", "spaceList", "zoneInfoList", "zoneList", "placementList"]);
  if (!spaces) {
    return;
  }
  const rotationZone = spaces.find((zone) => zoneCodeOf(zone) === config.rotationCode || containsValue(zone, config.rotationCode));
  const slides = rotationZone ? normalizeRotationSlides(rotationZone) : [];
  setRotationSlides(slides);
  if (slides.length > 0) {
    appendLog("rotation material sync", {
      code: config.rotationCode,
      count: slides.length,
      source: "MCDP /mgw.htm spaceInfoList"
    });
  }
}

function decodeHeaderValue(value) {
  if (!value) {
    return "";
  }
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

function isGatewayURL(url) {
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.pathname === "/mgw.htm" || parsed.pathname.indexOf("/mdap") === 0;
  } catch (error) {
    return false;
  }
}

function logGatewayResponse(url, status, headers, body) {
  let pathname = "";
  try {
    pathname = new URL(url, window.location.href).pathname;
  } catch (error) {
    pathname = "";
  }
  if (pathname === "/mgw.htm") {
    ui.gatewayStatus = headers.resultStatus || String(status);
    ui.gatewayMemo = headers.memo || headers.tips || "";
    syncMcdpPayload(body);
  }
  appendLog("MCDP gateway response", {
    url,
    status,
    headers,
    bodyPreview: body ? body.slice(0, 1200) : ""
  });
}

function installGatewayDiagnostics() {
  if (window.__mcdpDiagnosticsInstalled) {
    return;
  }
  window.__mcdpDiagnosticsInstalled = true;

  const nativeOpen = window.XMLHttpRequest && window.XMLHttpRequest.prototype.open;
  if (nativeOpen) {
    const nativeSend = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.open = function open(method, url) {
      this.__mcdpGatewayURL = url;
      return nativeOpen.apply(this, arguments);
    };
    window.XMLHttpRequest.prototype.send = function send() {
      if (isGatewayURL(this.__mcdpGatewayURL || "")) {
        this.addEventListener("loadend", function onLoadEnd() {
          logGatewayResponse(this.__mcdpGatewayURL, this.status, {
            resultStatus: this.getResponseHeader("result-status") || "",
            memo: decodeHeaderValue(this.getResponseHeader("memo")),
            tips: decodeHeaderValue(this.getResponseHeader("tips")),
            traceId: this.getResponseHeader("x-mgw-traceid") || ""
          }, typeof this.responseText === "string" ? this.responseText : "");
        });
      }
      return nativeSend.apply(this, arguments);
    };
  }

  if (window.fetch) {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function fetchWithDiagnostics(input, init) {
      const requestURL = typeof input === "string" ? input : input && input.url;
      return nativeFetch(input, init).then((response) => {
        if (isGatewayURL(requestURL || response.url)) {
          response.clone().text().then((body) => {
            logGatewayResponse(response.url, response.status, {
              resultStatus: response.headers.get("result-status") || "",
              memo: decodeHeaderValue(response.headers.get("memo")),
              tips: decodeHeaderValue(response.headers.get("tips")),
              traceId: response.headers.get("x-mgw-traceid") || ""
            }, body);
          }).catch(() => {
            logGatewayResponse(response.url, response.status, {}, "");
          });
        }
        return response;
      });
    };
  }
}

function sdkLoaded() {
  return Boolean(window.McdpView && typeof window.McdpView.init === "function");
}

function loadSdk() {
  return new Promise((resolve, reject) => {
    if (sdkLoaded()) {
      ui.sdkState = "已加载";
      resolve(window.McdpView);
      return;
    }
    if (!config.sdkUrl) {
      reject(new Error("请填写 SDK 地址。"));
      return;
    }

    const existing = document.querySelector('script[data-mcdp-websdk="true"]');
    if (existing) {
      existing.addEventListener("load", () => {
        sdkLoaded() ? resolve(window.McdpView) : reject(new Error("SDK 已加载，但未发现 window.McdpView。"));
      }, { once: true });
      existing.addEventListener("error", () => reject(new Error(`SDK 加载失败：${config.sdkUrl}`)), { once: true });
      return;
    }

    ui.sdkState = "加载中";
    const script = document.createElement("script");
    script.src = config.sdkUrl;
    script.async = true;
    script.dataset.mcdpWebsdk = "true";
    script.onload = () => {
      if (sdkLoaded()) {
        ui.sdkState = "已加载";
        resolve(window.McdpView);
        return;
      }
      reject(new Error("SDK 文件已返回，但未发现 window.McdpView。"));
    };
    script.onerror = () => reject(new Error(`SDK 加载失败：${config.sdkUrl}`));
    document.head.appendChild(script);
  });
}

async function initMcdp() {
  installGatewayDiagnostics();
  resetMountPlaceholders();
  await nextTick();

  const initConfig = buildInitConfig();
  const missing = validateRequired(initConfig);
  if (missing.length) {
    ui.sdkState = "待配置";
    appendLog("missing required params", { missing });
    return;
  }

  ui.gatewayStatus = "请求中";
  ui.gatewayMemo = "";
  appendLog("loading WebSDK", {
    initConfig: maskConfig(initConfig),
    scene: currentScene.value.label,
    mountCodes: mountCodeSummary(),
    note: "页面不包含本地投放素材；展位内容只由 WebSDK 通过 reportURL 从 MCDP/MGS 拉取。"
  });

  try {
    const McdpView = await loadSdk();
    McdpView.init(initConfig);
    ui.lastInit = nowTime();
    ui.sdkState = "已初始化";
    appendLog("McdpView.init called", {
      initConfig: maskConfig(initConfig),
      mountCodes: mountCodeSummary()
    });
    window.setTimeout(inspectRenderedContent, 3000);
  } catch (error) {
    ui.sdkState = "失败";
    appendLog("error", { message: error.message });
  }
}

function saveAndInit() {
  saveConfig();
  initMcdp();
  ui.configOpen = false;
}

onMounted(() => {
  hydrateConfig();
  applyScene(config.zoneCategory);
  initMcdp();
});

onBeforeUnmount(() => {
  clearRotationTimer();
});
</script>

<template>
  <main class="app-shell">
    <section class="phone-preview" aria-label="MCDP H5 页面预览">
      <header class="app-topbar">
        <div>
          <p>BCO Mobile Web</p>
          <h1>首页</h1>
        </div>
        <button class="icon-text-button" type="button" @click="ui.configOpen = true">配置参数</button>
      </header>

      <section
        class="hero-placement-shell"
        :class="{ 'has-carousel': rotationSlides.length > 1 }"
        aria-label="MCDP 轮播展位"
      >
        <section
          ref="rotationMount"
          class="mcdp-view-wrap hero-placement"
          :data-mcdp-code="config.rotationCode"
        ></section>

        <div
          v-if="rotationSlides.length > 1"
          class="mcdp-real-carousel"
          @mouseenter="clearRotationTimer"
          @mouseleave="startRotationTimer"
          @focusin="clearRotationTimer"
          @focusout="startRotationTimer"
        >
          <a
            v-for="(slide, index) in rotationSlides"
            :key="slide.id"
            class="carousel-slide"
            :class="{ active: index === activeRotationIndex }"
            :href="slide.actionUrl || '#'"
            target="_blank"
            rel="noreferrer"
            :aria-hidden="index !== activeRotationIndex"
            @click="handleSlideClick($event, slide)"
          >
            <img :src="slide.imageUrl" :alt="slide.title">
          </a>

          <button class="carousel-arrow prev" type="button" aria-label="上一张" @click="changeRotationSlide(-1)">
            <span aria-hidden="true">‹</span>
          </button>
          <button class="carousel-arrow next" type="button" aria-label="下一张" @click="changeRotationSlide(1)">
            <span aria-hidden="true">›</span>
          </button>

          <div class="carousel-dots" aria-label="轮播切换">
            <button
              v-for="(slide, index) in rotationSlides"
              :key="`${slide.id}-dot`"
              type="button"
              :class="{ active: index === activeRotationIndex }"
              :aria-label="`第 ${index + 1} 张`"
              @click="selectRotationSlide(index)"
            ></button>
          </div>
        </div>
      </section>

      <section
        ref="noticeMount"
        class="mcdp-view-wrap notice-placement"
        :data-mcdp-code="config.noticeCode"
        aria-label="MCDP 公告展位"
      ></section>

      <section class="quick-actions" aria-label="业务入口">
        <article>
          <span class="action-icon action-blue">E</span>
          <h2>电子账单</h2>
          <p>查看最新月结单与交易通知。</p>
        </article>
        <article>
          <span class="action-icon action-green">P</span>
          <h2>跨境支付</h2>
          <p>管理港澳及海外消费服务。</p>
        </article>
        <article>
          <span class="action-icon action-rose">W</span>
          <h2>财富服务</h2>
          <p>精选存款、基金与保险资讯。</p>
        </article>
      </section>

      <section class="account-band" aria-label="账户摘要">
        <div>
          <span>可用结余</span>
          <strong>HKD 86,420.00</strong>
        </div>
        <button type="button">转账</button>
      </section>

      <section class="extra-placement-grid" aria-label="更多 MCDP 展位">
        <div
          ref="bannerMount"
          class="mcdp-view-wrap inline-placement"
          :data-mcdp-code="config.bannerCode"
          aria-label="MCDP 弹屏展位"
        ></div>
        <div
          ref="buoyMount"
          class="mcdp-view-wrap inline-placement"
          :data-mcdp-code="config.buoyCode"
          aria-label="MCDP 浮标展位"
        ></div>
      </section>
    </section>

    <aside class="runtime-panel" aria-label="运行状态">
      <div class="panel-title">
        <p>Runtime</p>
        <h2>MCDP 活动命中</h2>
      </div>
      <div class="status-grid">
        <div>
          <span>WebSDK</span>
          <strong>{{ ui.sdkState }}</strong>
        </div>
        <div>
          <span>MGS</span>
          <strong>{{ ui.gatewayStatus }}</strong>
        </div>
        <div>
          <span>最后初始化</span>
          <strong>{{ ui.lastInit }}</strong>
        </div>
        <div>
          <span>轮播素材</span>
          <strong>{{ rotationSlides.length ? `${rotationSlides.length} 张` : "-" }}</strong>
        </div>
      </div>

      <p v-if="ui.gatewayMemo" class="gateway-memo">{{ ui.gatewayMemo }}</p>

      <section class="code-list" aria-label="当前展位码">
        <h3>当前展位</h3>
        <div v-for="item in mcdpCodes" :key="item.type">
          <span>{{ item.label }}</span>
          <code>{{ item.code }}</code>
        </div>
      </section>

      <section class="render-list" aria-label="渲染结果">
        <h3>渲染结果</h3>
        <div v-for="item in mountStatus" :key="item.type" :class="{ ok: item.rendered }">
          <span>{{ item.type }}</span>
          <strong>{{ item.rendered ? "已渲染" : "等待内容" }}</strong>
        </div>
      </section>

      <section class="log-panel" aria-label="请求日志">
        <div class="log-head">
          <h3>请求日志</h3>
          <button type="button" @click="logs = []">清空</button>
        </div>
        <article v-for="log in logs" :key="`${log.time}-${log.title}`">
          <span>{{ log.time }} · {{ log.title }}</span>
          <pre>{{ log.payload }}</pre>
        </article>
      </section>
    </aside>

    <div v-if="ui.configOpen" class="drawer-backdrop" @click.self="ui.configOpen = false">
      <section class="config-drawer" aria-label="MCDP 配置参数">
        <header>
          <div>
            <p>Configuration</p>
            <h2>MCDP WebSDK 参数</h2>
          </div>
          <button type="button" @click="ui.configOpen = false">关闭</button>
        </header>

        <form class="config-form" @submit.prevent="saveAndInit">
          <label>
            <span>SDK 地址</span>
            <input v-model="config.sdkUrl" autocomplete="off">
          </label>
          <label>
            <span>App ID</span>
            <input v-model="config.appId" autocomplete="off">
          </label>
          <label>
            <span>Workspace ID</span>
            <input v-model="config.workspaceId" autocomplete="off">
          </label>
          <label>
            <span>Tenant ID</span>
            <input v-model="config.tenantId" autocomplete="off">
          </label>
          <label>
            <span>reportURL</span>
            <input v-model="config.reportURL" autocomplete="off">
          </label>
          <label>
            <span>uploadURL</span>
            <input v-model="config.uploadURL" autocomplete="off">
          </label>
          <label>
            <span>User ID</span>
            <input v-model="config.userId" autocomplete="off">
          </label>
          <label>
            <span>UTDID</span>
            <input v-model="config.utdid" autocomplete="off">
          </label>
          <label>
            <span>场景分类</span>
            <select v-model="config.zoneCategory" @change="applyScene(config.zoneCategory)">
              <option v-for="group in placementGroups" :key="group.value" :value="group.value">{{ group.label }}</option>
            </select>
          </label>
          <label>
            <span>轮播展位码</span>
            <select v-model="config.rotationCode" @change="markCustom">
              <option v-for="item in placementOptions.rotation" :key="item.code" :value="item.code">{{ item.name }} / {{ item.code }}</option>
            </select>
          </label>
          <label>
            <span>公告展位码</span>
            <select v-model="config.noticeCode" @change="markCustom">
              <option v-for="item in placementOptions.notice" :key="item.code" :value="item.code">{{ item.name }} / {{ item.code }}</option>
            </select>
          </label>
          <label>
            <span>弹屏展位码</span>
            <select v-model="config.bannerCode" @change="markCustom">
              <option v-for="item in placementOptions.banner" :key="item.code" :value="item.code">{{ item.name }} / {{ item.code }}</option>
            </select>
          </label>
          <label>
            <span>浮标展位码</span>
            <select v-model="config.buoyCode" @change="markCustom">
              <option v-for="item in placementOptions.buoy" :key="item.code" :value="item.code">{{ item.name }} / {{ item.code }}</option>
            </select>
          </label>
          <label>
            <span>App Secret</span>
            <input v-model="config.appSecret" type="password" placeholder="本地代理已可签名；直连调试时再填写" autocomplete="off">
          </label>
          <label>
            <span>encryptType</span>
            <input v-model="config.encryptType" placeholder="可选，例如 1" autocomplete="off">
          </label>
          <label class="wide-field">
            <span>publicKey</span>
            <textarea v-model="config.publicKey" rows="3" placeholder="可选，加密公钥"></textarea>
          </label>

          <footer>
            <button type="button" class="secondary" @click="resetConfig">重置</button>
            <button type="submit">保存并请求 MCDP</button>
          </footer>
        </form>
      </section>
    </div>
  </main>
</template>
