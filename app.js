const select = document.getElementById('themeSelect');

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
}

const saved = localStorage.getItem('theme') || 'ocean';
select.value = saved;
applyTheme(saved);

select.addEventListener('change', e => {
  applyTheme(e.target.value);
});

// ========== CONFIGURATION ==========
const CONFIG = {
  canvas: {
    defaultWidth: 800,
    defaultHeight: 600,
    minWidth: 200,
    maxWidth: 3840,
    minHeight: 200,
    maxHeight: 2160,
  },
  mobile: {
    breakpoint: 768,
    hitRadius: 24,
    desktopHitRadius: 14,
  },
  colors: {
    palette: [
      "#ff0066",
      "#00ff88",
      "#7c3aed",
      "#ff6600",
      "#00d4ff",
      "#ffdd00",
      "#ff3366",
      "#00ffcc",
    ],
  },
};

// ========== DOM ELEMENTS ==========
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const canvasWidth = document.getElementById("canvasWidth");
const canvasHeight = document.getElementById("canvasHeight");

// ========== STATE ==========
let W = 800,
  H = 600,
  counter = 0;

const state = {
  stops: [],
  selected: null,
  bgColor: "#0a0e14",
  bgAlpha: 100,
  cssFormat: "rgba",
  canvasWidth: 800,
  canvasHeight: 600,
  lockVertical: false,
  showHandles: true,
};

let picker = { cb: null, h: 0, s: 100, v: 100, a: 100, fmt: "hex" };
let drag = null;
let activeAnglePicker = null;
let currentCSS = "";

// Resize states
let resizingW = false,
  resizingH = false;
let startX = 0,
  startY = 0,
  startW = 0,
  startH = 0;
let lastW = 0,
  lastH = 0;

// Picker drag states
let sbDrag = false,
  hueDrag = false,
  alphaDrag = false;
let pickerDragging = false;

// ========== ASPECT RATIO & RESOLUTION STATE (یکپارچه) ==========
const aspectPresets = {
  free: { w: null, h: null },
  "1:1": { w: 1, h: 1 },
  "4:3": { w: 4, h: 3 },
  "3:4": { w: 3, h: 4 },
  "16:9": { w: 16, h: 9 },
  "9:16": { w: 9, h: 16 },
};

const resolutionPresets = {
  "1280x720": { w: 1280, h: 720, name: "HD" },
  "1920x1080": { w: 1920, h: 1080, name: "FHD" },
  "2560x1440": { w: 2560, h: 1440, name: "2K" },
  "3840x2160": { w: 3840, h: 2160, name: "4K" },
};

const dimensionState = {
  // Aspect Ratio
  aspectLocked: false,
  aspectW: null,
  aspectH: null,
  aspectRatio: null,
  activeAspectPreset: "free",

  // Resolution
  activeResolutionPreset: null,
  isResolutionMode: false,
};

// ========== ZOOM STATE ==========
const zoomState = {
  current: 100,
  min: 5,
  max: 150,
  step: 5,
  dynamicMin: 15,
  padding: 75,
  lastPinchDist: 0,
};

// ========== UTILITY FUNCTIONS ==========
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const uid = () => Math.random().toString(36).slice(2, 8);

function isMobile() {
  return (
    window.innerWidth <= CONFIG.mobile.breakpoint || "ontouchstart" in window
  );
}

function getHitRadius() {
  const base = isMobile() ? 30 : 18;
  const scale = Math.max(W, H) / 800;
  return clamp(base * scale, base, base * 5);
}

function getGCD(a, b) {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

function simplifyRatio(w, h, maxValue = 50) {
  if (w <= 0 || h <= 0) return { w: 1, h: 1 };

  w = Math.round(w);
  h = Math.round(h);

  // اول با GCD ساده کن
  const gcd = getGCD(w, h);
  let simpleW = w / gcd;
  let simpleH = h / gcd;

  // اگر اعداد کوچیکن، همین خوبه
  if (simpleW <= maxValue && simpleH <= maxValue) {
    return { w: simpleW, h: simpleH };
  }

  // اگر بزرگن، به نزدیک‌ترین نسبت معروف تبدیل کن
  const ratio = w / h;

  const commonRatios = [
    { w: 1, h: 1 },
    { w: 4, h: 3 },
    { w: 3, h: 4 },
    { w: 16, h: 9 },
    { w: 9, h: 16 },
    { w: 21, h: 9 },
    { w: 9, h: 21 },
    { w: 3, h: 2 },
    { w: 2, h: 3 },
    { w: 5, h: 4 },
    { w: 4, h: 5 },
    { w: 16, h: 10 },
    { w: 10, h: 16 },
    { w: 2, h: 1 },
    { w: 1, h: 2 },
    { w: 7, h: 5 },
    { w: 5, h: 7 },
    { w: 6, h: 5 },
    { w: 5, h: 6 },
  ];

  // پیدا کردن نزدیک‌ترین نسبت
  let closest = { w: simpleW, h: simpleH };
  let minDiff = Infinity;

  for (const cr of commonRatios) {
    const diff = Math.abs(ratio - cr.w / cr.h);
    if (diff < minDiff) {
      minDiff = diff;
      closest = cr;
    }
  }

  // اگر نزدیکه (کمتر از 2% اختلاف)، از نسبت معروف استفاده کن
  if (minDiff < 0.02) {
    return { w: closest.w, h: closest.h };
  }

  // در غیر این صورت، مقیاس کن به اعداد کوچکتر
  const scale = maxValue / Math.max(simpleW, simpleH);
  return {
    w: Math.round(simpleW * scale) || 1,
    h: Math.round(simpleH * scale) || 1,
  };
}
// ========== COLOR FUNCTIONS ==========
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((x) => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, "0"))
      .join("")
  );
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    l = (max + min) / 2;
  let h = 0,
    s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToRgb(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;
  if (s === 0)
    return {
      r: Math.round(l * 255),
      g: Math.round(l * 255),
      b: Math.round(l * 255),
    };
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s,
    p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  let h = 0,
    s = max === 0 ? 0 : d / max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s: s * 100, v: max * 100 };
}

function hsvToRgb(h, s, v) {
  h /= 360;
  s /= 100;
  v /= 100;
  const i = Math.floor(h * 6),
    f = h * 6 - i,
    p = v * (1 - s),
    q = v * (1 - f * s),
    t = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

function formatColor(hex, alpha, format) {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const a = alpha / 100;

  switch (format) {
    case "hex":
      return a < 1
        ? `${hex}${Math.round(a * 255)
            .toString(16)
            .padStart(2, "0")}`
        : hex;
    case "rgb":
      return `rgb(${r}, ${g}, ${b})`;
    case "rgba":
      return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
    case "hsl":
      return `hsl(${h}, ${s}%, ${l}%)`;
    case "hsla":
      return `hsla(${h}, ${s}%, ${l}%, ${a.toFixed(2)})`;
    default:
      return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
  }
}

function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function randColor() {
  return CONFIG.colors.palette[
    Math.floor(Math.random() * CONFIG.colors.palette.length)
  ];
}

function isLight(hex) {
  hex = hex.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 155;
}

function darken(hex, amount = 40) {
  hex = hex.replace("#", "");
  let r = Math.max(0, parseInt(hex.substring(0, 2), 16) - amount);
  let g = Math.max(0, parseInt(hex.substring(2, 4), 16) - amount);
  let b = Math.max(0, parseInt(hex.substring(4, 6), 16) - amount);
  return (
    "#" +
    r.toString(16).padStart(2, "0") +
    g.toString(16).padStart(2, "0") +
    b.toString(16).padStart(2, "0")
  );
}

function lighten(hex, amount = 20) {
  hex = hex.replace("#", "");
  let r = Math.min(255, parseInt(hex.substring(0, 2), 16) + amount);
  let g = Math.min(255, parseInt(hex.substring(2, 4), 16) + amount);
  let b = Math.min(255, parseInt(hex.substring(4, 6), 16) + amount);
  return (
    "#" +
    r.toString(16).padStart(2, "0") +
    g.toString(16).padStart(2, "0") +
    b.toString(16).padStart(2, "0")
  );
}

// ========== DIMENSION SYSTEM ==========
function clearAllPresetSelections() {
  // پاک کردن همه انتخاب‌ها
  dimensionState.activeAspectPreset = null;
  dimensionState.activeResolutionPreset = null;
  dimensionState.isResolutionMode = false;
  updateAllDimensionUI();
}

function setAspectRatio(ratioName) {
  const preset = aspectPresets[ratioName];
  if (!preset) return;

  // پاک کردن resolution preset
  dimensionState.activeResolutionPreset = null;
  dimensionState.isResolutionMode = false;

  if (preset.w === null) {
    // Free mode
    dimensionState.aspectW = null;
    dimensionState.aspectH = null;
    dimensionState.aspectRatio = null;
    dimensionState.aspectLocked = false;
    dimensionState.activeAspectPreset = "free";
  } else {
    dimensionState.aspectW = preset.w;
    dimensionState.aspectH = preset.h;
    dimensionState.aspectRatio = preset.w / preset.h;
    dimensionState.aspectLocked = true;
    dimensionState.activeAspectPreset = ratioName;
    applyAspectRatio(true);
  }

  updateAllDimensionUI();
}

function setCustomAspectRatio(w, h, applyToCanvas = true) {
  w = parseInt(w) || 0;
  h = parseInt(h) || 0;

  // پاک کردن presets
  dimensionState.activeAspectPreset = null;
  dimensionState.activeResolutionPreset = null;
  dimensionState.isResolutionMode = false;

  if (w <= 0 || h <= 0) {
    dimensionState.aspectW = null;
    dimensionState.aspectH = null;
    dimensionState.aspectRatio = null;
    dimensionState.aspectLocked = false;
    dimensionState.activeAspectPreset = "free";
    updateAllDimensionUI();
    return;
  }

  // نسبت دقیقا با همان اعدادی که کاربر وارد کرده ذخیره شود
  dimensionState.aspectW = w;
  dimensionState.aspectH = h;
  dimensionState.aspectRatio = w / h;
  dimensionState.aspectLocked = true;

  // چک کن آیا با یک preset مطابقت داره
  for (const [name, preset] of Object.entries(aspectPresets)) {
    if (preset.w === w && preset.h === h) {
      dimensionState.activeAspectPreset = name;
      break;
    }
  }

  if (applyToCanvas) {
    applyAspectRatio(true);
  }

  updateAllDimensionUI();
}

function setResolution(w, h) {
  // پاک کردن aspect preset (اما حفظ ratio)
  dimensionState.activeAspectPreset = null;

  state.canvasWidth = clamp(w, CONFIG.canvas.minWidth, CONFIG.canvas.maxWidth);
  state.canvasHeight = clamp(
    h,
    CONFIG.canvas.minHeight,
    CONFIG.canvas.maxHeight
  );

  // تنظیم aspect ratio از resolution
  const simple = simplifyRatio(w, h);
  dimensionState.aspectW = simple.w;
  dimensionState.aspectH = simple.h;
  dimensionState.aspectRatio = w / h;
  dimensionState.aspectLocked = true;

  // چک کردن آیا با resolution preset مطابقت داره
  const key = `${w}x${h}`;
  if (resolutionPresets[key]) {
    dimensionState.activeResolutionPreset = key;
    dimensionState.isResolutionMode = true;
  } else {
    dimensionState.activeResolutionPreset = null;
    dimensionState.isResolutionMode = false;
  }

  updateSizeInputs();
  updateAllDimensionUI();
  refresh();
  fitToScreen();
}

function applyAspectRatio(adjustHeight = true) {
  if (!dimensionState.aspectRatio) return;

  if (adjustHeight) {
    state.canvasHeight = Math.round(
      state.canvasWidth / dimensionState.aspectRatio
    );
    state.canvasHeight = clamp(
      state.canvasHeight,
      CONFIG.canvas.minHeight,
      CONFIG.canvas.maxHeight
    );

    if (
      state.canvasHeight === CONFIG.canvas.minHeight ||
      state.canvasHeight === CONFIG.canvas.maxHeight
    ) {
      state.canvasWidth = Math.round(
        state.canvasHeight * dimensionState.aspectRatio
      );
      state.canvasWidth = clamp(
        state.canvasWidth,
        CONFIG.canvas.minWidth,
        CONFIG.canvas.maxWidth
      );
    }
  } else {
    state.canvasWidth = Math.round(
      state.canvasHeight * dimensionState.aspectRatio
    );
    state.canvasWidth = clamp(
      state.canvasWidth,
      CONFIG.canvas.minWidth,
      CONFIG.canvas.maxWidth
    );

    if (
      state.canvasWidth === CONFIG.canvas.minWidth ||
      state.canvasWidth === CONFIG.canvas.maxWidth
    ) {
      state.canvasHeight = Math.round(
        state.canvasWidth / dimensionState.aspectRatio
      );
      state.canvasHeight = clamp(
        state.canvasHeight,
        CONFIG.canvas.minHeight,
        CONFIG.canvas.maxHeight
      );
    }
  }

  updateSizeInputs();
  refresh();
  fitToScreen();
}

function toggleAspectLock() {
  dimensionState.aspectLocked = !dimensionState.aspectLocked;

  if (dimensionState.aspectLocked) {
    const simple = simplifyRatio(state.canvasWidth, state.canvasHeight);
    dimensionState.aspectW = simple.w;
    dimensionState.aspectH = simple.h;
    dimensionState.aspectRatio = state.canvasWidth / state.canvasHeight;
  } else {
    dimensionState.activeAspectPreset = "free";
  }

  // پاک کردن resolution preset
  dimensionState.activeResolutionPreset = null;
  dimensionState.isResolutionMode = false;

  updateAllDimensionUI();
}

function swapDimensions() {
  const temp = state.canvasWidth;
  state.canvasWidth = state.canvasHeight;
  state.canvasHeight = temp;

  state.canvasWidth = clamp(
    state.canvasWidth,
    CONFIG.canvas.minWidth,
    CONFIG.canvas.maxWidth
  );
  state.canvasHeight = clamp(
    state.canvasHeight,
    CONFIG.canvas.minHeight,
    CONFIG.canvas.maxHeight
  );

  if (dimensionState.aspectW !== null && dimensionState.aspectH !== null) {
    const tempA = dimensionState.aspectW;
    dimensionState.aspectW = dimensionState.aspectH;
    dimensionState.aspectH = tempA;
    dimensionState.aspectRatio =
      dimensionState.aspectW / dimensionState.aspectH;
  }

  // پاک کردن presets چون سایز عوض شد
  dimensionState.activeAspectPreset = null;
  dimensionState.activeResolutionPreset = null;
  dimensionState.isResolutionMode = false;

  // چک کن آیا با preset جدید مطابقت داره
  checkAndSetMatchingPresets();

  updateSizeInputs();
  updateAllDimensionUI();
  refresh();
  fitToScreen();
}

function handleWidthChange(newWidth, fromInput = false) {
  newWidth = clamp(
    parseInt(newWidth) || CONFIG.canvas.minWidth,
    CONFIG.canvas.minWidth,
    CONFIG.canvas.maxWidth
  );
  state.canvasWidth = newWidth;

  if (dimensionState.aspectLocked && dimensionState.aspectRatio) {
    state.canvasHeight = Math.round(newWidth / dimensionState.aspectRatio);
    state.canvasHeight = clamp(
      state.canvasHeight,
      CONFIG.canvas.minHeight,
      CONFIG.canvas.maxHeight
    );
  }

  if (fromInput) {
    clearResolutionPreset();
    checkAndSetMatchingPresets();
  }

  updateSizeInputs();
  updateSizeDisplay();
  draw();
  updateCSS();
  updateAllDimensionUI();
  resize();
}

function handleHeightChange(newHeight, fromInput = false) {
  newHeight = clamp(
    parseInt(newHeight) || CONFIG.canvas.minHeight,
    CONFIG.canvas.minHeight,
    CONFIG.canvas.maxHeight
  );
  state.canvasHeight = newHeight;

  if (dimensionState.aspectLocked && dimensionState.aspectRatio) {
    state.canvasWidth = Math.round(newHeight * dimensionState.aspectRatio);
    state.canvasWidth = clamp(
      state.canvasWidth,
      CONFIG.canvas.minWidth,
      CONFIG.canvas.maxWidth
    );
  }

  if (fromInput) {
    clearResolutionPreset();
    checkAndSetMatchingPresets();
  }

  updateSizeInputs();
  updateSizeDisplay();
  draw();
  updateCSS();
  updateAllDimensionUI();
  resize();
}

function clearResolutionPreset() {
  dimensionState.activeResolutionPreset = null;
  dimensionState.isResolutionMode = false;
}

function checkAndSetMatchingPresets() {
  // چک aspect ratio
  if (dimensionState.aspectW && dimensionState.aspectH) {
    dimensionState.activeAspectPreset = null;
    for (const [name, preset] of Object.entries(aspectPresets)) {
      if (
        preset.w === dimensionState.aspectW &&
        preset.h === dimensionState.aspectH
      ) {
        dimensionState.activeAspectPreset = name;
        break;
      }
    }
  }

  // چک resolution
  const key = `${state.canvasWidth}x${state.canvasHeight}`;
  if (resolutionPresets[key]) {
    dimensionState.activeResolutionPreset = key;
  }
}

// ========== UI UPDATE FUNCTIONS ==========

function updateAllDimensionUI() {
  updateAspectButtonsUI();
  updateAspectInputsUI();
  updateResolutionButtonsUI();
  updateLockButtonUI();
}

function updateAspectButtonsUI() {
  document.querySelectorAll(".aspect-btn").forEach((btn) => {
    const ratio = btn.dataset.ratio;
    let isActive = false;

    if (ratio === "free" && !dimensionState.aspectLocked) {
      isActive = true;
    } else if (
      ratio === dimensionState.activeAspectPreset &&
      dimensionState.aspectLocked
    ) {
      isActive = true;
    }

    btn.classList.toggle("active", isActive);
  });
}

function updateAspectInputsUI() {
  const inputW = document.getElementById("aspectW");
  const inputH = document.getElementById("aspectH");

  if (!inputW || !inputH) return;

  // اگر کاربر نسبت دلخواه وارد کرده، همان مقادیر را نمایش بده
  if (
    dimensionState.aspectLocked &&
    dimensionState.aspectW &&
    dimensionState.aspectH
  ) {
    inputW.value = dimensionState.aspectW;
    inputH.value = dimensionState.aspectH;
  } else {
    // در غیر این صورت، نسبت ساده‌شده‌ی بوم را نشان بده
    const simple = simplifyRatio(state.canvasWidth, state.canvasHeight);
    inputW.value = simple.w;
    inputH.value = simple.h;
  }
}

function updateResolutionButtonsUI() {
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    const w = parseInt(btn.dataset.w);
    const h = parseInt(btn.dataset.h);
    const key = `${w}x${h}`;

    const isActive = dimensionState.activeResolutionPreset === key;
    btn.classList.toggle("selected", isActive);
  });
}

function updateLockButtonUI() {
  const lockBtn = document.getElementById("aspectLockBtn");
  const lockIcon = document.getElementById("aspectLockIcon");
  const linkBtn = document.getElementById("sizeLinkBtn");

  if (lockBtn) {
    lockBtn.classList.toggle("locked", dimensionState.aspectLocked);
  }

  if (lockIcon) {
    lockIcon.src = dimensionState.aspectLocked
      ? "./icon/lock.svg"
      : "./icon/unlock.svg";
  }

  if (linkBtn) {
    linkBtn.classList.toggle("linked", dimensionState.aspectLocked);
  }
}

function updateSizeInputs() {
  if (canvasWidth) canvasWidth.value = Math.round(state.canvasWidth);
  if (canvasHeight) canvasHeight.value = Math.round(state.canvasHeight);
}

function updateSizeDisplay() {
  const el = document.getElementById("sizeDisplay");
  if (el) {
    el.textContent = `${Math.round(state.canvasWidth)} × ${Math.round(
      state.canvasHeight
    )}`;
  }
}

// ========== CANVAS RESIZE ==========
function resize() {
  W = state.canvasWidth;
  H = state.canvasHeight;

  const maxDim = Math.max(W, H);
  const isMobileDevice = window.innerWidth < 768;
  let dpr = devicePixelRatio || 1;

  if (isMobileDevice) dpr = Math.min(dpr, 1.5);
  else if (maxDim > 2000) dpr = 1;
  else if (maxDim > 1200) dpr = 1.5;
  else dpr = Math.min(dpr, 2);

  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);

  const scale = zoomState.current / 100;
  canvas.style.width = W * scale + "px";
  canvas.style.height = H * scale + "px";

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const key = `${W}x${H}`;
  if (resolutionPresets[key]) {
    dimensionState.activeResolutionPreset = key;
    dimensionState.isResolutionMode = true;
  } else {
    dimensionState.activeResolutionPreset = null;
    dimensionState.isResolutionMode = false;
  }

  updateAllDimensionUI();
  calcDynamicMinZoom();
  updateZoomUI();
  updateSizeDisplay();
  checkAndFixZoom();

  draw();
}

// ========== checkAndFixZoom ==========
function checkAndFixZoom() {
  const wrap = document.querySelector(".canvas-wrap");
  if (!wrap) return;

  const rect = wrap.getBoundingClientRect();
  const padding = zoomState.padding * 2;
  const scale = zoomState.current / 100;

  const displayWidth = state.canvasWidth * scale;
  const displayHeight = state.canvasHeight * scale;

  const tooLarge =
    displayWidth > rect.width - padding ||
    displayHeight > rect.height - padding;

  const tooSmall =
    displayWidth < (rect.width - padding) * 0.93 &&
    displayHeight < (rect.height - padding) * 0.3;

  if (tooLarge || tooSmall) {
    fitToScreen();
  } else {
    canvas.style.width = state.canvasWidth * scale + "px";
    canvas.style.height = state.canvasHeight * scale + "px";
    updateZoomUI();
  }
}

function setCanvasSize(w, h) {
  state.canvasWidth = Math.floor(
    clamp(w, CONFIG.canvas.minWidth, CONFIG.canvas.maxWidth)
  );
  state.canvasHeight = Math.floor(
    clamp(h, CONFIG.canvas.minHeight, CONFIG.canvas.maxHeight)
  );
  refresh();
}

// ========== STOP CRUD ==========
function getStop(id) {
  return state.stops.find((s) => s.id === id);
}

function addStop(type) {
  counter++;
  const typeNames = { radial: "Radial", linear: "Linear", conic: "Conic" };
  const s = {
    id: uid(),
    name: `${typeNames[type]} ${counter}`,
    type,
    visible: true,
    x: 0.2 + Math.random() * 0.6,
    y: state.lockVertical ? 0.5 : 0.2 + Math.random() * 0.6,
    color: randColor(),
    size: 80 + Math.random() * 100,
    feather: 60,
    opacity: 100,
    angle: Math.floor(Math.random() * 180),
    startAngle: 0,
    stops: [
      { pos: 0, color: randColor(), opacity: 100 },
      { pos: 100, color: randColor(), opacity: 100 },
    ],
  };
  state.stops.push(s);
  state.selected = s.id;
  refresh();
}

function delStop(id) {
  state.stops = state.stops.filter((s) => s.id !== id);
  if (state.selected === id) state.selected = null;
  refresh();
}

function dupStop(id) {
  const o = getStop(id);
  if (!o) return;
  counter++;
  const c = JSON.parse(JSON.stringify(o));
  c.id = uid();
  c.name += " Copy";
  c.x = clamp(c.x + 0.04, 0, 1);
  c.y = clamp(c.y + 0.04, 0, 1);
  state.stops.push(c);
  state.selected = c.id;
  refresh();
}

function toggleVis(id) {
  const s = getStop(id);
  if (s) {
    s.visible = !s.visible;
    refresh();
  }
}

function addColorStop(s) {
  const pos =
    s.stops.length < 5
      ? Math.round(100 / (s.stops.length + 1)) * s.stops.length
      : 50;
  s.stops.push({ pos, color: randColor(), opacity: 100 });
  s.stops.sort((a, b) => a.pos - b.pos);
  refresh();
}

function delColorStop(s, i) {
  if (s.stops.length > 2) {
    s.stops.splice(i, 1);
    refresh();
  }
}

function safeButtonAction(action) {
  isButtonInteraction = true;
  
  try {
    action();
  } finally {
    setTimeout(() => {
      isButtonInteraction = false;
    }, 100);
  }
}
// ========== TOGGLE HANDLES ==========
const toggleBtn = document.getElementById("toggleHandles");
let lastToggleTime = 0;

function handleToggleClick(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
  
  const now = Date.now();
  if (now - lastToggleTime < 300) return;
  lastToggleTime = now;

  state.showHandles = !state.showHandles;

  if (toggleBtn) {
    toggleBtn.innerHTML = state.showHandles
      ? '<img src="./icon/eye.svg" alt="show handel">'
      : '<img src="./icon/eye-close.svg" alt="hide handel">';
    toggleBtn.classList.toggle("handles-hidden", !state.showHandles);
  }
  draw();
}

if (toggleBtn) {
  toggleBtn.addEventListener("click", handleToggleClick);
  
  toggleBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });
  
  toggleBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleToggleClick(e);
  }, { passive: false });
}


// ========== DRAWING FUNCTIONS ==========
function getLinearGradientPoints(angle, width, height) {
  const angleRad = ((angle - 90) * Math.PI) / 180;
  const diagonal = Math.hypot(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const dx = (Math.cos(angleRad) * diagonal) / 2;
  const dy = (Math.sin(angleRad) * diagonal) / 2;

  return { x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy, cx, cy };
}

function getHandleSize(selected = false) {
  const scale = Math.max(W, H) / 800;
  const baseSize = selected ? 12 : 8;
  const size = baseSize * scale;
  return clamp(size, selected ? 12 : 8, selected ? 50 : 35);
}

function getLineWidth(selected = false) {
  const scale = Math.max(W, H) / 800;
  const baseWidth = selected ? 5 : 4;
  const width = baseWidth * scale;
  return clamp(width, selected ? 5 : 4, selected ? 16 : 12);
}

function getFontSize() {
  const scale = Math.max(W, H) / 800;
  const baseSize = 10;
  const size = baseSize * scale;
  return clamp(size, 10, 36);
}

// ========== DRAW FUNCTION ==========
function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = rgba(state.bgColor, state.bgAlpha / 100);
  ctx.fillRect(0, 0, W, H);

  if (state.lockVertical) {
    const scale = Math.max(W, H) / 800;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2 * scale;
    ctx.setLineDash([10 * scale, 5 * scale]);
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ذخیره state قبل از فیلتر
  ctx.save();
  
  // اعمال فیلترها روی گرادینت‌ها
  const filterString = getFilterString();
  if (filterString) {
    ctx.filter = filterString;
  }

  ctx.globalCompositeOperation = "screen";
  state.stops.filter((s) => s.visible).forEach(drawGrad);
  ctx.globalCompositeOperation = "source-over";

  // ریست فیلتر قبل از نویز
  ctx.filter = 'none';
  ctx.restore();

  // نویز بدون فیلتر
  drawNoise();

  // هندل‌ها بدون فیلتر
  if (state.showHandles) {
    state.stops.filter((s) => s.visible).forEach(drawHandle);
  }
}

function drawGrad(s) {
  const cx = s.x * W;
  const cy = s.y * H;

  if (s.type === "radial") drawRadialGradient(s, cx, cy);
  else if (s.type === "linear") drawLinearGradient(s);
  else if (s.type === "conic") drawConicGradient(s, cx, cy);
}

function drawRadialGradient(s, cx, cy) {
  const outer = s.size;
  const solidEnd = 1 - s.feather / 100;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, outer);
  const color = rgba(s.color, s.opacity / 100);

  grad.addColorStop(0, color);
  if (solidEnd > 0 && solidEnd < 1) {
    grad.addColorStop(solidEnd, color);
  }
  grad.addColorStop(1, rgba(s.color, 0));

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.fill();
}

function drawLinearGradient(s) {
  const { x1, y1, x2, y2 } = getLinearGradientPoints(s.angle, W, H);
  const grad = ctx.createLinearGradient(x1, y1, x2, y2);

  [...s.stops]
    .sort((a, b) => a.pos - b.pos)
    .forEach((cs) => {
      grad.addColorStop(
        clamp(cs.pos / 100, 0, 1),
        rgba(cs.color, cs.opacity / 100)
      );
    });

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function drawConicGradient(s, cx, cy) {
  const startAngle = ((s.startAngle - 90) * Math.PI) / 180;
  const grad = ctx.createConicGradient(startAngle, cx, cy);

  [...s.stops]
    .sort((a, b) => a.pos - b.pos)
    .forEach((cs) => {
      grad.addColorStop(
        clamp(cs.pos / 100, 0, 1),
        rgba(cs.color, cs.opacity / 100)
      );
    });

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function drawHandle(s) {
  const sel = state.selected === s.id;
  const cx = s.x * W;
  const cy = s.y * H;

  if (s.type === "radial") drawRadialHandle(s, cx, cy, sel);
  else if (s.type === "linear") drawLinearHandle(s, cx, cy, sel);
  else if (s.type === "conic") drawConicHandle(s, cx, cy, sel);
}

function drawRadialHandle(s, cx, cy, sel) {
  const handleSize = getHandleSize(sel);
  const lineWidth = getLineWidth(sel);
  const scale = Math.max(W, H) / 800;

  if (sel) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.setLineDash([8 * scale, 4 * scale]);
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, s.size, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 20 * scale;
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.arc(cx, cy, handleSize * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 8 * scale;
  ctx.shadowOffsetY = 2 * scale;

  ctx.strokeStyle = s.color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(cx, cy, handleSize, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = s.color;
  ctx.beginPath();
  ctx.arc(cx, cy, handleSize * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLinearHandle(s, cx, cy, sel) {
  const handleSize = getHandleSize(sel);
  const lineWidth = getLineWidth(sel);
  const fontSize = getFontSize();
  const scale = Math.max(W, H) / 800;

  const angleRad = ((s.angle - 90) * Math.PI) / 180;
  const handleLen = Math.min(W, H) * 0.35;
  const dx = Math.cos(angleRad) * handleLen;
  const dy = Math.sin(angleRad) * handleLen;
  const x1 = cx - dx,
    y1 = cy - dy;
  const x2 = cx + dx,
    y2 = cy + dy;

  ctx.save();
  if (sel) {
    ctx.shadowColor = "rgba(255,255,255,0.3)";
    ctx.shadowBlur = 10 * scale;
  }

  const lineGrad = ctx.createLinearGradient(x1, y1, x2, y2);
  if (s.stops.length >= 2) {
    s.stops.forEach((cs) => {
      lineGrad.addColorStop(cs.pos / 100, rgba(cs.color, sel ? 0.8 : 0.4));
    });
  } else {
    lineGrad.addColorStop(
      0,
      sel ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)"
    );
    lineGrad.addColorStop(
      1,
      sel ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)"
    );
  }

  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();

  s.stops.forEach((cs, i) => {
    const px = lerp(x1, x2, cs.pos / 100);
    const py = lerp(y1, y2, cs.pos / 100);
    drawColorStop(px, py, cs, sel, handleSize, lineWidth, scale);

    if (sel) {
      drawStopLabel(
        px,
        py + handleSize + 12 * scale,
        cs.pos + "%",
        fontSize,
        scale
      );
    }
  });

  drawCenterHandle(cx, cy, sel, handleSize * 0.6, lineWidth, scale);
}

function drawConicHandle(s, cx, cy, sel) {
  const handleSize = getHandleSize(sel);
  const lineWidth = getLineWidth(sel);
  const fontSize = getFontSize();
  const scale = Math.max(W, H) / 800;

  const radius = Math.min(W, H) * 0.25;
  const startAngleRad = ((s.startAngle - 90) * Math.PI) / 180;

  // ۱. دایره راهنما (خط‌چین)
  if (sel) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.setLineDash([5 * scale, 5 * scale]);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ۲. خط شعاعی (نشانگر شروع زاویه)
  const rotateX = cx + Math.cos(startAngleRad) * radius;
  const rotateY = cy + Math.sin(startAngleRad) * radius;

  ctx.save();
  ctx.strokeStyle = sel ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.4)";
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(rotateX, rotateY);
  ctx.stroke();
  
  // ۳. رسم یک هندل کوچک در انتهای خط برای چرخش (اختیاری)
  if (sel) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(rotateX, rotateY, 4 * scale, 0, Math.PI * 2);
      ctx.fill();
  }
  ctx.restore();

  // ۴. رسم Color Stops
  s.stops.forEach((cs) => {
    // زاویه هر استاپ نسبت به startAngle محاسبه می‌شود
    const stopAngle = startAngleRad + (cs.pos / 100) * Math.PI * 2;
    const px = cx + Math.cos(stopAngle) * radius;
    const py = cy + Math.sin(stopAngle) * radius;

    drawColorStop(px, py, cs, sel, handleSize * 0.8, lineWidth, scale);

    if (sel) {
      const labelR = radius + handleSize + 20 * scale;
      const lx = cx + Math.cos(stopAngle) * labelR;
      const ly = cy + Math.sin(stopAngle) * labelR;
      drawStopLabel(lx, ly, cs.pos + "%", fontSize, scale);
    }
  });

  // ۵. دسته مرکزی برای جابجایی کل گرادینت
  drawCenterHandle(cx, cy, sel, handleSize, lineWidth, scale, s.stops[0]?.color);
}


function drawColorStop(px, py, cs, sel, handleSize, lineWidth, scale) {
  if (sel) {
    ctx.save();
    ctx.shadowColor = cs.color;
    ctx.shadowBlur = 15 * scale;
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.arc(px, py, handleSize * 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 8 * scale;
  ctx.shadowOffsetY = 3 * scale;

  ctx.strokeStyle = cs.color;
  ctx.lineWidth = lineWidth * 0.8;
  ctx.beginPath();
  ctx.arc(px, py, handleSize, 0, Math.PI * 2);
  ctx.stroke();

  const innerGrad = ctx.createRadialGradient(
    px - handleSize * 0.2,
    py - handleSize * 0.2,
    0,
    px,
    py,
    handleSize * 0.6
  );
  innerGrad.addColorStop(0, lighten(cs.color, 30));
  innerGrad.addColorStop(1, cs.color);

  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.arc(px, py, handleSize * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStopLabel(x, y, text, fontSize, scale) {
  ctx.save();
  const padding = 4 * scale;
  const bgWidth = fontSize * 2.5 + padding * 2;
  const bgHeight = fontSize + padding * 2;

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.roundRect(
    x - bgWidth / 2,
    y - bgHeight / 2,
    bgWidth,
    bgHeight,
    4 * scale
  );
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawCenterHandle(cx, cy, sel, size, lineWidth, scale, color = null) {
  if (sel) {
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.5)";
    ctx.shadowBlur = 12 * scale;
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.arc(cx, cy, size * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 6 * scale;
  ctx.shadowOffsetY = 2 * scale;

  const outerGrad = ctx.createRadialGradient(
    cx - size * 0.3,
    cy - size * 0.3,
    0,
    cx,
    cy,
    size
  );
  outerGrad.addColorStop(0, "#ffffff");
  outerGrad.addColorStop(1, "#e0e0e0");

  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = sel ? "rgba(100,100,100,0.5)" : "rgba(150,150,150,0.3)";
  ctx.lineWidth = lineWidth * 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, size, 0, Math.PI * 2);
  ctx.stroke();

  if (sel) {
    ctx.strokeStyle = "rgba(100,100,100,0.6)";
    ctx.lineWidth = 2 * scale;
    ctx.lineCap = "round";

    const crossSize = size * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - crossSize, cy);
    ctx.lineTo(cx + crossSize, cy);
    ctx.moveTo(cx, cy - crossSize);
    ctx.lineTo(cx, cy + crossSize);
    ctx.stroke();
  }
}

// ========== THROTTLE ==========
let drawRAF = null;

function throttledDraw() {
  if (drawRAF) return;
  drawRAF = requestAnimationFrame(() => {
    drawRAF = null;
    draw();
  });
}

// ========== CANVAS INTERACTION ==========
function getEventPos(e) {
  const rect = canvas.getBoundingClientRect();

  let clientX, clientY;

  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else if (e.changedTouches && e.changedTouches.length > 0) {
    clientX = e.changedTouches[0].clientX;
    clientY = e.changedTouches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  const scaleX = W / rect.width;
  const scaleY = H / rect.height;

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

function onPointerDown(e) {
  e.preventDefault();

  const pos = getEventPos(e);
  const mx = pos.x;
  const my = pos.y;
  const hitRadius = getHitRadius();

  for (const s of [...state.stops].reverse().filter((s) => s.visible)) {
    const cx = s.x * W;
    const cy = s.y * H;

    if (s.type === "radial") {
      if (Math.hypot(cx - mx, cy - my) < hitRadius) {
        drag = { t: "move", s };
        state.selected = s.id;
        refresh();
        return;
      }
    } else if (s.type === "linear") {
      const angleRad = ((s.angle - 90) * Math.PI) / 180;
      const handleLen = Math.min(W, H) * 0.35;
      const dx = Math.cos(angleRad) * handleLen;
      const dy = Math.sin(angleRad) * handleLen;
      const x1 = cx - dx,
        y1 = cy - dy;
      const x2 = cx + dx,
        y2 = cy + dy;

      for (let i = 0; i < s.stops.length; i++) {
        const px = lerp(x1, x2, s.stops[i].pos / 100);
        const py = lerp(y1, y2, s.stops[i].pos / 100);
        if (Math.hypot(px - mx, py - my) < hitRadius) {
          drag = { t: "cs", s, i, x1, y1, x2, y2 };
          state.selected = s.id;
          refresh();
          return;
        }
      }

      if (Math.hypot(cx - mx, cy - my) < hitRadius) {
        drag = { t: "move", s };
        state.selected = s.id;
        refresh();
        return;
      }

      const lineLen = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      const t =
        ((mx - x1) * (x2 - x1) + (my - y1) * (y2 - y1)) / (lineLen * lineLen);
      if (t >= 0 && t <= 1) {
        const projX = x1 + t * (x2 - x1);
        const projY = y1 + t * (y2 - y1);
        if (Math.hypot(projX - mx, projY - my) < hitRadius) {
          drag = { t: "angle", s, cx, cy };
          state.selected = s.id;
          refresh();
          return;
        }
      }
    } else if (s.type === "conic") {
      const radius = Math.min(W, H) * 0.25;
      const startAngleRad = ((s.startAngle - 90) * Math.PI) / 180;

      for (let i = 0; i < s.stops.length; i++) {
        const stopAngle = startAngleRad + (s.stops[i].pos / 100) * Math.PI * 2;
        const px = cx + Math.cos(stopAngle) * radius;
        const py = cy + Math.sin(stopAngle) * radius;
        if (Math.hypot(px - mx, py - my) < hitRadius) {
          drag = { t: "conic-cs", s, i, radius };
          state.selected = s.id;
          refresh();
          return;
        }
      }

      const indicatorLen = radius + 20;
      const ix = cx + Math.cos(startAngleRad) * indicatorLen;
      const iy = cy + Math.sin(startAngleRad) * indicatorLen;
      if (Math.hypot(ix - mx, iy - my) < hitRadius) {
        drag = { t: "conic-angle", s };
        state.selected = s.id;
        refresh();
        return;
      }

      if (Math.hypot(cx - mx, cy - my) < hitRadius) {
        drag = { t: "move", s };
        state.selected = s.id;
        refresh();
        return;
      }
    }
  }

  state.selected = null;
  refresh();
}

function onPointerMove(e) {
  if (!drag) return;
  e.preventDefault();

  const pos = getEventPos(e);
  const mx = pos.x;
  const my = pos.y;
  const cx = drag.s.x * W;
  const cy = drag.s.y * H;

  switch (drag.t) {
    case "move":
      drag.s.x = clamp(mx / W, 0, 1);
      if (!state.lockVertical) {
        drag.s.y = clamp(my / H, 0, 1);
      }
      break;

    case "cs":
      const { x1, y1, x2, y2 } = drag;
      const dx = x2 - x1,
        dy = y2 - y1;
      const len2 = dx * dx + dy * dy;
      const t = clamp(((mx - x1) * dx + (my - y1) * dy) / len2, 0, 1);
      drag.s.stops[drag.i].pos = Math.round(t * 100);
      break;

    case "angle":
      let newAngle = (Math.atan2(my - cy, mx - cx) * 180) / Math.PI + 90;
      if (newAngle < 0) newAngle += 360;
      drag.s.angle = Math.round(newAngle) % 360;
      break;

    case "conic-angle":
      let conicAngle = (Math.atan2(my - cy, mx - cx) * 180) / Math.PI + 90;
      if (conicAngle < 0) conicAngle += 360;
      drag.s.startAngle = Math.round(conicAngle) % 360;
      break;

    case "conic-cs":
      const startAngleRad = ((drag.s.startAngle - 90) * Math.PI) / 180;
      let relAngle = Math.atan2(my - cy, mx - cx) - startAngleRad;
      if (relAngle < 0) relAngle += Math.PI * 2;
      drag.s.stops[drag.i].pos = clamp(
        Math.round((relAngle / (Math.PI * 2)) * 100),
        0,
        100
      );
      break;
  }

  throttledDraw();
}

function onPointerUp() {
  if (drag) {
    updateCSS();
  }
  drag = null;
}

// Canvas events
canvas.addEventListener("mousedown", onPointerDown);
canvas.addEventListener("touchstart", onPointerDown, { passive: false });
document.addEventListener("mousemove", onPointerMove);
document.addEventListener("touchmove", onPointerMove, { passive: false });
document.addEventListener("mouseup", onPointerUp);
document.addEventListener("touchend", onPointerUp);

function refreshUI() {
  draw();
  renderList();
  renderInspector();
  updateCSS();
  updateBgPreview();
}

// ========== LOCK BUTTON ==========
const btnLock = document.getElementById("btnLock");
let lastLockTime = 0;

function handleLockClick(e) {
  // ✅ اول همه event ها رو متوقف کن
  if (e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
  
  // جلوگیری از اجرای دوباره
  const now = Date.now();
  if (now - lastLockTime < 300) return;
  lastLockTime = now;

  state.lockVertical = !state.lockVertical;
  
  if (btnLock) {
    btnLock.classList.toggle("active", state.lockVertical);
    btnLock.innerHTML = state.lockVertical
      ? '<img src="./icon/lock.svg" alt="locked">'
      : '<img src="./icon/unlock.svg" alt="unlocked">';
  }

  if (state.lockVertical) {
    state.stops.forEach((s) => (s.y = 0.5));
  }
  
  // فقط UI آپدیت بشه
  draw();
  renderList();
  renderInspector();
  updateCSS();
  updateBgPreview();
}

if (btnLock) {
  btnLock.addEventListener("click", handleLockClick);
  
  btnLock.addEventListener("touchstart", (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });
  
  btnLock.addEventListener("touchend", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleLockClick(e);
  }, { passive: false });
}
// ========== NOISE SYSTEM ==========
const noiseState = {
  enabled: true,
  opacity: 0,
  frequency: 0.65,    // 0.01 - 1
  blend: 'overlay',
  canvas: null,
  isGenerating: false,
  lastW: 0,
  lastH: 0,
  lastFreq: 0
};

// ========== CSS Storage ==========
let currentGradientCSS = "";
let currentNoiseCSS = "";
let currentSVGFilter = "";

// ========== CREATE SVG NOISE ==========
function generateSVGNoise(width, height, frequency) {
  return new Promise((resolve) => {
    const w = Math.max(100, width);
    const h = Math.max(100, height);
    
    const svgContent = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
        <defs>
          <filter id="noiseFilter" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="4" stitchTiles="stitch" result="noise"/>
            <feColorMatrix type="saturate" values="0" in="noise" result="bwNoise"/>
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="white" filter="url(#noiseFilter)"/>
      </svg>
    `;
    
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
// ========== FILTER STATE ==========
const filterState = {
  enabled: true,
  brightness: 100,    // 0-200, default 100
  contrast: 100,      // 0-200, default 100
  saturate: 100,      // 0-200, default 100
  hue: 0,             // 0-360, default 0
  blur: 0,            // 0-20, default 0
  grayscale: 0,       // 0-100, default 0
  sepia: 0,           // 0-100, default 0
  invert: 0,          // 0-100, default 0
};

// Default values برای ریست
const filterDefaults = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  hue: 0,
  blur: 0,
  grayscale: 0,
  sepia: 0,
  invert: 0,
};

// CSS Storage اضافه کن
let currentFilterCSS = "";

// ========== FILTER FUNCTIONS ==========

function getFilterString() {
  if (!filterState.enabled) return '';
  
  const filters = [];
  
  if (filterState.brightness !== 100) {
    filters.push(`brightness(${filterState.brightness}%)`);
  }
  if (filterState.contrast !== 100) {
    filters.push(`contrast(${filterState.contrast}%)`);
  }
  if (filterState.saturate !== 100) {
    filters.push(`saturate(${filterState.saturate}%)`);
  }
  if (filterState.hue !== 0) {
    filters.push(`hue-rotate(${filterState.hue}deg)`);
  }
  if (filterState.blur > 0) {
    filters.push(`blur(${filterState.blur}px)`);
  }
  if (filterState.grayscale > 0) {
    filters.push(`grayscale(${filterState.grayscale}%)`);
  }
  if (filterState.sepia > 0) {
    filters.push(`sepia(${filterState.sepia}%)`);
  }
  if (filterState.invert > 0) {
    filters.push(`invert(${filterState.invert}%)`);
  }
  
  return filters.join(' ');
}

function hasActiveFilters() {
  return filterState.enabled && (
    filterState.brightness !== 100 ||
    filterState.contrast !== 100 ||
    filterState.saturate !== 100 ||
    filterState.hue !== 0 ||
    filterState.blur > 0 ||
    filterState.grayscale > 0 ||
    filterState.sepia > 0 ||
    filterState.invert > 0
  );
}

function setFilter(name, value) {
  const numValue = parseFloat(value);
  
  switch(name) {
    case 'brightness':
    case 'contrast':
    case 'saturate':
      filterState[name] = clamp(numValue, 0, 200);
      break;
    case 'hue':
      filterState[name] = clamp(numValue, 0, 360);
      break;
    case 'blur':
      filterState[name] = clamp(numValue, 0, 20);
      break;
    case 'grayscale':
    case 'sepia':
    case 'invert':
      filterState[name] = clamp(numValue, 0, 100);
      break;
  }
  
  updateFilterUI();
  draw();
  updateCSS();
}

function toggleFilters() {
  filterState.enabled = !filterState.enabled;
  updateFilterUI();
  draw();
  updateCSS();
}

function resetFilters() {
  Object.assign(filterState, filterDefaults);
  updateFilterUI();
  draw();
  updateCSS();
  
  // انیمیشن ریست
  const btn = document.getElementById('filtersResetBtn');
  if (btn) {
    btn.classList.add('resetting');
    setTimeout(() => btn.classList.remove('resetting'), 500);
  }
}

function updateFilterUI() {
  const filters = ['brightness', 'contrast', 'saturate', 'hue', 'blur', 'grayscale', 'sepia', 'invert'];
  
  filters.forEach(name => {
    const slider = document.getElementById(`filter${capitalize(name)}`);
    const numInput = document.getElementById(`filter${capitalize(name)}Num`);
    const row = slider?.closest('.filter-row');
    
    if (slider && slider !== document.activeElement) {
      slider.value = filterState[name];
    }
    if (numInput && numInput !== document.activeElement) {
      numInput.value = filterState[name];
    }
    
    // هایلایت فیلترهای فعال
    if (row) {
      const isDefault = filterState[name] === filterDefaults[name];
      row.classList.toggle('active', !isDefault);
    }
  });
  
  // Toggle button
  const toggleBtn = document.getElementById('filtersToggleBtn');
  if (toggleBtn) {
    toggleBtn.classList.toggle('disabled', !filterState.enabled);
    const img = toggleBtn.querySelector('img');
    if (img) {
      img.src = filterState.enabled ? './icon/eye.svg' : './icon/eye-close.svg';
    }
  }
  
  // Disable controls when filters are off
  const controls = document.querySelector('.filter-controls');
  if (controls) {
    controls.classList.toggle('disabled', !filterState.enabled);
  }
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function initFilterEvents() {
  const filters = ['brightness', 'contrast', 'saturate', 'hue', 'blur', 'grayscale', 'sepia', 'invert'];
  
  filters.forEach(name => {
    const slider = document.getElementById(`filter${capitalize(name)}`);
    const numInput = document.getElementById(`filter${capitalize(name)}Num`);
    
    if (slider) {
      slider.addEventListener('input', (e) => setFilter(name, e.target.value));
    }
    
    if (numInput) {
      numInput.addEventListener('input', (e) => setFilter(name, e.target.value));
      numInput.addEventListener('change', (e) => setFilter(name, e.target.value));
    }
  });
  
  // Toggle & Reset buttons
  document.getElementById('filtersToggleBtn')?.addEventListener('click', toggleFilters);
  document.getElementById('filtersResetBtn')?.addEventListener('click', resetFilters);
}
// ========== MANUAL FILTER APPLICATION ==========

function applyFiltersToImageData(imageData) {
  const data = imageData.data;
  const len = data.length;
  
  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    // alpha = data[i + 3]
    
    // 1. Invert (اول اعمال بشه)
    if (filterState.invert > 0) {
      const inv = filterState.invert / 100;
      r = r + (255 - 2 * r) * inv;
      g = g + (255 - 2 * g) * inv;
      b = b + (255 - 2 * b) * inv;
    }
    
    // 2. Brightness
    if (filterState.brightness !== 100) {
      const br = filterState.brightness / 100;
      r *= br;
      g *= br;
      b *= br;
    }
    
    // 3. Contrast
    if (filterState.contrast !== 100) {
      const con = filterState.contrast / 100;
      const factor = (259 * (con * 255 + 255)) / (255 * (259 - con * 255));
      r = factor * (r - 128) + 128;
      g = factor * (g - 128) + 128;
      b = factor * (b - 128) + 128;
    }
    
    // 4. Grayscale
    if (filterState.grayscale > 0) {
      const gray = filterState.grayscale / 100;
      const avg = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = r + (avg - r) * gray;
      g = g + (avg - g) * gray;
      b = b + (avg - b) * gray;
    }
    
    // 5. Sepia
    if (filterState.sepia > 0) {
      const sep = filterState.sepia / 100;
      const tr = 0.393 * r + 0.769 * g + 0.189 * b;
      const tg = 0.349 * r + 0.686 * g + 0.168 * b;
      const tb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = r + (tr - r) * sep;
      g = g + (tg - g) * sep;
      b = b + (tb - b) * sep;
    }
    
    // 6. Saturate
    if (filterState.saturate !== 100) {
      const sat = filterState.saturate / 100;
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = gray + (r - gray) * sat;
      g = gray + (g - gray) * sat;
      b = gray + (b - gray) * sat;
    }
    
    // 7. Hue Rotate
    if (filterState.hue !== 0) {
      const result = rotateHue(r, g, b, filterState.hue);
      r = result.r;
      g = result.g;
      b = result.b;
    }
    
    // Clamp values
    data[i] = clamp(Math.round(r), 0, 255);
    data[i + 1] = clamp(Math.round(g), 0, 255);
    data[i + 2] = clamp(Math.round(b), 0, 255);
  }
  
  return imageData;
}

// Hue rotation helper
function rotateHue(r, g, b, degrees) {
  const rad = degrees * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  
  // Rotation matrix for hue
  const matrix = [
    0.213 + cos * 0.787 - sin * 0.213,
    0.715 - cos * 0.715 - sin * 0.715,
    0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143,
    0.715 + cos * 0.285 + sin * 0.140,
    0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787,
    0.715 - cos * 0.715 + sin * 0.715,
    0.072 + cos * 0.928 + sin * 0.072
  ];
  
  return {
    r: r * matrix[0] + g * matrix[1] + b * matrix[2],
    g: r * matrix[3] + g * matrix[4] + b * matrix[5],
    b: r * matrix[6] + g * matrix[7] + b * matrix[8]
  };
}

// Blur با StackBlur (سریع‌تر از Gaussian)
function applyBlur(ctx, width, height, radius) {
  if (radius <= 0) return;
  
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  
  // Simple box blur (برای نتیجه بهتر می‌تونید StackBlur استفاده کنید)
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d');
  
  // CSS filter blur برای canvas جداگانه
  tempCtx.filter = `blur(${radius}px)`;
  tempCtx.drawImage(ctx.canvas, 0, 0);
  
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(tempCanvas, 0, 0);
}
// ========== GLOBALS ==========
window.setFilter = setFilter;
window.toggleFilters = toggleFilters;
window.resetFilters = resetFilters;
// ========== INIT NOISE ==========
async function initNoiseTexture(force = false) {
  if (noiseState.isGenerating) return;
  
  const needsRegenerate = force || 
    !noiseState.canvas || 
    noiseState.lastW !== W || 
    noiseState.lastH !== H || 
    noiseState.lastFreq !== noiseState.frequency;
  
  if (!needsRegenerate) return;
  
  noiseState.isGenerating = true;
  noiseState.canvas = await generateSVGNoise(W, H, noiseState.frequency);
  noiseState.lastW = W;
  noiseState.lastH = H;
  noiseState.lastFreq = noiseState.frequency;
  noiseState.isGenerating = false;
}

// ========== DRAW NOISE ==========
function drawNoise() {
  if (!noiseState.enabled || noiseState.opacity <= 0 || !noiseState.canvas) return;
  
  ctx.save();
  ctx.globalCompositeOperation = noiseState.blend;
  ctx.globalAlpha = noiseState.opacity / 100;
  ctx.drawImage(noiseState.canvas, 0, 0, W, H);
  ctx.restore();
}

// ========== NOISE CONTROLS ==========
let noiseUpdateTimeout = null;

async function setNoiseOpacity(value) {
  noiseState.opacity = clamp(parseFloat(value) || 0, 0, 100);
  updateNoiseUI();
  
  if (noiseState.opacity > 0 && !noiseState.canvas) {
    await initNoiseTexture(true);
  }
  
  draw();
  updateCSS();
}

async function setNoiseFrequency(value) {
  const newFreq = clamp(parseFloat(value) || 0.65, 0.01, 1);
  
  if (newFreq === noiseState.frequency) return;
  
  noiseState.frequency = newFreq;
  updateNoiseUI();
  
  clearTimeout(noiseUpdateTimeout);
  noiseUpdateTimeout = setTimeout(async () => {
    if (noiseState.opacity > 0) {
      noiseState.canvas = null;
      noiseState.lastFreq = 0;
      await initNoiseTexture(true);
      draw();
    }
    updateCSS();
  }, 150);
}

function setNoiseBlend(value) {
  noiseState.blend = value;
  draw();
  updateCSS();
}

function toggleNoise() {
  noiseState.enabled = !noiseState.enabled;
  updateNoiseUI();
  draw();
  updateCSS();
}

function updateNoiseUI() {
  const opacityInput = document.getElementById('noiseOpacity');
  const frequencyInput = document.getElementById('noiseFrequency');
  const blendSelect = document.getElementById('noiseBlend');
  const toggleBtn = document.getElementById('noiseToggleBtn');
  
  if (opacityInput && opacityInput !== document.activeElement) {
    opacityInput.value = noiseState.opacity;
  }
  if (frequencyInput && frequencyInput !== document.activeElement) {
    frequencyInput.value = noiseState.frequency;
  }
  if (blendSelect) blendSelect.value = noiseState.blend;
  
  if (toggleBtn) {
    toggleBtn.classList.toggle('disabled', !noiseState.enabled);
    const img = toggleBtn.querySelector('img');
    if (img) {
      img.src = noiseState.enabled ? './icon/eye.svg' : './icon/eye-close.svg';
    }
  }
}

function initNoiseEvents() {
  const opacityInput = document.getElementById('noiseOpacity');
  const frequencyInput = document.getElementById('noiseFrequency');
  const blendSelect = document.getElementById('noiseBlend');
  const toggleBtn = document.getElementById('noiseToggleBtn');

  if (opacityInput) {
    opacityInput.addEventListener('input', (e) => setNoiseOpacity(e.target.value));
    opacityInput.addEventListener('change', (e) => setNoiseOpacity(e.target.value));
  }

  if (frequencyInput) {
    frequencyInput.addEventListener('input', (e) => setNoiseFrequency(e.target.value));
    frequencyInput.addEventListener('change', (e) => setNoiseFrequency(e.target.value));
  }

  if (blendSelect) {
    blendSelect.addEventListener('change', (e) => setNoiseBlend(e.target.value));
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleNoise);
  }
}

// ========== UPDATE CSS - سه خروجی جداگانه ==========


// ========== GLOBALS ==========
window.setNoiseOpacity = setNoiseOpacity;
window.setNoiseFrequency = setNoiseFrequency;
window.setNoiseBlend = setNoiseBlend;
window.toggleNoise = toggleNoise;
window.copyCSS = copyCSS;
window.copyGradientCSS = copyGradientCSS;
window.copyNoiseCSS = copyNoiseCSS;
window.copySVGFilter = copySVGFilter;
// ========== COLOR PICKER ==========
const MAX_RECENT_COLORS = 10;
let recentColors = [];

try {
  recentColors = JSON.parse(localStorage.getItem("recentColors") || "[]");
} catch (e) {
  recentColors = [];
}

function addToRecentColors(hex, alpha) {
  const colorKey = `${hex}_${alpha}`;
  recentColors = recentColors.filter((c) => `${c.hex}_${c.alpha}` !== colorKey);
  recentColors.unshift({ hex, alpha });
  if (recentColors.length > MAX_RECENT_COLORS) {
    recentColors = recentColors.slice(0, MAX_RECENT_COLORS);
  }
  try {
    localStorage.setItem("recentColors", JSON.stringify(recentColors));
  } catch (e) {}
  renderRecentColors();
}

function renderRecentColors() {
  const container = document.getElementById("recentColorsList");
  if (!container) return;

  if (recentColors.length === 0) {
    container.innerHTML =
      '<span class="recent-colors-empty">No recent colors</span>';
    return;
  }

  container.innerHTML = recentColors
    .map(
      (c, i) => `
    <div class="recent-color-item" 
         onclick="selectRecentColor(${i})" 
         title="${c.hex} (${c.alpha}%)">
      <div class="recent-color-inner" style="background: ${rgba(
        c.hex,
        c.alpha / 100
      )}"></div>
    </div>
  `
    )
    .join("");
}

function selectRecentColor(index) {
  const color = recentColors[index];
  if (!color) return;

  const rgb = hexToRgb(color.hex);
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);

  picker.h = hsv.h;
  picker.s = hsv.s;
  picker.v = hsv.v;
  picker.a = color.alpha;

  updatePicker();
}

function openPicker(hex, opacity, cb) {
  picker.cb = cb;
  const rgb = hexToRgb(hex);
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  picker.h = hsv.h;
  picker.s = hsv.s;
  picker.v = hsv.v;
  picker.a = opacity;

  pickerDragging = false;

  updatePicker();
  renderRecentColors();

  const overlay = document.getElementById("pickerOverlay");
  if (overlay) overlay.classList.add("show");
}

function closePicker() {
  const rgb = hsvToRgb(picker.h, picker.s, picker.v);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  addToRecentColors(hex, Math.round(picker.a));

  const overlay = document.getElementById("pickerOverlay");
  if (overlay) overlay.classList.remove("show");
}

function updatePicker() {
  const { h, s, v, a, fmt } = picker;
  const rgb = hsvToRgb(h, s, v);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  const sbBox = document.getElementById("sbBox");
  const sbCursor = document.getElementById("sbCursor");
  const hueThumb = document.getElementById("hueThumb");
  const alphaThumb = document.getElementById("alphaThumb");
  const alphaTrack = document.getElementById("alphaTrack");

  if (sbBox) {
    sbBox.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h}, 100%, 50%))`;
  }
  if (sbCursor) {
    sbCursor.style.cssText = `left: ${s}%; top: ${
      100 - v
    }%; background: ${hex}`;
  }
  if (hueThumb) {
    hueThumb.style.left = (h / 360) * 100 + "%";
  }
  if (alphaThumb) {
    alphaThumb.style.left = a + "%";
  }
  if (alphaTrack) {
    alphaTrack.style.setProperty("--ac", hex);
  }

  document.querySelectorAll(".format-btn").forEach((b) => {
    b.classList.toggle("selected", b.dataset.f === fmt);
  });

  const f = document.getElementById("fields");
  if (f) {
    if (fmt === "hex") {
      f.innerHTML = `
        <div class="picker-field" style="flex:2">
          <label>HEX</label>
          <input id="fHex" value="${hex}">
        </div>
        <div class="picker-field">
          <label>A</label>
          <input type="number" id="fA" min="0" max="100" value="${Math.round(
            a
          )}">
        </div>`;
    } else if (fmt === "rgb") {
      f.innerHTML = `
        <div class="picker-field"><label>R</label><input type="number" id="fR" min="0" max="255" value="${
          rgb.r
        }"></div>
        <div class="picker-field"><label>G</label><input type="number" id="fG" min="0" max="255" value="${
          rgb.g
        }"></div>
        <div class="picker-field"><label>B</label><input type="number" id="fB" min="0" max="255" value="${
          rgb.b
        }"></div>
        <div class="picker-field"><label>A</label><input type="number" id="fA" min="0" max="100" value="${Math.round(
          a
        )}"></div>`;
    } else {
      f.innerHTML = `
        <div class="picker-field"><label>H</label><input type="number" id="fH" min="0" max="360" value="${
          hsl.h
        }"></div>
        <div class="picker-field"><label>S</label><input type="number" id="fS" min="0" max="100" value="${
          hsl.s
        }"></div>
        <div class="picker-field"><label>L</label><input type="number" id="fL" min="0" max="100" value="${
          hsl.l
        }"></div>
        <div class="picker-field"><label>A</label><input type="number" id="fA" min="0" max="100" value="${Math.round(
          a
        )}"></div>`;
    }

    bindInputs();
  }

  if (picker.cb) picker.cb(hex, Math.round(a));
}

function bindInputs() {
  const fHex = document.getElementById("fHex");
  const fA = document.getElementById("fA");
  const fR = document.getElementById("fR");
  const fG = document.getElementById("fG");
  const fB = document.getElementById("fB");
  const fH = document.getElementById("fH");
  const fS = document.getElementById("fS");
  const fL = document.getElementById("fL");

  if (fHex) {
    fHex.onchange = () => {
      let v = fHex.value.trim();
      if (!v.startsWith("#")) v = "#" + v;
      if (/^#[0-9a-f]{6}$/i.test(v)) {
        const rgb = hexToRgb(v);
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        picker.h = hsv.h;
        picker.s = hsv.s;
        picker.v = hsv.v;
        updatePicker();
      }
    };
  }

  if (fA) {
    fA.oninput = () => {
      picker.a = clamp(+fA.value, 0, 100);
      updatePicker();
    };
  }

  if (fR && fG && fB) {
    [fR, fG, fB].forEach((el) => {
      el.oninput = () => {
        const hsv = rgbToHsv(
          clamp(+fR.value, 0, 255),
          clamp(+fG.value, 0, 255),
          clamp(+fB.value, 0, 255)
        );
        picker.h = hsv.h;
        picker.s = hsv.s;
        picker.v = hsv.v;
        updatePicker();
      };
    });
  }

  if (fH && fS && fL) {
    [fH, fS, fL].forEach((el) => {
      el.oninput = () => {
        const rgb = hslToRgb(
          clamp(+fH.value, 0, 360),
          clamp(+fS.value, 0, 100),
          clamp(+fL.value, 0, 100)
        );
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        picker.h = hsv.h;
        picker.s = hsv.s;
        picker.v = hsv.v;
        updatePicker();
      };
    });
  }
}

function getPickerPos(e, element) {
  if (!element) return { x: 0, y: 0, width: 1, height: 1 };

  const r = element.getBoundingClientRect();
  let clientX, clientY;

  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  return {
    x: clientX - r.left,
    y: clientY - r.top,
    width: r.width,
    height: r.height,
  };
}

function updSB(e) {
  const sbBox = document.getElementById("sbBox");
  if (!sbBox) return;

  const pos = getPickerPos(e, sbBox);
  picker.s = clamp((pos.x / pos.width) * 100, 0, 100);
  picker.v = clamp(100 - (pos.y / pos.height) * 100, 0, 100);
  updatePicker();
}

function updHue(e) {
  const hueTrack = document.getElementById("hueTrack");
  if (!hueTrack) return;

  const pos = getPickerPos(e, hueTrack);
  picker.h = clamp((pos.x / pos.width) * 360, 0, 360);
  updatePicker();
}

function updAlpha(e) {
  const alphaTrack = document.getElementById("alphaTrack");
  if (!alphaTrack) return;

  const pos = getPickerPos(e, alphaTrack);
  picker.a = clamp((pos.x / pos.width) * 100, 0, 100);
  updatePicker();
}

function initPickerEvents() {
  const sbBox = document.getElementById("sbBox");
  const hueTrack = document.getElementById("hueTrack");
  const alphaTrack = document.getElementById("alphaTrack");
  const pickerClose = document.getElementById("pickerClose");
  const pickerOverlay = document.getElementById("pickerOverlay");
  const pickerModal = document.querySelector(".picker-modal");

  if (sbBox) {
    sbBox.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      sbDrag = true;
      pickerDragging = true;
      updSB(e);
    });
    sbBox.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        sbDrag = true;
        pickerDragging = true;
        updSB(e);
      },
      { passive: false }
    );
  }

  if (hueTrack) {
    hueTrack.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      hueDrag = true;
      pickerDragging = true;
      updHue(e);
    });
    hueTrack.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        hueDrag = true;
        pickerDragging = true;
        updHue(e);
      },
      { passive: false }
    );
  }

  if (alphaTrack) {
    alphaTrack.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      alphaDrag = true;
      pickerDragging = true;
      updAlpha(e);
    });
    alphaTrack.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        alphaDrag = true;
        pickerDragging = true;
        updAlpha(e);
      },
      { passive: false }
    );
  }

  document.addEventListener("mousemove", (e) => {
    if (sbDrag) updSB(e);
    if (hueDrag) updHue(e);
    if (alphaDrag) updAlpha(e);
  });

  document.addEventListener(
    "touchmove",
    (e) => {
      if (sbDrag) {
        e.preventDefault();
        updSB(e);
      }
      if (hueDrag) {
        e.preventDefault();
        updHue(e);
      }
      if (alphaDrag) {
        e.preventDefault();
        updAlpha(e);
      }
    },
    { passive: false }
  );

  document.addEventListener("mouseup", () => {
    sbDrag = hueDrag = alphaDrag = false;
    setTimeout(() => {
      pickerDragging = false;
    }, 50);
  });

  document.addEventListener("touchend", () => {
    sbDrag = hueDrag = alphaDrag = false;
    setTimeout(() => {
      pickerDragging = false;
    }, 50);
  });

  document.querySelectorAll(".format-btn").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      picker.fmt = b.dataset.f;
      updatePicker();
    };
  });

  if (pickerClose) {
    pickerClose.onclick = (e) => {
      e.stopPropagation();
      closePicker();
    };
  }

  if (pickerOverlay) {
    pickerOverlay.addEventListener("click", (e) => {
      if (e.target === pickerOverlay && !pickerDragging) {
        closePicker();
      }
    });
  }

  if (pickerModal) {
    pickerModal.addEventListener("mousedown", (e) => e.stopPropagation());
    pickerModal.addEventListener("touchstart", (e) => e.stopPropagation(), {
      passive: true,
    });
  }
}

// ========== ANGLE PICKER ==========
function startAngleDrag(e, stopId) {
  e.preventDefault();
  activeAnglePicker = stopId;
  handleAngleMove(e);

  document.addEventListener("mousemove", handleAngleMove);
  document.addEventListener("mouseup", stopAngleDrag);
  document.addEventListener("touchmove", handleAngleMove, { passive: false });
  document.addEventListener("touchend", stopAngleDrag);
}

function handleAngleMove(e) {
  if (!activeAnglePicker) return;
  e.preventDefault();

  const stopId = activeAnglePicker;
  const handle = document.getElementById(`angleHandle_${stopId}`);
  const pickerEl = handle?.closest(".angle-picker");
  if (!pickerEl) return;

  const rect = pickerEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  let clientX, clientY;
  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  let angle =
    Math.atan2(clientX - centerX, centerY - clientY) * (180 / Math.PI);
  angle = Math.round((angle + 360) % 360);

  const stop = getStop(stopId);
  if (stop) {
    stop.angle = angle;
    handle.style.transform = `rotate(${angle}deg)`;
    document.getElementById(`angleCenter_${stopId}`).textContent = `${angle}°`;
    document.getElementById(`angleNum_${stopId}`).value = angle;
    draw();
    updateCSS();
  }
}

function stopAngleDrag() {
  activeAnglePicker = null;
  document.removeEventListener("mousemove", handleAngleMove);
  document.removeEventListener("mouseup", stopAngleDrag);
  document.removeEventListener("touchmove", handleAngleMove);
  document.removeEventListener("touchend", stopAngleDrag);
}

function updateAngleFromInput(stopId, value) {
  let angle = parseInt(value) || 0;
  angle = clamp(angle, 0, 360);

  const stop = getStop(stopId);
  if (stop) {
    stop.angle = angle;
    document.getElementById(
      `angleHandle_${stopId}`
    ).style.transform = `rotate(${angle}deg)`;
    document.getElementById(`angleCenter_${stopId}`).textContent = `${angle}°`;
    draw();
    updateCSS();
  }
}

function startConicAngleDrag(e, id) {
  e.preventDefault();

  function move(ev) {
    ev.preventDefault();
    const center = document.querySelector(`#conicAngleCenter_${id}`);
    const handle = document.querySelector(`#conicAngleHandle_${id}`);
    if (!center || !handle) return;

    const rect = center.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let clientX, clientY;
    if (ev.touches && ev.touches.length > 0) {
      clientX = ev.touches[0].clientX;
      clientY = ev.touches[0].clientY;
    } else {
      clientX = ev.clientX;
      clientY = ev.clientY;
    }

    let ang = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
    ang = (ang + 360) % 360;

    const stop = getStop(id);
    if (stop) {
      stop.startAngle = Math.round(ang);
      handle.style.transform = `rotate(${ang}deg)`;
      center.textContent = stop.startAngle + "°";
      document.getElementById(`conicAngleNum_${id}`).value = stop.startAngle;
      draw();
      updateCSS();
    }
  }

  function up() {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    document.removeEventListener("touchmove", move);
    document.removeEventListener("touchend", up);
  }

  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
  document.addEventListener("touchmove", move, { passive: false });
  document.addEventListener("touchend", up);
}

function updateConicAngleFromInput(id, val) {
  val = clamp(+val, 0, 360);
  const stop = getStop(id);
  if (stop) {
    stop.startAngle = val;
    document.getElementById(
      `conicAngleHandle_${id}`
    ).style.transform = `rotate(${val}deg)`;
    document.getElementById(`conicAngleCenter_${id}`).textContent = val + "°";
    draw();
    updateCSS();
  }
}

// ========== UI FUNCTIONS ==========
function refresh() {
  resize();
  draw();
  renderList();
  renderInspector();
  updateCSS();
  updateBgPreview();
}

function updateBgPreview() {
  const el = document.getElementById("bgPreview");
  if (el) el.style.background = rgba(state.bgColor, state.bgAlpha / 100);
}

// ========== getGradPreview ==========
function getGradPreview(s) {
  if (s.type === "radial") {
    const solidEnd = 1 - (s.feather || 60) / 100;
    const color = rgba(s.color, s.opacity / 100);
    const transparent = rgba(s.color, 0);
    
    // اگر feather وجود داره، رنگ تا یک نقطه solid باشه و بعد fade کنه
    if (solidEnd > 0 && solidEnd < 1) {
      return `radial-gradient(circle at center, ${color} 0%, ${color} ${Math.round(solidEnd * 100)}%, ${transparent} 100%)`;
    }
    // اگر feather کامل هست (100%)، مستقیم fade کن
    return `radial-gradient(circle at center, ${color} 0%, ${transparent} 100%)`;
  }
  
  if (s.type === "conic") {
    // چک کردن وجود stops
    if (!s.stops || s.stops.length === 0) {
      return `conic-gradient(from ${s.startAngle || 0}deg at center, #ff0066 0%, #00ff88 100%)`;
    }
    
    // مرتب‌سازی stops
    const sortedStops = [...s.stops].sort((a, b) => a.pos - b.pos);
    const stopsStr = sortedStops
      .map(c => `${rgba(c.color, c.opacity / 100)} ${c.pos}%`)
      .join(", ");
    
    return `conic-gradient(from ${s.startAngle || 0}deg at center, ${stopsStr})`;
  }
  
  // linear
  if (!s.stops || s.stops.length === 0) {
    return `linear-gradient(${s.angle || 0}deg, #ff0066 0%, #00ff88 100%)`;
  }
  
  const sortedStops = [...s.stops].sort((a, b) => a.pos - b.pos);
  const stopsStr = sortedStops
    .map(c => `${rgba(c.color, c.opacity / 100)} ${c.pos}%`)
    .join(", ");
  
  return `linear-gradient(${s.angle || 0}deg, ${stopsStr})`;
}

// ========== LIVE UPDATE STOP ITEMS ==========

// به‌روزرسانی یک stop-item خاص بدون re-render کل لیست
function updateStopItem(stopId) {
  const s = getStop(stopId);
  if (!s) return;

  const item = document.querySelector(`.stop-item[data-id="${stopId}"]`);
  if (!item) return;

  // به‌روزرسانی preview
  const previewInner = item.querySelector('.stop-preview-inner');
  if (previewInner) {
    previewInner.style.background = getGradPreview(s);
  }

  // به‌روزرسانی meta info
  const meta = item.querySelector('.stop-meta');
  if (meta) {
    meta.textContent = `${s.type} · ${
      s.type === "radial"
        ? Math.round(s.size) + "px"
        : s.type === "conic"
        ? s.startAngle + "°"
        : s.angle + "°"
    }`;
  }

  // به‌روزرسانی name
  const name = item.querySelector('.stop-name');
  if (name && name.textContent !== s.name) {
    name.textContent = s.name;
  }

  // به‌روزرسانی visibility icon
  const visBtn = item.querySelector('.control-btn img[alt="eye"], .control-btn img[alt="eye-close"]');
  if (visBtn) {
    visBtn.src = s.visible ? './icon/eye.svg' : './icon/eye-close.svg';
    visBtn.alt = s.visible ? 'eye' : 'eye-close';
  }
}

// به‌روزرسانی همه stop-items
function updateAllStopItems() {
  state.stops.forEach(s => updateStopItem(s.id));
}

// ========== به‌روزرسانی renderList با data-id ==========
function renderList() {
  const el = document.getElementById("list");
  if (!state.stops.length) {
    el.innerHTML = '<div class="empty-msg">Add a layer</div>';
    return;
  }

  el.innerHTML = state.stops
    .map(
      (s) => `
    <div class="stop-item ${state.selected === s.id ? "selected" : ""} ${!s.visible ? "hidden" : ""}" 
         data-id="${s.id}"
         onclick="state.selected='${s.id}';refresh()">
      <div class="stop-header">
        <div class="stop-preview">
          <div class="stop-preview-inner" style="background:${getGradPreview(s)}"></div>
        </div>
        <div class="stop-info">
          <div class="stop-name">${s.name}</div>
          <div class="stop-meta">${s.type} · ${
        s.type === "radial"
          ? Math.round(s.size) + "px"
          : s.type === "conic"
          ? s.startAngle + "°"
          : s.angle + "°"
      }</div>
        </div>
        <div class="stop-actions">
          <button class="control-btn" onclick="event.stopPropagation();toggleVis('${s.id}')">
            ${s.visible
              ? '<img src="./icon/eye.svg" alt="eye">'
              : '<img src="./icon/eye-close.svg" alt="eye-close">'
            }
          </button>
          <button class="control-btn" onclick="event.stopPropagation();dupStop('${s.id}')">
            <img src="./icon/copy.svg" alt="copy">
          </button>
          <button class="control-btn" onclick="event.stopPropagation();delStop('${s.id}')">
            <img src="./icon/close.svg" alt="close">
          </button>
        </div>
      </div>
    </div>
  `
    )
    .join("");
}

// ========== تابع یکپارچه برای به‌روزرسانی همه چیز ==========
function liveUpdate(stopId = null) {
  draw();
  updateCSS();
  
  if (stopId) {
    updateStopItem(stopId);
    updateInspectorPreview(stopId);
  } else if (state.selected) {
    updateStopItem(state.selected);
    updateInspectorPreview(state.selected);
  }
}

// به‌روزرسانی preview در inspector
function updateInspectorPreview(stopId) {
  const s = getStop(stopId);
  if (!s) return;

  // برای radial
  if (s.type === "radial") {
    const container = document.querySelector(`[data-stop-id="${stopId}"]`);
    if (container) {
      const swatch = container.querySelector('.color-swatch-inner');
      if (swatch) {
        swatch.style.background = rgba(s.color, s.opacity / 100);
      }
    }
  }

  // برای color stops در linear/conic
  s.stops?.forEach((cs, i) => {
    const row = document.querySelector(`[data-stop-id="${stopId}"][data-color-stop="${i}"]`);
    if (row) {
      const swatch = row.querySelector('.color-swatch-inner');
      if (swatch) {
        swatch.style.background = rgba(cs.color, cs.opacity / 100);
      }
    }
  });
}

// ========== به‌روزرسانی توابع موجود ==========

function updateStopOpacity(stopId, value) {
  const s = getStop(stopId);
  if (!s) return;
  
  s.opacity = clamp(+value, 0, 100);
  liveUpdate(stopId);
}

function updateColorStopOpacity(stopId, index, value) {
  const s = getStop(stopId);
  if (!s || !s.stops[index]) return;
  
  s.stops[index].opacity = clamp(+value, 0, 100);
  liveUpdate(stopId);
}

function updateAngleFromInput(stopId, value) {
  let angle = parseInt(value) || 0;
  angle = clamp(angle, 0, 360);

  const stop = getStop(stopId);
  if (stop) {
    stop.angle = angle;
    document.getElementById(`angleHandle_${stopId}`).style.transform = `rotate(${angle}deg)`;
    document.getElementById(`angleCenter_${stopId}`).textContent = `${angle}°`;
    liveUpdate(stopId);
  }
}

function updateConicAngleFromInput(id, val) {
  val = clamp(+val, 0, 360);
  const stop = getStop(id);
  if (stop) {
    stop.startAngle = val;
    document.getElementById(`conicAngleHandle_${id}`).style.transform = `rotate(${val}deg)`;
    document.getElementById(`conicAngleCenter_${id}`).textContent = val + "°";
    liveUpdate(id);
  }
}

// ========== به‌روزرسانی renderInspector ==========
function renderInspector() {
  const el = document.getElementById("inspector");
  const s = getStop(state.selected);
  if (!s) {
    el.innerHTML = '<div class="empty-msg">Select a layer</div>';
    return;
  }

  let h = `
    <div class="form-group">
      <div class="form-group-title">General</div>
      <div class="form-row">
        <label>Name</label>
        <input class="num-input" style="width:100%;text-align:left" value="${s.name}" 
          onchange="getStop('${s.id}').name=this.value;liveUpdate('${s.id}')">
      </div>
      <div class="form-row">
        <label>X</label>
        <input type="number" class="num-input" min="0" max="100" value="${Math.round(s.x * 100)}" 
          oninput="getStop('${s.id}').x = +this.value / 100; liveUpdate('${s.id}')">
      </div>
      <div class="form-row">
        <label>Y</label>
        <input type="number" class="num-input" min="0" max="100" value="${Math.round(s.y * 100)}" 
          oninput="getStop('${s.id}').y = +this.value / 100; liveUpdate('${s.id}')"
          ${state.lockVertical ? "disabled" : ""}>
        ${state.lockVertical ? '<span style="font-size:9px;color:#666;"><img class="pos-lock" src="./icon/lock.svg" alt="lock position"></span>' : ""}
      </div>
    </div>
  `;

  if (s.type === "radial") {
    h += `
      <div class="form-group" data-stop-id="${s.id}">
        <div class="form-group-title">Radial</div>
        <div class="form-row">
          <div class="color-swatch" onclick="openStopColorPicker('${s.id}')">
            <div class="color-swatch-inner" style="background:${rgba(s.color, s.opacity / 100)}"></div>
          </div>
        </div>
        <div class="form-row">
          <label>Size</label>
          <input type="number" class="num-input" min="10" value="${Math.round(s.size)}" 
            oninput="getStop('${s.id}').size=+this.value;liveUpdate('${s.id}')">
        </div>
        <div class="form-row">
          <label>Feather</label>
          <input type="number" class="num-input" min="1" max="100" value="${Math.round(s.feather)}" 
            oninput="getStop('${s.id}').feather=+this.value;liveUpdate('${s.id}')">
        </div>
        <div class="form-row">
          <label>Opacity</label>
          <input type="number" class="num-input" id="opacity_${s.id}" min="0" max="100" value="${Math.round(s.opacity)}" 
            oninput="updateStopOpacity('${s.id}', this.value)">
        </div>
      </div>
    `;
  }

  if (s.type === "linear") {
    h += `
      <div class="form-group">
        <div class="form-group-title">Angle</div>
        <div class="form-row" style="align-items: center; gap: 15px;">
          <div class="angle-picker" onmousedown="startAngleDrag(event, '${s.id}')" ontouchstart="startAngleDrag(event, '${s.id}')">
            <div class="angle-dial">
              <div class="angle-handle" id="angleHandle_${s.id}" style="transform: rotate(${s.angle}deg)">
                <div class="handle-dot"></div>
              </div>
              <div class="angle-center" id="angleCenter_${s.id}">${s.angle}°</div>
            </div>
          </div>
          <input type="number" id="angleNum_${s.id}" class="num-input" min="0" max="360" value="${s.angle}" 
            oninput="updateAngleFromInput('${s.id}', this.value)" style="width:55px">
        </div>
      </div>
    `;
  }

  if (s.type === "conic") {
    h += `
      <div class="form-group">
        <div class="form-group-title">Angle</div>
        <div class="form-row" style="align-items: center; gap: 15px;">
          <div class="angle-picker" onmousedown="startConicAngleDrag(event, '${s.id}')" ontouchstart="startConicAngleDrag(event, '${s.id}')">
            <div class="angle-dial">
              <div class="angle-handle" id="conicAngleHandle_${s.id}" style="transform: rotate(${s.startAngle}deg)">
                <div class="handle-dot"></div>
              </div>
              <div class="angle-center" id="conicAngleCenter_${s.id}">${s.startAngle}°</div>
            </div>
          </div>
          <input type="number" id="conicAngleNum_${s.id}" class="num-input" min="0" max="360" value="${s.startAngle}" 
            oninput="updateConicAngleFromInput('${s.id}', this.value)" style="width:55px">
        </div>
      </div>
    `;
  }

  if (s.type === "linear" || s.type === "conic") {
    h += `
      <div class="form-group">
        <div class="form-group-title">
          <span>Color Stops</span>
          <button class="sm" onclick="addColorStop(getStop('${s.id}'))">Add Color</button>
        </div>
        ${s.stops.map((cs, i) => `
          <div class="color-stop-row" data-stop-id="${s.id}" data-color-stop="${i}">
            <div class="color-stop-header">
              <div class="color-swatch" onclick="openStopColorPicker('${s.id}', true, ${i})">
                <div class="color-swatch-inner" style="background:${rgba(cs.color, cs.opacity / 100)}"></div>
              </div>
              <span style="flex:1;font-size:10px">Stop ${i + 1}</span>
            </div>
            <div class="color-stop-fields">
              <div class="field-group">
                <label>Position</label>
                <input type="number" class="num-input" min="0" max="100" value="${cs.pos}" 
                  oninput="getStop('${s.id}').stops[${i}].pos=+this.value;liveUpdate('${s.id}')">
              </div>
              <div class="field-group">
                <label>Opacity</label>
                <input type="number" class="num-input" min="0" max="100" value="${cs.opacity}" 
                  oninput="updateColorStopOpacity('${s.id}', ${i}, this.value)">
              </div>
            </div>
            ${s.stops.length > 2 ? `<button class="control-btn" onclick="delColorStop(getStop('${s.id}'),${i})"><img src="./icon/close.svg" alt="delete color"></button>` : ""}
          </div>
        `).join("")}
      </div>
    `;
  }

  el.innerHTML = h;
}

// ========== به‌روزرسانی onPointerMove برای canvas drag ==========
function onPointerMove(e) {
  if (!drag) return;
  e.preventDefault();

  const pos = getEventPos(e);
  const mx = pos.x;
  const my = pos.y;
  const cx = drag.s.x * W;
  const cy = drag.s.y * H;

  switch (drag.t) {
    case "move":
      drag.s.x = clamp(mx / W, 0, 1);
      if (!state.lockVertical) {
        drag.s.y = clamp(my / H, 0, 1);
      }
      break;

    case "cs":
      const { x1, y1, x2, y2 } = drag;
      const dx = x2 - x1, dy = y2 - y1;
      const len2 = dx * dx + dy * dy;
      const t = clamp(((mx - x1) * dx + (my - y1) * dy) / len2, 0, 1);
      drag.s.stops[drag.i].pos = Math.round(t * 100);
      break;

    case "angle":
      let newAngle = (Math.atan2(my - cy, mx - cx) * 180) / Math.PI + 90;
      if (newAngle < 0) newAngle += 360;
      drag.s.angle = Math.round(newAngle) % 360;
      break;

    case "conic-angle":
      let conicAngle = (Math.atan2(my - cy, mx - cx) * 180) / Math.PI + 90;
      if (conicAngle < 0) conicAngle += 360;
      drag.s.startAngle = Math.round(conicAngle) % 360;
      break;

    case "conic-cs":
      const startAngleRad = ((drag.s.startAngle - 90) * Math.PI) / 180;
      let relAngle = Math.atan2(my - cy, mx - cx) - startAngleRad;
      if (relAngle < 0) relAngle += Math.PI * 2;
      drag.s.stops[drag.i].pos = clamp(Math.round((relAngle / (Math.PI * 2)) * 100), 0, 100);
      break;
  }

  throttledDraw();
  updateStopItem(drag.s.id);
}

// ========== به‌روزرسانی angle drag ==========
function handleAngleMove(e) {
  if (!activeAnglePicker) return;
  e.preventDefault();

  const stopId = activeAnglePicker;
  const handle = document.getElementById(`angleHandle_${stopId}`);
  const pickerEl = handle?.closest(".angle-picker");
  if (!pickerEl) return;

  const rect = pickerEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  let clientX, clientY;
  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  let angle = Math.atan2(clientX - centerX, centerY - clientY) * (180 / Math.PI);
  angle = Math.round((angle + 360) % 360);

  const stop = getStop(stopId);
  if (stop) {
    stop.angle = angle;
    handle.style.transform = `rotate(${angle}deg)`;
    document.getElementById(`angleCenter_${stopId}`).textContent = `${angle}°`;
    document.getElementById(`angleNum_${stopId}`).value = angle;
    
    draw();
    updateCSS();
    updateStopItem(stopId);
  }
}

// ==========conic angle drag ==========
function startConicAngleDrag(e, id) {
  e.preventDefault();

  function move(ev) {
    ev.preventDefault();
    const center = document.querySelector(`#conicAngleCenter_${id}`);
    const handle = document.querySelector(`#conicAngleHandle_${id}`);
    if (!center || !handle) return;

    const rect = center.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let clientX, clientY;
    if (ev.touches && ev.touches.length > 0) {
      clientX = ev.touches[0].clientX;
      clientY = ev.touches[0].clientY;
    } else {
      clientX = ev.clientX;
      clientY = ev.clientY;
    }

    let ang = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
    ang = (ang + 360) % 360;

    const stop = getStop(id);
    if (stop) {
      stop.startAngle = Math.round(ang);
      handle.style.transform = `rotate(${ang}deg)`;
      center.textContent = stop.startAngle + "°";
      document.getElementById(`conicAngleNum_${id}`).value = stop.startAngle;
      
      draw();
      updateCSS();
      updateStopItem(id);
    }
  }

  function up() {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    document.removeEventListener("touchmove", move);
    document.removeEventListener("touchend", up);
  }

  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
  document.addEventListener("touchmove", move, { passive: false });
  document.addEventListener("touchend", up);
}

// ========== picker callback ==========
function openStopColorPicker(stopId, isColorStop = false, colorStopIndex = 0) {
  const s = getStop(stopId);
  if (!s) return;

  if (isColorStop) {
    const cs = s.stops[colorStopIndex];
    if (!cs) return;
    openPicker(cs.color, cs.opacity, (c, a) => {
      const stop = getStop(stopId);
      if (stop && stop.stops[colorStopIndex]) {
        stop.stops[colorStopIndex].color = c;
        stop.stops[colorStopIndex].opacity = a;
        liveUpdate(stopId);
      }
    });
  } else {
    openPicker(s.color, s.opacity, (c, a) => {
      const stop = getStop(stopId);
      if (stop) {
        stop.color = c;
        stop.opacity = a;
        liveUpdate(stopId);
      }
    });
  }
}

// ========== GLOBALS ==========
window.liveUpdate = liveUpdate;
window.updateStopItem = updateStopItem;
window.updateAllStopItems = updateAllStopItems;
window.openStopColorPicker = openStopColorPicker;
window.updateStopOpacity = updateStopOpacity;
window.updateColorStopOpacity = updateColorStopOpacity;

// ========== CSS OUTPUT ==========
function updateCSS() {
  const fmt = state.cssFormat;
  const vis = state.stops.filter((s) => s.visible);
  const bgColorFmt = formatColor(state.bgColor, state.bgAlpha, fmt);

  // ========== 1. Gradient CSS ==========
  let gradientLines = [];
  
  if (!vis.length) {
    gradientLines.push(`background: ${bgColorFmt};`);
  } else {
    const grads = vis.map((s) => {
      if (s.type === "radial") {
        const x = (s.x * 100).toFixed(0);
        const y = (s.y * 100).toFixed(0);
        const size = Math.round(s.size);
        const feather = (s.feather || 60) / 100;
        const solidStop = Math.round((1 - feather) * 100);
        const colorFmt = formatColor(s.color, s.opacity, fmt);
        const transFmt = formatColor(s.color, 0, fmt);

        if (solidStop > 0 && solidStop < 100) {
          return `radial-gradient(${size}px ${size}px at ${x}% ${y}%, ${colorFmt} 0%, ${colorFmt} ${solidStop}%, ${transFmt} 100%)`;
        }
        return `radial-gradient(${size}px ${size}px at ${x}% ${y}%, ${colorFmt} 0%, ${transFmt} 100%)`;
      } else if (s.type === "linear") {
        const sorted = [...s.stops].sort((a, b) => a.pos - b.pos);
        const cs = sorted
          .map((c) => `${formatColor(c.color, c.opacity, fmt)} ${c.pos}%`)
          .join(", ");
        return `linear-gradient(${s.angle}deg, ${cs})`;
      } else if (s.type === "conic") {
        const x = (s.x * 100).toFixed(0);
        const y = (s.y * 100).toFixed(0);
        const sorted = [...s.stops].sort((a, b) => a.pos - b.pos);
        const cs = sorted
          .map((c) => `${formatColor(c.color, c.opacity, fmt)} ${c.pos}%`)
          .join(", ");
        return `conic-gradient(from ${s.startAngle}deg at ${x}% ${y}%, ${cs})`;
      }
    });

    gradientLines.push(`position: relative;`);
    gradientLines.push(`background-color: ${bgColorFmt};`);
    gradientLines.push(`background-image:`);
    gradientLines.push(`  ${grads.join(",\n  ")};`);
    gradientLines.push(`background-blend-mode: screen;`);
  }

  // ✅ اضافه کردن فیلتر به گرادینت CSS
  const hasFilters = hasActiveFilters();
  if (hasFilters) {
    const filterString = getFilterString();
    gradientLines.push(`filter: ${filterString};`);
  }

  currentGradientCSS = gradientLines.join('\n');

  // ========== 2. Filter CSS (جداگانه برای کپی) ==========
  if (hasFilters) {
    currentFilterCSS = `filter: ${getFilterString()};`;
  } else {
    currentFilterCSS = "";
  }

  // ========== 3. Noise CSS ==========
  const hasNoise = noiseState.enabled && noiseState.opacity > 0;
  
  if (hasNoise) {
    currentNoiseCSS = `/* Noise overlay - add as ::after pseudo-element */
.gradient::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: ${(noiseState.opacity / 100).toFixed(2)};
  filter: url(#noiseFilter);
  mix-blend-mode: ${noiseState.blend};
}`;

    currentSVGFilter = `<svg width="0" height="0">
  <filter id="noiseFilter">
    <feTurbulence type="fractalNoise" baseFrequency="${noiseState.frequency}" numOctaves="4" stitchTiles="stitch" result="noise"/>
    <feColorMatrix type="saturate" values="0" in="noise" result="bwNoise"/>
    <feBlend in="SourceGraphic" in2="bwNoise" mode="${noiseState.blend}"/>
  </filter>
</svg>`;
  } else {
    currentNoiseCSS = "";
    currentSVGFilter = "";
  }

  // نمایش/مخفی کردن بلوک‌ها
  const noiseBlock = document.getElementById('noiseOutputBlock');
  const svgBlock = document.getElementById('svgOutputBlock');
  
  if (noiseBlock) noiseBlock.style.display = hasNoise ? 'block' : 'none';
  if (svgBlock) svgBlock.style.display = hasNoise ? 'block' : 'none';

  // ========== Render ==========
  renderIframe('cssGradient', currentGradientCSS);
  if (hasNoise) {
    renderIframe('cssNoise', currentNoiseCSS);
    renderIframe('cssSVG', currentSVGFilter, true);
  }
}

function renderIframe(id, content, isSVG = false) {
  const iframe = document.getElementById(id);
  if (!iframe) return;

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  
  let displayContent = content;
  if (isSVG) {
    displayContent = content
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{
  background:none;
  color:#b8c4ce;
  font-family:'Fira Code',monospace;
  font-size:11px;
  line-height:1.6;
  padding:10px;
  white-space:pre-wrap;
  word-break:break-word;
}
.p{color:#7dd3fc}
.f{color:#ff79c6}
.v{color:#86efac}
.n{color:#fdba74}
.c{color:#6b7280}
.t{color:#fbbf24}
.s{color:#a78bfa}
</style>
</head>
<body>${highlightCSS(displayContent, isSVG)}</body>
</html>`);
  doc.close();
}

function highlightCSS(css, isSVG = false) {
  let result = css;
  
  if (isSVG) {
    result = result
      .replace(/(&lt;\/?[\w-]+)/g, '<span class="t">$1</span>')
      .replace(/(\/&gt;|&gt;)/g, '<span class="t">$1</span>')
      .replace(/(\w+)=/g, '<span class="s">$1</span>=')
      .replace(/"([^"]+)"/g, '"<span class="v">$1</span>"');
  } else {
    result = result
      .replace(/(\.[\w-]+)\s*\{/g, '<span class="s">$1</span> {')
      .replace(/(background(?:-color|-image|-blend-mode)?|position|top|left|width|height|opacity|filter|pointer-events|mix-blend-mode)\s*:/g, '<span class="p">$1</span>:')
      .replace(/(radial-gradient|linear-gradient|conic-gradient|url)/g, '<span class="f">$1</span>')
      .replace(/:\s*(absolute|none|screen|overlay|soft-light|hard-light|multiply)/g, ': <span class="v">$1</span>')
      .replace(/(\d+\.?\d*)(px|%|deg)?/g, '<span class="n">$1</span>$2')
      .replace(/(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8})/g, '<span class="v">$1</span>');
  }
  
  return result;
}

// ========== COPY FUNCTIONS ==========
function copyCSS() {
  let allCSS = currentGradientCSS;
  
  if (currentFilterCSS) {
    allCSS += '\n\n/* Filters */\n' + currentFilterCSS;
  }
  
  if (currentNoiseCSS) {
    allCSS += '\n\n/* Noise Overlay */\n' + currentNoiseCSS;
  }
  
  if (currentSVGFilter) {
    allCSS += '\n\n/* SVG Filter (add to HTML) */\n' + currentSVGFilter;
  }
  
  copyToClipboard(allCSS, document.getElementById("copyBtn"));
}

function copyFilterCSS() {
  copyToClipboard(currentFilterCSS);
}

// Global
window.copyFilterCSS = copyFilterCSS;
function copyGradientCSS() {
  copyToClipboard(currentGradientCSS);
}

function copyNoiseCSS() {
  copyToClipboard(currentNoiseCSS);
}

function copySVGFilter() {
  copyToClipboard(currentSVGFilter);
}

function copyToClipboard(text, btn = null) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      btn.classList.add("copied");
      const originalHTML = btn.innerHTML;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="#4ade80" width="14" height="14">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg><span>Copied!</span>`;
      setTimeout(() => {
        btn.classList.remove("copied");
        btn.innerHTML = originalHTML;
      }, 2000);
    }
  });
}



// ========== EXPORT ==========
document.getElementById("exportSelect")?.addEventListener("change", function (e) {
  const format = e.target.value;
  if (!format) return;
  
  if (format === 'svg') {
    exportAsSVG();
  } else {
    exportAsImage(format);
  }
  this.value = "";
});

async function exportAsImage(format = "png", quality = 0.92) {
  const width = state.canvasWidth;
  const height = state.canvasHeight;

  // Canvas اصلی برای گرادینت‌ها
  const exportCanvas = document.createElement("canvas");
  const exportCtx = exportCanvas.getContext("2d", { willReadFrequently: true });

  exportCanvas.width = width;
  exportCanvas.height = height;

  // ========== 1. رسم پس‌زمینه ==========
  exportCtx.fillStyle = rgba(state.bgColor, state.bgAlpha / 100);
  exportCtx.fillRect(0, 0, width, height);

  // ========== 2. رسم گرادینت‌ها ==========
  exportCtx.globalCompositeOperation = "screen";

  state.stops
    .filter((s) => s.visible)
    .forEach((s) => {
      const cx = s.x * width;
      const cy = s.y * height;

      if (s.type === "radial") {
        const solidEnd = 1 - s.feather / 100;
        const grad = exportCtx.createRadialGradient(cx, cy, 0, cx, cy, s.size);
        const col = rgba(s.color, s.opacity / 100);

        grad.addColorStop(0, col);
        if (solidEnd > 0 && solidEnd < 1) grad.addColorStop(solidEnd, col);
        grad.addColorStop(1, rgba(s.color, 0));

        exportCtx.fillStyle = grad;
        exportCtx.beginPath();
        exportCtx.arc(cx, cy, s.size, 0, Math.PI * 2);
        exportCtx.fill();
      } else if (s.type === "linear") {
        const a = ((s.angle - 90) * Math.PI) / 180;
        const d = Math.hypot(width, height);
        const mx = width / 2, my = height / 2;
        const dx = (Math.cos(a) * d) / 2;
        const dy = (Math.sin(a) * d) / 2;

        const grad = exportCtx.createLinearGradient(mx - dx, my - dy, mx + dx, my + dy);
        [...s.stops]
          .sort((a, b) => a.pos - b.pos)
          .forEach((cs) => {
            grad.addColorStop(cs.pos / 100, rgba(cs.color, cs.opacity / 100));
          });

        exportCtx.fillStyle = grad;
        exportCtx.fillRect(0, 0, width, height);
      } else if (s.type === "conic") {
        const start = ((s.startAngle - 90) * Math.PI) / 180;
        const grad = exportCtx.createConicGradient(start, cx, cy);
        [...s.stops]
          .sort((a, b) => a.pos - b.pos)
          .forEach((cs) => {
            grad.addColorStop(cs.pos / 100, rgba(cs.color, cs.opacity / 100));
          });

        exportCtx.fillStyle = grad;
        exportCtx.fillRect(0, 0, width, height);
      }
    });

  exportCtx.globalCompositeOperation = "source-over";

  // ========== 3. اعمال فیلترها (دستی) ==========
  if (hasActiveFilters()) {
    // اول blur رو با ctx.filter اعمال کن (چون blur پیکسلی سنگینه)
    if (filterState.blur > 0) {
      applyBlur(exportCtx, width, height, filterState.blur);
    }
    
    // بقیه فیلترها رو روی پیکسل‌ها اعمال کن
    if (hasNonBlurFilters()) {
      const imageData = exportCtx.getImageData(0, 0, width, height);
      applyFiltersToImageData(imageData);
      exportCtx.putImageData(imageData, 0, 0);
    }
  }

  // ========== 4. نویز ==========
  if (noiseState.enabled && noiseState.opacity > 0) {
    const noiseCanvas = await generateSVGNoise(width, height, noiseState.frequency);
    if (noiseCanvas) {
      exportCtx.globalCompositeOperation = noiseState.blend;
      exportCtx.globalAlpha = noiseState.opacity / 100;
      exportCtx.drawImage(noiseCanvas, 0, 0, width, height);
      exportCtx.globalAlpha = 1;
      exportCtx.globalCompositeOperation = "source-over";
    }
  }

  // ========== 5. خروجی ==========
  const mime = format === "jpg" ? "image/jpeg" : "image/png";
  const filename = `gradient-${width}x${height}.${format}`;

  exportCanvas.toBlob(
    (blob) => {
      if (!blob) {
        console.error("Failed to create image blob");
        alert("خطا در ایجاد تصویر");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    mime,
    quality
  );
}

// چک کردن فیلترهای غیر از blur
function hasNonBlurFilters() {
  return filterState.enabled && (
    filterState.brightness !== 100 ||
    filterState.contrast !== 100 ||
    filterState.saturate !== 100 ||
    filterState.hue !== 0 ||
    filterState.grayscale > 0 ||
    filterState.sepia > 0 ||
    filterState.invert > 0
  );
}

function exportAsSVG() {
  const width = state.canvasWidth;
  const height = state.canvasHeight;
  const visibleStops = state.stops.filter((s) => s.visible);

  let defs = "";
  let content = "";

  // فیلتر SVG برای CSS filters
  const filterString = getFilterString();
  if (filterString) {
    // تبدیل CSS filter به SVG filter
    defs += generateSVGFilterFromCSS();
  }

  // نویز
  if (noiseState.enabled && noiseState.opacity > 0) {
    defs += `
    <filter id="noiseFilter" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="${noiseState.frequency}" numOctaves="4" stitchTiles="stitch" result="noise"/>
      <feColorMatrix type="saturate" values="0" in="noise" result="bwNoise"/>
      <feBlend in="SourceGraphic" in2="bwNoise" mode="${noiseState.blend}"/>
    </filter>`;
  }

  const bg = hexToRgb(state.bgColor);
  content += `  <rect width="100%" height="100%" fill="rgba(${bg.r},${bg.g},${bg.b},${state.bgAlpha / 100})"/>\n`;

  // اعمال فیلتر روی گروه گرادینت‌ها
  const filterAttr = hasActiveFilters() ? ' filter="url(#cssFilter)"' : '';
  content += `  <g style="mix-blend-mode:screen"${filterAttr}>\n`;

  visibleStops.forEach((s, i) => {
    const id = `g${i}`;

    if (s.type === "radial") {
      const rgb = hexToRgb(s.color);
      const solidEnd = 1 - s.feather / 100;

      defs += `
    <radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${s.x * width}" cy="${s.y * height}" r="${s.size}">
      <stop offset="0%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="${s.opacity / 100}"/>
      ${solidEnd > 0 && solidEnd < 1 ? `<stop offset="${(solidEnd * 100).toFixed(0)}%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="${s.opacity / 100}"/>` : ""}
      <stop offset="100%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="0"/>
    </radialGradient>`;

      content += `    <circle cx="${s.x * width}" cy="${s.y * height}" r="${s.size}" fill="url(#${id})"/>\n`;
    }

    else if (s.type === "linear") {
      const a = ((s.angle - 90) * Math.PI) / 180;
      const x1 = 50 - Math.cos(a) * 50;
      const y1 = 50 - Math.sin(a) * 50;
      const x2 = 50 + Math.cos(a) * 50;
      const y2 = 50 + Math.sin(a) * 50;

      defs += `
    <linearGradient id="${id}" x1="${x1.toFixed(1)}%" y1="${y1.toFixed(1)}%" x2="${x2.toFixed(1)}%" y2="${y2.toFixed(1)}%">`;
      [...s.stops]
        .sort((a, b) => a.pos - b.pos)
        .forEach((cs) => {
          const c = hexToRgb(cs.color);
          defs += `
      <stop offset="${cs.pos}%" stop-color="rgb(${c.r},${c.g},${c.b})" stop-opacity="${cs.opacity / 100}"/>`;
        });
      defs += `
    </linearGradient>`;

      content += `    <rect width="100%" height="100%" fill="url(#${id})"/>\n`;
    }

    else if (s.type === "conic") {
      const x = (s.x * 100).toFixed(2);
      const y = (s.y * 100).toFixed(2);

      const stops = [...s.stops]
        .sort((a, b) => a.pos - b.pos)
        .map((cs) => {
          const c = hexToRgb(cs.color);
          return `rgba(${c.r},${c.g},${c.b},${cs.opacity / 100}) ${cs.pos}%`;
        })
        .join(", ");

      content += `    <foreignObject width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;background:conic-gradient(from ${s.startAngle}deg at ${x}% ${y}%, ${stops});"></div>
    </foreignObject>\n`;
    }
  });

  content += `  </g>\n`;

  // نویز
  if (noiseState.enabled && noiseState.opacity > 0) {
    content += `  <rect width="100%" height="100%" fill="white" filter="url(#noiseFilter)" opacity="${(noiseState.opacity / 100).toFixed(2)}" style="mix-blend-mode:${noiseState.blend}"/>\n`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>${defs}
  </defs>
${content}</svg>`;

  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const filename = `gradient-${width}x${height}.svg`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// تبدیل CSS filters به SVG filter
function generateSVGFilterFromCSS() {
  if (!hasActiveFilters()) return '';
  
  let filterContent = '';
  let lastResult = 'SourceGraphic';
  let resultIndex = 0;
  
  // Brightness & Contrast با feComponentTransfer
  if (filterState.brightness !== 100 || filterState.contrast !== 100) {
    const brightness = filterState.brightness / 100;
    const contrast = filterState.contrast / 100;
    const intercept = (1 - contrast) / 2 + (brightness - 1);
    
    filterContent += `
      <feComponentTransfer in="${lastResult}" result="bc${resultIndex}">
        <feFuncR type="linear" slope="${contrast * brightness}" intercept="${intercept}"/>
        <feFuncG type="linear" slope="${contrast * brightness}" intercept="${intercept}"/>
        <feFuncB type="linear" slope="${contrast * brightness}" intercept="${intercept}"/>
      </feComponentTransfer>`;
    lastResult = `bc${resultIndex}`;
    resultIndex++;
  }
  
  // Saturate با feColorMatrix
  if (filterState.saturate !== 100) {
    filterContent += `
      <feColorMatrix type="saturate" values="${filterState.saturate / 100}" in="${lastResult}" result="sat${resultIndex}"/>`;
    lastResult = `sat${resultIndex}`;
    resultIndex++;
  }
  
  // Hue-rotate با feColorMatrix
  if (filterState.hue !== 0) {
    filterContent += `
      <feColorMatrix type="hueRotate" values="${filterState.hue}" in="${lastResult}" result="hue${resultIndex}"/>`;
    lastResult = `hue${resultIndex}`;
    resultIndex++;
  }
  
  // Grayscale
  if (filterState.grayscale > 0) {
    const g = filterState.grayscale / 100;
    const matrix = `
      ${0.2126 + 0.7874 * (1 - g)} ${0.7152 - 0.7152 * (1 - g)} ${0.0722 - 0.0722 * (1 - g)} 0 0
      ${0.2126 - 0.2126 * (1 - g)} ${0.7152 + 0.2848 * (1 - g)} ${0.0722 - 0.0722 * (1 - g)} 0 0
      ${0.2126 - 0.2126 * (1 - g)} ${0.7152 - 0.7152 * (1 - g)} ${0.0722 + 0.9278 * (1 - g)} 0 0
      0 0 0 1 0`;
    filterContent += `
      <feColorMatrix type="matrix" values="${matrix.trim()}" in="${lastResult}" result="gray${resultIndex}"/>`;
    lastResult = `gray${resultIndex}`;
    resultIndex++;
  }
  
  // Sepia
  if (filterState.sepia > 0) {
    const s = filterState.sepia / 100;
    const matrix = `
      ${0.393 + 0.607 * (1 - s)} ${0.769 - 0.769 * (1 - s)} ${0.189 - 0.189 * (1 - s)} 0 0
      ${0.349 - 0.349 * (1 - s)} ${0.686 + 0.314 * (1 - s)} ${0.168 - 0.168 * (1 - s)} 0 0
      ${0.272 - 0.272 * (1 - s)} ${0.534 - 0.534 * (1 - s)} ${0.131 + 0.869 * (1 - s)} 0 0
      0 0 0 1 0`;
    filterContent += `
      <feColorMatrix type="matrix" values="${matrix.trim()}" in="${lastResult}" result="sepia${resultIndex}"/>`;
    lastResult = `sepia${resultIndex}`;
    resultIndex++;
  }
  
  // Invert
  if (filterState.invert > 0) {
    const i = filterState.invert / 100;
    filterContent += `
      <feComponentTransfer in="${lastResult}" result="inv${resultIndex}">
        <feFuncR type="table" tableValues="${i} ${1-i}"/>
        <feFuncG type="table" tableValues="${i} ${1-i}"/>
        <feFuncB type="table" tableValues="${i} ${1-i}"/>
      </feComponentTransfer>`;
    lastResult = `inv${resultIndex}`;
    resultIndex++;
  }
  
  // Blur
  if (filterState.blur > 0) {
    filterContent += `
      <feGaussianBlur stdDeviation="${filterState.blur}" in="${lastResult}" result="blur${resultIndex}"/>`;
    lastResult = `blur${resultIndex}`;
    resultIndex++;
  }
  
  return `
    <filter id="cssFilter" x="-10%" y="-10%" width="120%" height="120%">${filterContent}
    </filter>`;
}

function exportAsSVG() {
  const width = state.canvasWidth;
  const height = state.canvasHeight;

  const visibleStops = state.stops.filter((s) => s.visible);

  let defs = "";
  let content = "";

  if (noiseState.enabled && noiseState.opacity > 0) {
    defs += `
    <filter id="noiseFilter" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="${noiseState.frequency}" numOctaves="4" stitchTiles="stitch" result="noise"/>
      <feColorMatrix type="saturate" values="0" in="noise" result="bwNoise"/>
      <feBlend in="SourceGraphic" in2="bwNoise" mode="${noiseState.blend}"/>
    </filter>`;
  }

  const bg = hexToRgb(state.bgColor);
  content += `  <rect width="100%" height="100%" fill="rgba(${bg.r},${bg.g},${bg.b},${state.bgAlpha / 100})"/>\n`;

  content += `  <g style="mix-blend-mode:screen">\n`;

  visibleStops.forEach((s, i) => {
    const id = `g${i}`;

    if (s.type === "radial") {
      const rgb = hexToRgb(s.color);
      const solidEnd = 1 - s.feather / 100;

      defs += `
    <radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${s.x * width}" cy="${s.y * height}" r="${s.size}">
      <stop offset="0%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="${s.opacity / 100}"/>
      ${solidEnd > 0 && solidEnd < 1 ? `<stop offset="${(solidEnd * 100).toFixed(0)}%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="${s.opacity / 100}"/>` : ""}
      <stop offset="100%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="0"/>
    </radialGradient>`;

      content += `    <circle cx="${s.x * width}" cy="${s.y * height}" r="${s.size}" fill="url(#${id})"/>\n`;
    }

    else if (s.type === "linear") {
      const a = ((s.angle - 90) * Math.PI) / 180;
      const x1 = 50 - Math.cos(a) * 50;
      const y1 = 50 - Math.sin(a) * 50;
      const x2 = 50 + Math.cos(a) * 50;
      const y2 = 50 + Math.sin(a) * 50;

      defs += `
    <linearGradient id="${id}" x1="${x1.toFixed(1)}%" y1="${y1.toFixed(1)}%" x2="${x2.toFixed(1)}%" y2="${y2.toFixed(1)}%">`;
      [...s.stops]
        .sort((a, b) => a.pos - b.pos)
        .forEach((cs) => {
          const c = hexToRgb(cs.color);
          defs += `
      <stop offset="${cs.pos}%" stop-color="rgb(${c.r},${c.g},${c.b})" stop-opacity="${cs.opacity / 100}"/>`;
        });
      defs += `
    </linearGradient>`;

      content += `    <rect width="100%" height="100%" fill="url(#${id})"/>\n`;
    }

    else if (s.type === "conic") {
      const x = (s.x * 100).toFixed(2);
      const y = (s.y * 100).toFixed(2);

      const stops = [...s.stops]
        .sort((a, b) => a.pos - b.pos)
        .map((cs) => {
          const c = hexToRgb(cs.color);
          return `rgba(${c.r},${c.g},${c.b},${cs.opacity / 100}) ${cs.pos}%`;
        })
        .join(", ");

      content += `    <foreignObject width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;background:conic-gradient(from ${s.startAngle}deg at ${x}% ${y}%, ${stops});"></div>
    </foreignObject>\n`;
    }
  });

  content += `  </g>\n`;

  if (noiseState.enabled && noiseState.opacity > 0) {
    content += `  <rect width="100%" height="100%" fill="white" filter="url(#noiseFilter)" opacity="${(noiseState.opacity / 100).toFixed(2)}" style="mix-blend-mode:${noiseState.blend}"/>\n`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>${defs}
  </defs>
${content}</svg>`;

  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const filename = `gradient-${width}x${height}.svg`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========== ZOOM SYSTEM ==========
function calcDynamicMinZoom() {
  const wrap = document.querySelector(".canvas-wrap");
  if (!wrap) return 10;

  const rect = wrap.getBoundingClientRect();
  const padding = zoomState.padding * 2;

  const minScaleX = (rect.width - padding) / state.canvasWidth;
  const minScaleY = (rect.height - padding) / state.canvasHeight;

  let minZoom = Math.min(minScaleX, minScaleY) * 100;
  minZoom = clamp(Math.floor(minZoom), 5, 30);

  zoomState.dynamicMin = minZoom;
  return minZoom;
}

function setZoom(zoom, center = null) {
  const minZoom = calcDynamicMinZoom();
  zoom = clamp(zoom, minZoom, zoomState.max);

  if (zoom === zoomState.current) return;

  zoomState.current = zoom;
  const scale = zoom / 100;

  canvas.style.width = state.canvasWidth * scale + "px";
  canvas.style.height = state.canvasHeight * scale + "px";

  if (center) centerCanvasAt(center, scale);

  updateZoomUI();
  showZoomIndicator(zoom);
}

function centerCanvasAt(point, scale) {
  const wrap = document.querySelector(".canvas-wrap");
  if (!wrap) return;

  wrap.scrollLeft = point.x * scale - wrap.clientWidth / 2;
  wrap.scrollTop = point.y * scale - wrap.clientHeight / 2;
}

function zoomIn() {
  setZoom(zoomState.current + zoomState.step);
}
function zoomOut() {
  setZoom(zoomState.current - zoomState.step);
}
function resetZoom() {
  setZoom(100);
}

function fitToScreen() {
  const wrap = document.querySelector(".canvas-wrap");
  if (!wrap) return;

  const rect = wrap.getBoundingClientRect();
  const padding = zoomState.padding * 2;

  const scaleX = (rect.width - padding) / state.canvasWidth;
  const scaleY = (rect.height - padding) / state.canvasHeight;
  let fitScale = Math.min(scaleX, scaleY);

  fitScale = Math.min(fitScale, 1);

  const minZoom = calcDynamicMinZoom();
  let zoom = Math.round(fitScale * 100);
  zoom = Math.max(zoom, minZoom);

  setZoom(zoom);
  centerCanvas();
}

function centerCanvas() {
  const wrap = document.querySelector(".canvas-wrap");
  if (!wrap) return;

  requestAnimationFrame(() => {
    const scrollX = (wrap.scrollWidth - wrap.clientWidth) / 2;
    const scrollY = (wrap.scrollHeight - wrap.clientHeight) / 2;
    wrap.scrollLeft = Math.max(0, scrollX);
    wrap.scrollTop = Math.max(0, scrollY);
  });
}

function updateZoomUI() {
  const slider = document.getElementById("zoomSlider");
  const value = document.getElementById("zoomValue");
  const minZoom = zoomState.dynamicMin;

  if (slider) {
    slider.min = minZoom;
    slider.max = zoomState.max;
    slider.value = zoomState.current;
  }

  if (value) {
    value.textContent = zoomState.current + "%";
  }

  const zoomOutBtn = document.getElementById("zoomOut");
  const zoomInBtn = document.getElementById("zoomIn");

  if (zoomOutBtn) zoomOutBtn.disabled = zoomState.current <= minZoom;
  if (zoomInBtn) zoomInBtn.disabled = zoomState.current >= zoomState.max;
}

let indicatorTimeout;
function showZoomIndicator(zoom) {
  const indicator = document.getElementById("zoomIndicator");
  if (!indicator) return;

  indicator.textContent = zoom + "%";
  indicator.classList.add("show");

  clearTimeout(indicatorTimeout);
  indicatorTimeout = setTimeout(() => indicator.classList.remove("show"), 800);
}

function setupWheelZoom() {
  // const wrap = document.querySelector(".canvas-wrap");
  // if (!wrap) return;

  // wrap.addEventListener(
  //   "wheel",
  //   (e) => {
  //     if (e.ctrlKey || e.metaKey) {
  //       e.preventDefault();

  //       const rect = canvas.getBoundingClientRect();
  //       const center = {
  //         x: (e.clientX - rect.left) / (zoomState.current / 100),
  //         y: (e.clientY - rect.top) / (zoomState.current / 100),
  //       };

  //       const delta = e.deltaY > 0 ? -10 : 10;
  //       setZoom(zoomState.current + delta, center);
  //     }
  //   },
  //   { passive: false }
  // );
}

function setupTouchZoom() {
  // const wrap = document.querySelector(".canvas-wrap");
  // if (!wrap) return;

  // let initialPinchDist = 0;
  // let initialZoom = 100;

  // function getPinchDist(touches) {
  //   const dx = touches[0].clientX - touches[1].clientX;
  //   const dy = touches[0].clientY - touches[1].clientY;
  //   return Math.hypot(dx, dy);
  // }

  // function getPinchCenter(touches) {
  //   return {
  //     x: (touches[0].clientX + touches[1].clientX) / 2,
  //     y: (touches[0].clientY + touches[1].clientY) / 2,
  //   };
  // }

  // wrap.addEventListener(
  //   "touchstart",
  //   (e) => {
  //     if (e.touches.length === 2) {
  //       e.preventDefault();
  //       initialPinchDist = getPinchDist(e.touches);
  //       initialZoom = zoomState.current;
  //     }
  //   },
  //   { passive: false }
  // );

  // wrap.addEventListener(
  //   "touchmove",
  //   (e) => {
  //     if (e.touches.length === 2) {
  //       e.preventDefault();

  //       const currentDist = getPinchDist(e.touches);
  //       const scale = currentDist / initialPinchDist;
  //       const newZoom = Math.round(initialZoom * scale);

  //       const center = getPinchCenter(e.touches);
  //       const rect = canvas.getBoundingClientRect();
  //       const canvasCenter = {
  //         x: (center.x - rect.left) / (zoomState.current / 100),
  //         y: (center.y - rect.top) / (zoomState.current / 100),
  //       };

  //       setZoom(newZoom, canvasCenter);
  //     }
  //   },
  //   { passive: false }
  // );

  // wrap.addEventListener("touchend", () => {
  //   initialPinchDist = 0;
  // });
}

function setupKeyboardZoom() {
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    const isMod = e.ctrlKey || e.metaKey;

    if (isMod) {
      switch (e.key) {
        case "+":
        case "=":
          e.preventDefault();
          zoomIn();
          break;
        case "-":
          e.preventDefault();
          zoomOut();
          break;
        case "0":
          e.preventDefault();
          resetZoom();
          break;
      }
    }

    switch (e.key.toLowerCase()) {
      case "f":
        if (!isMod) {
          e.preventDefault();
          fitToScreen();
        }
        break;
      case "h":
        if (!isMod) {
          handleToggleClick(e);
        }
        break;
      case "x":
        if (!isMod) {
          e.preventDefault();
          swapDimensions();
        }
        break;
      case "l":
        if (!isMod) {
          e.preventDefault();
          toggleAspectLock();
        }
        break;
      case "delete":
      case "backspace":
        if (state.selected) {
          e.preventDefault();
          delStop(state.selected);
        }
        break;
      case "escape":
        state.selected = null;
        closePicker();
        refresh();
        break;
    }
  });
}

let isButtonInteraction = false; 

function setupResizeObserver() {
  const wrap = document.querySelector(".canvas-wrap");
  if (!wrap) return;

  let resizeTimeout = null;
  let lastWidth = wrap.clientWidth;
  let lastHeight = wrap.clientHeight;

  const observer = new ResizeObserver((entries) => {
    if (isButtonInteraction) return;
    
    const entry = entries[0];
    const newWidth = entry.contentRect.width;
    const newHeight = entry.contentRect.height;
    
    if (Math.abs(newWidth - lastWidth) < 10 && Math.abs(newHeight - lastHeight) < 10) {
      return;
    }
    
    lastWidth = newWidth;
    lastHeight = newHeight;

    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const newMin = calcDynamicMinZoom();
      if (zoomState.current < newMin) {
        setZoom(newMin);
      }
      updateZoomUI();
    }, 200); 
  });

  observer.observe(wrap);
}

function setupZoomSlider() {
  const slider = document.getElementById("zoomSlider");
  if (!slider) return;

  slider.addEventListener("input", (e) => {
    setZoom(parseInt(e.target.value));
  });

  slider.addEventListener("dblclick", () => {
    resetZoom();
  });
}

function initZoom() {
  calcDynamicMinZoom();

  document.getElementById("zoomIn")?.addEventListener("click", zoomIn);
  document.getElementById("zoomOut")?.addEventListener("click", zoomOut);
  document.getElementById("zoomFit")?.addEventListener("click", fitToScreen);
  document.getElementById("zoomReset")?.addEventListener("click", resetZoom);

  setupZoomSlider();
  setupWheelZoom();
  setupTouchZoom();
  setupKeyboardZoom();
  setupResizeObserver();

  setTimeout(() => {
    fitToScreen();
    centerCanvas();
  }, 100);
}

// ========== RESIZE HANDLES ==========
const widthHandle = document.querySelector(".resize-h");
const heightHandle = document.querySelector(".resize-w");

function startResizeW(e) {
  resizingW = true;
  startY = e.clientY || e.touches?.[0]?.clientY || 0;
  startH = state.canvasHeight;
  document.body.classList.add("no-touch-scroll");
  e.preventDefault();
}

function startResizeH(e) {
  resizingH = true;
  startX = e.clientX || e.touches?.[0]?.clientX || 0;
  startW = state.canvasWidth;
  document.body.classList.add("no-touch-scroll");
  e.preventDefault();
}

if (widthHandle) {
  widthHandle.addEventListener("mousedown", startResizeW);
  widthHandle.addEventListener("touchstart", startResizeW, { passive: false });
}

if (heightHandle) {
  heightHandle.addEventListener("mousedown", startResizeH);
  heightHandle.addEventListener("touchstart", startResizeH, { passive: false });
}

document.addEventListener("mousemove", (e) => {
  if (!resizingW && !resizingH) return;

  if (resizingW) {
    let newH = startH + (e.clientY - startY);
    let newW = state.canvasWidth;

    if (dimensionState.aspectLocked && dimensionState.aspectRatio) {
      newW = Math.round(newH * dimensionState.aspectRatio);
      
      if (newW < CONFIG.canvas.minWidth) {
        newW = CONFIG.canvas.minWidth;
        newH = Math.round(newW / dimensionState.aspectRatio);
      } else if (newW > CONFIG.canvas.maxWidth) {
        newW = CONFIG.canvas.maxWidth;
        newH = Math.round(newW / dimensionState.aspectRatio);
      }
      
      if (newH < CONFIG.canvas.minHeight) {
        newH = CONFIG.canvas.minHeight;
        newW = Math.round(newH * dimensionState.aspectRatio);
        newW = clamp(newW, CONFIG.canvas.minWidth, CONFIG.canvas.maxWidth);
      } else if (newH > CONFIG.canvas.maxHeight) {
        newH = CONFIG.canvas.maxHeight;
        newW = Math.round(newH * dimensionState.aspectRatio);
        newW = clamp(newW, CONFIG.canvas.minWidth, CONFIG.canvas.maxWidth);
      }
    } else {
      newH = clamp(newH, CONFIG.canvas.minHeight, CONFIG.canvas.maxHeight);
    }

    if (newH !== lastH) {
      lastH = newH;
      state.canvasHeight = newH;
      state.canvasWidth = newW;
      
      if (canvasWidth) canvasWidth.value = Math.floor(state.canvasWidth);
      if (canvasHeight) canvasHeight.value = Math.floor(state.canvasHeight);
      clearResolutionPreset();
      refresh();
    }
  }

  if (resizingH) {
    let newW = startW + (e.clientX - startX);
    let newH = state.canvasHeight;

    if (dimensionState.aspectLocked && dimensionState.aspectRatio) {
      newH = Math.round(newW / dimensionState.aspectRatio);
      
      if (newH < CONFIG.canvas.minHeight) {
        newH = CONFIG.canvas.minHeight;
        newW = Math.round(newH * dimensionState.aspectRatio);
      } else if (newH > CONFIG.canvas.maxHeight) {
        newH = CONFIG.canvas.maxHeight;
        newW = Math.round(newH * dimensionState.aspectRatio);
      }
      
      if (newW < CONFIG.canvas.minWidth) {
        newW = CONFIG.canvas.minWidth;
        newH = Math.round(newW / dimensionState.aspectRatio);
        newH = clamp(newH, CONFIG.canvas.minHeight, CONFIG.canvas.maxHeight);
      } else if (newW > CONFIG.canvas.maxWidth) {
        newW = CONFIG.canvas.maxWidth;
        newH = Math.round(newW / dimensionState.aspectRatio);
        newH = clamp(newH, CONFIG.canvas.minHeight, CONFIG.canvas.maxHeight);
      }
    } else {
      newW = clamp(newW, CONFIG.canvas.minWidth, CONFIG.canvas.maxWidth);
    }

    if (newW !== lastW) {
      lastW = newW;
      state.canvasWidth = newW;
      state.canvasHeight = newH;
      
      if (canvasWidth) canvasWidth.value = Math.floor(state.canvasWidth);
      if (canvasHeight) canvasHeight.value = Math.floor(state.canvasHeight);
      clearResolutionPreset();
      refresh();
    }
  }
});

document.addEventListener(
  "touchmove",
  (e) => {
    if (!resizingW && !resizingH) return;
    e.preventDefault();

    const clientX = e.touches[0].clientX;
    const clientY = e.touches[0].clientY;

    if (resizingW) {
      let newH = startH + (clientY - startY);
      let newW = state.canvasWidth;

      if (dimensionState.aspectLocked && dimensionState.aspectRatio) {
        newW = Math.round(newH * dimensionState.aspectRatio);
        
        if (newW < CONFIG.canvas.minWidth) {
          newW = CONFIG.canvas.minWidth;
          newH = Math.round(newW / dimensionState.aspectRatio);
        } else if (newW > CONFIG.canvas.maxWidth) {
          newW = CONFIG.canvas.maxWidth;
          newH = Math.round(newW / dimensionState.aspectRatio);
        }
        
        if (newH < CONFIG.canvas.minHeight) {
          newH = CONFIG.canvas.minHeight;
          newW = Math.round(newH * dimensionState.aspectRatio);
          newW = clamp(newW, CONFIG.canvas.minWidth, CONFIG.canvas.maxWidth);
        } else if (newH > CONFIG.canvas.maxHeight) {
          newH = CONFIG.canvas.maxHeight;
          newW = Math.round(newH * dimensionState.aspectRatio);
          newW = clamp(newW, CONFIG.canvas.minWidth, CONFIG.canvas.maxWidth);
        }
      } else {
        newH = clamp(newH, CONFIG.canvas.minHeight, CONFIG.canvas.maxHeight);
      }

      if (newH !== lastH) {
        lastH = newH;
        state.canvasHeight = newH;
        state.canvasWidth = newW;
        
        if (canvasWidth) canvasWidth.value = Math.floor(state.canvasWidth);
        if (canvasHeight) canvasHeight.value = Math.floor(state.canvasHeight);
        clearResolutionPreset();
        refresh();
      }
    }

    if (resizingH) {
      let newW = startW + (clientX - startX);
      let newH = state.canvasHeight;

      if (dimensionState.aspectLocked && dimensionState.aspectRatio) {
        newH = Math.round(newW / dimensionState.aspectRatio);
        
        if (newH < CONFIG.canvas.minHeight) {
          newH = CONFIG.canvas.minHeight;
          newW = Math.round(newH * dimensionState.aspectRatio);
        } else if (newH > CONFIG.canvas.maxHeight) {
          newH = CONFIG.canvas.maxHeight;
          newW = Math.round(newH * dimensionState.aspectRatio);
        }
        
        if (newW < CONFIG.canvas.minWidth) {
          newW = CONFIG.canvas.minWidth;
          newH = Math.round(newW / dimensionState.aspectRatio);
          newH = clamp(newH, CONFIG.canvas.minHeight, CONFIG.canvas.maxHeight);
        } else if (newW > CONFIG.canvas.maxWidth) {
          newW = CONFIG.canvas.maxWidth;
          newH = Math.round(newW / dimensionState.aspectRatio);
          newH = clamp(newH, CONFIG.canvas.minHeight, CONFIG.canvas.maxHeight);
        }
      } else {
        newW = clamp(newW, CONFIG.canvas.minWidth, CONFIG.canvas.maxWidth);
      }

      if (newW !== lastW) {
        lastW = newW;
        state.canvasWidth = newW;
        state.canvasHeight = newH;
        
        if (canvasWidth) canvasWidth.value = Math.floor(state.canvasWidth);
        if (canvasHeight) canvasHeight.value = Math.floor(state.canvasHeight);
        clearResolutionPreset();
        refresh();
      }
    }
  },
  { passive: false }
);

document.addEventListener("mouseup", () => {
  resizingW = false;
  resizingH = false;
  document.body.classList.remove("no-touch-scroll");
});

document.addEventListener("touchend", () => {
  resizingW = false;
  resizingH = false;
  document.body.classList.remove("no-touch-scroll");
});

// ========== DIMENSION EVENT LISTENERS ==========
function initDimensionEvents() {
  // Aspect ratio buttons
  document.querySelectorAll(".aspect-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setAspectRatio(btn.dataset.ratio);
    });
  });

  // Aspect ratio inputs
  const aspectW = document.getElementById("aspectW");
  const aspectH = document.getElementById("aspectH");

  if (aspectW && aspectH) {
    const applyAspectInputs = () => {
      const w = aspectW.value;
      const h = aspectH.value;

      if (w && h) {
        setCustomAspectRatio(w, h, true);
      } else if (!w && !h) {
        setAspectRatio("free");
      }
    };

    aspectW.addEventListener("blur", applyAspectInputs);
    aspectH.addEventListener("blur", applyAspectInputs);

    const handleAspectInputScrub = () => {
      if (window.__isNumberScrubbing) {
        applyAspectInputs();
      }
    };

    aspectW.addEventListener("input", handleAspectInputScrub);
    aspectH.addEventListener("input", handleAspectInputScrub);

    aspectW.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        aspectH.focus();
      }
      if (e.key === "Escape") aspectW.blur();
    });

    aspectH.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyAspectInputs();
        aspectH.blur();
      }
      if (e.key === "Escape") aspectH.blur();
    });

    aspectW.addEventListener("focus", () => aspectW.select());
    aspectH.addEventListener("focus", () => aspectH.select());
  }

  document
    .getElementById("aspectLockBtn")
    ?.addEventListener("click", toggleAspectLock);
  document
    .getElementById("sizeLinkBtn")
    ?.addEventListener("click", toggleAspectLock);

  document
    .getElementById("swapSizeBtn")
    ?.addEventListener("click", swapDimensions);

  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const w = parseInt(btn.dataset.w);
      const h = parseInt(btn.dataset.h);
      setResolution(w, h);
    });
  });

  if (canvasWidth) {
    canvasWidth.addEventListener("blur", (e) => {
      handleWidthChange(e.target.value, true);
    });

    canvasWidth.addEventListener("input", (e) => {
      if (window.__isNumberScrubbing) {
        handleWidthChange(e.target.value, true);
      }
    });

    canvasWidth.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.target.blur();
        handleWidthChange(e.target.value, true);
      }
    });

    canvasHeight.addEventListener("blur", (e) => {
      handleHeightChange(e.target.value, true);
    });

    canvasHeight.addEventListener("input", (e) => {
      if (window.__isNumberScrubbing) {
        handleHeightChange(e.target.value, true);
      }
    });

    canvasHeight.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        handleHeightChange(e.target.value, true);
      }
    });
  }
}

// ========== GLOBALS ==========
window.getStop = getStop;
window.delStop = delStop;
window.dupStop = dupStop;
window.toggleVis = toggleVis;
window.addColorStop = addColorStop;
window.delColorStop = delColorStop;
window.openPicker = openPicker;
window.closePicker = closePicker;
window.selectRecentColor = selectRecentColor;
window.refresh = refresh;
window.updateCSS = updateCSS;
window.setCanvasSize = setCanvasSize;
window.startAngleDrag = startAngleDrag;
window.updateAngleFromInput = updateAngleFromInput;
window.startConicAngleDrag = startConicAngleDrag;
window.updateConicAngleFromInput = updateConicAngleFromInput;
window.copyCSS = copyCSS;
window.exportAsImage = exportAsImage;
window.exportAsSVG = exportAsSVG;
window.setAspectRatio = setAspectRatio;
window.setCustomAspectRatio = setCustomAspectRatio;
window.toggleAspectLock = toggleAspectLock;
window.swapDimensions = swapDimensions;
window.setResolution = setResolution;

// ========== EVENT BINDINGS ==========
document.getElementById("bgBtn")?.addEventListener("click", () => {
  openPicker(state.bgColor, state.bgAlpha, (c, a) => {
    state.bgColor = c;
    state.bgAlpha = a;
    refresh();
  });
});

document.getElementById("cssFormat")?.addEventListener("change", (e) => {
  state.cssFormat = e.target.value;
  updateCSS();
});

document
  .getElementById("btnRadial")
  ?.addEventListener("click", () => addStop("radial"));
document
  .getElementById("btnLinear")
  ?.addEventListener("click", () => addStop("linear"));
document
  .getElementById("btnConic")
  ?.addEventListener("click", () => addStop("conic"));
document.getElementById("btnReset")?.addEventListener("click", () => {
  if (!state.stops.length || confirm("Clear all layers?")) {
    state.stops = [];
    state.selected = null;
    counter = 0;
    refresh();
  }
});

window.addEventListener("resize", () => draw());

// ========== MOBILE OPTIMIZATIONS ==========
function initMobile() {
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });

  document.addEventListener("touchmove", (e) => {
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  }, { passive: false });

  document.addEventListener("gesturestart", (e) => {
    e.preventDefault();
  }, { passive: false });

  if (isMobile()) {
    state.canvasWidth = Math.min(state.canvasWidth, window.innerWidth - 40);
    state.canvasHeight = Math.min(state.canvasHeight, window.innerHeight * 0.4);
  }
}

// ========== INITIALIZATION ==========
async function init() {
  initMobile();
  initPickerEvents();
  initDimensionEvents();
  initNoiseEvents();
  initFilterEvents();
  initZoom();

  resize();
  updateZoomUI();
  updateAllDimensionUI();
  updateNoiseUI();
  updateFilterUI();

  // Default gradients
  addStop("radial");
  state.stops[0].name = "Pink Glow";
  state.stops[0].color = "#ff0066";
  state.stops[0].x = 0.25;
  state.stops[0].y = 0.4;
  state.stops[0].feather = 70;

  addStop("conic");
  state.stops[1].name = "Rainbow";
  state.stops[1].x = 0.7;
  state.stops[1].y = 0.5;
  state.stops[1].startAngle = 0;
  state.stops[1].stops = [
    { pos: 0, color: "#ff0066", opacity: 40 },
    { pos: 33, color: "#00ff88", opacity: 40 },
    { pos: 66, color: "#00d4ff", opacity: 40 },
  ];

  addStop("linear");
  state.stops[2].name = "Sunset";
  state.stops[2].angle = 135;
  state.stops[2].stops = [
    { pos: 0, color: "#00d4ff", opacity: 60 },
    { pos: 50, color: "#7c3aed", opacity: 70 },
    { pos: 100, color: "#ff6b9d", opacity: 60 },
  ];

  state.selected = null;
  refresh();

  console.log("🎨 Gradient Editor Ready!");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

(() => {
  let activeInput = null;
  let startX = 0;
  let startValue = 0;

  let lastTapTime = 0;
  const DOUBLE_TAP_DELAY = 300;

  const getStep = (input) => {
    const s = parseFloat(input.step);
    return isNaN(s) || s <= 0 ? 1 : s;
  };

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  window.__isNumberScrubbing = false;

  document.addEventListener("pointerdown", (e) => {
    const input = e.target.closest('input[type="number"]');
    if (!input) return;

    const now = Date.now();

    if (e.pointerType === "touch" && now - lastTapTime < DOUBLE_TAP_DELAY) {
      input.focus();
      input.style.cursor = "text";
      lastTapTime = 0;
      return;
    }

    lastTapTime = now;

    if (input === document.activeElement) return;

    e.preventDefault();
    input.setPointerCapture(e.pointerId);

    activeInput = input;
    startX = e.clientX;
    startValue = parseFloat(input.value) || 0;

    window.__isNumberScrubbing = true;
    document.body.style.cursor = "ew-resize";
  });

  document.addEventListener("pointermove", (e) => {
    if (!activeInput) return;
    if (activeInput === document.activeElement) return;

    const step = getStep(activeInput);
    const dx = e.clientX - startX;
    let delta = (dx / 8) * step;

    if (e.shiftKey) delta *= 5;
    if (e.altKey) delta *= 0.2;

    let value = startValue + delta;

    const min = activeInput.min === "" ? -Infinity : +activeInput.min;
    const max = activeInput.max === "" ? Infinity : +activeInput.max;

    value = clamp(value, min, max);
    value = Math.round(value / step) * step;

    activeInput.value = value;
    activeInput.dispatchEvent(new Event("input", { bubbles: true }));
  });

  const end = (e) => {
    if (!activeInput) return;
    try {
      activeInput.releasePointerCapture(e.pointerId);
    } catch {}
    activeInput = null;
    document.body.style.cursor = "";
    window.__isNumberScrubbing = false;
  };

  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);

  // دسکتاپ هنوز dblclick داره
  document.addEventListener("dblclick", (e) => {
    const input = e.target.closest('input[type="number"]');
    if (!input) return;
    input.focus();
    input.style.cursor = "text";
  });

  document.addEventListener("focusout", (e) => {
    const input = e.target.closest('input[type="number"]');
    if (!input) return;
    input.style.cursor = "ew-resize";
  });
})();
