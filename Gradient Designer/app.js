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

const STORAGE_KEY = 'gradient-designer-state-v1';

// ========== DOM ELEMENTS ==========
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const canvasWidth = document.getElementById("canvasWidth");
const canvasHeight = document.getElementById("canvasHeight");

let W = 800,
  H = 600,
  counter = 0;

// ========== STATE ==========
const state = {
  stops: [],
  selected: null,
  bgColor: "#0a0e14",
  bgAlpha: 100,
  bgBlendMode: 'normal',
  bgEnabled: true,
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

// ========== ASPECT RATIO & RESOLUTION STATE ==========
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
  max: 350,
  step: 5,
  dynamicMin: 15,
  paddingX: 75,
  paddingY: 115,
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
  const scale = Math.max(W, H) / 800;
  const radius = 25 * scale;
  return clamp(radius, 20, 60);
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


// ========== UNDO/REDO SYSTEM ==========
const History = {
  undoStack: [],
  redoStack: [],
  maxSize: 50,
  isRestoring: false,
  lastSnapshot: null,
  inputSnapshot: null,  // برای input ها
  dragSnapshot: null,   // برای drag
  
  createSnapshot() {
    return JSON.stringify({
      stops: state.stops,
      selected: state.selected,
      bgColor: state.bgColor,
      bgAlpha: state.bgAlpha,
      bgBlendMode: state.bgBlendMode,
      bgEnabled: state.bgEnabled,
      canvasWidth: state.canvasWidth,
      canvasHeight: state.canvasHeight,
      lockVertical: state.lockVertical,
      showHandles: state.showHandles,
      filterState: { ...filterState },
      noiseState: { ...noiseState },
      counter: counter,
    });
  },
  
  restoreSnapshot(snapshot) {
    if (!snapshot) return false;
    try {
      const data = JSON.parse(snapshot);
      state.stops = data.stops || [];
      state.selected = data.selected;
      state.bgColor = data.bgColor || "#0a0e14";
      state.bgAlpha = data.bgAlpha ?? 100;
      state.bgBlendMode = data.bgBlendMode || 'normal';
      state.bgEnabled = data.bgEnabled ?? true;
      state.canvasWidth = data.canvasWidth || 800;
      state.canvasHeight = data.canvasHeight || 600;
      state.lockVertical = data.lockVertical ?? false;
      state.showHandles = data.showHandles ?? true;
      if (data.filterState) Object.assign(filterState, data.filterState);
      if (data.noiseState) Object.assign(noiseState, data.noiseState);
      if (data.counter !== undefined) counter = data.counter;
      return true;
    } catch (e) {
      return false;
    }
  },
  
  // ✅ وقتی focus میشه - ذخیره snapshot
  onInputFocus() {
    if (this.isRestoring) return;
    if (!this.inputSnapshot) {
      this.inputSnapshot = this.createSnapshot();
    }
  },
  
  // ✅ وقتی blur میشه - ذخیره تغییرات
  onInputBlur() {
    if (this.isRestoring) return;
    if (!this.inputSnapshot) return;
    
    const current = this.createSnapshot();
    
    if (current !== this.inputSnapshot) {
      this.undoStack.push({ snapshot: this.inputSnapshot });
      if (this.undoStack.length > this.maxSize) this.undoStack.shift();
      this.redoStack = [];
      this.lastSnapshot = current;
      this.updateUI();
    }
    
    this.inputSnapshot = null;
  },
  
  // ✅ شروع drag
  onDragStart() {
    if (this.isRestoring) return;
    if (!this.dragSnapshot) {
      this.dragSnapshot = this.createSnapshot();
    }
  },
  
  // ✅ پایان drag
  onDragEnd() {
    if (this.isRestoring) return;
    if (!this.dragSnapshot) return;
    
    const current = this.createSnapshot();
    
    if (current !== this.dragSnapshot) {
      this.undoStack.push({ snapshot: this.dragSnapshot });
      if (this.undoStack.length > this.maxSize) this.undoStack.shift();
      this.redoStack = [];
      this.lastSnapshot = current;
      this.updateUI();
    }
    
    this.dragSnapshot = null;
  },
  
  // ✅ ذخیره فوری (برای دکمه‌ها)
  saveState() {
    if (this.isRestoring) return;
    
    const snapshot = this.createSnapshot();
    if (snapshot === this.lastSnapshot) return;
    
    this.undoStack.push({ snapshot });
    if (this.undoStack.length > this.maxSize) this.undoStack.shift();
    this.redoStack = [];
    this.lastSnapshot = snapshot;
    this.inputSnapshot = null;
    this.dragSnapshot = null;
    this.updateUI();
  },
  
  undo() {
    if (this.undoStack.length === 0) return false;
    
    // لغو هر pending
    this.inputSnapshot = null;
    this.dragSnapshot = null;
    
    const current = this.createSnapshot();
    this.redoStack.push({ snapshot: current });
    
    const prev = this.undoStack.pop();
    
    this.isRestoring = true;
    if (this.restoreSnapshot(prev.snapshot)) {
      this.lastSnapshot = prev.snapshot;
      this.refreshUI();
      this.showIndicator('undo');
    }
    this.isRestoring = false;
    this.updateUI();
    return true;
  },
  
  redo() {
    if (this.redoStack.length === 0) return false;
    
    const current = this.createSnapshot();
    this.undoStack.push({ snapshot: current });
    
    const next = this.redoStack.pop();
    
    this.isRestoring = true;
    if (this.restoreSnapshot(next.snapshot)) {
      this.lastSnapshot = next.snapshot;
      this.refreshUI();
      this.showIndicator('redo');
    }
    this.isRestoring = false;
    this.updateUI();
    return true;
  },
  
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.lastSnapshot = this.createSnapshot();
    this.inputSnapshot = null;
    this.dragSnapshot = null;
    this.updateUI();
  },
  
  updateUI() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.disabled = this.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = this.redoStack.length === 0;
  },
  
  refreshUI() {
    resize();
    draw();
    renderList();
    renderInspector();
    updateCSS();
    updateBgPreview();
    if (typeof updateFilterUI === 'function') updateFilterUI();
    if (typeof updateNoiseUI === 'function') updateNoiseUI();
    if (typeof updateBgUI === 'function') updateBgUI();
    if (typeof applyNoiseFilter === 'function') applyNoiseFilter();
    if (typeof updateAllDimensionUI === 'function') updateAllDimensionUI();
  },
  
  showIndicator(type) {
    let el = document.getElementById('historyIndicator');
    if (!el) {
      el = document.createElement('div');
      el.id = 'historyIndicator';
      document.body.appendChild(el);
    }
    
    el.textContent = type === 'undo' ? '↶ Undo' : '↷ Redo';
    el.className = `history-indicator ${type} show`;
    
    clearTimeout(this._timer);
    this._timer = setTimeout(() => el.classList.remove('show'), 800);
  },
  
  init() {
    this.lastSnapshot = this.createSnapshot();
    this.setupGlobalListeners();
    this.overrideFunctions();
    this.updateUI();
  },
  
  setupGlobalListeners() {
    // Canvas drag
    if (typeof canvas !== 'undefined' && canvas) {
      canvas.addEventListener('mousedown', () => this.onDragStart());
      canvas.addEventListener('touchstart', () => this.onDragStart(), { passive: true });
    }
    
    document.addEventListener('mouseup', () => {
      if (this.dragSnapshot) {
        setTimeout(() => this.onDragEnd(), 50);
      }
    });
    
    document.addEventListener('touchend', () => {
      if (this.dragSnapshot) {
        setTimeout(() => this.onDragEnd(), 50);
      }
    });
  },
  
  overrideFunctions() {
    const self = this;
    
    // addStop
    if (typeof window.addStop === 'function') {
      const orig = window.addStop;
      window.addStop = function(type) { self.saveState(); orig(type); };
    }
    
    // delStop
    if (typeof window.delStop === 'function') {
      const orig = window.delStop;
      window.delStop = function(id) { self.saveState(); orig(id); };
    }
    
    // dupStop
    if (typeof window.dupStop === 'function') {
      const orig = window.dupStop;
      window.dupStop = function(id) { self.saveState(); orig(id); };
    }
    
    // toggleVis
    if (typeof window.toggleVis === 'function') {
      const orig = window.toggleVis;
      window.toggleVis = function(id) { self.saveState(); orig(id); };
    }
    
    // addColorStop
    if (typeof window.addColorStop === 'function') {
      const orig = window.addColorStop;
      window.addColorStop = function(s) { self.saveState(); orig(s); };
    }
    
    // delColorStop
    if (typeof window.delColorStop === 'function') {
      const orig = window.delColorStop;
      window.delColorStop = function(s, i) { self.saveState(); orig(s, i); };
    }
    
    // swapDimensions
    if (typeof window.swapDimensions === 'function') {
      const orig = window.swapDimensions;
      window.swapDimensions = function() { self.saveState(); orig(); };
    }
    
    // toggleAspectLock
    if (typeof window.toggleAspectLock === 'function') {
      const orig = window.toggleAspectLock;
      window.toggleAspectLock = function() { self.saveState(); orig(); };
    }
    
    // setResolution
    if (typeof window.setResolution === 'function') {
      const orig = window.setResolution;
      window.setResolution = function(w, h) { self.saveState(); orig(w, h); };
    }
    
    // setAspectRatio
    if (typeof window.setAspectRatio === 'function') {
      const orig = window.setAspectRatio;
      window.setAspectRatio = function(r) { self.saveState(); orig(r); };
    }
    
    // resetFilters
    if (typeof window.resetFilters === 'function') {
      const orig = window.resetFilters;
      window.resetFilters = function() { self.saveState(); orig(); };
    }
    
    // toggleFilters
    if (typeof window.toggleFilters === 'function') {
      const orig = window.toggleFilters;
      window.toggleFilters = function() { self.saveState(); orig(); };
    }
    
    // toggleNoise
    if (typeof window.toggleNoise === 'function') {
      const orig = window.toggleNoise;
      window.toggleNoise = function() { self.saveState(); orig(); };
    }
    
    // toggleBackground
    if (typeof window.toggleBackground === 'function') {
      const orig = window.toggleBackground;
      window.toggleBackground = function() { self.saveState(); orig(); };
    }
    
    // handleLockClick
    if (typeof window.handleLockClick === 'function') {
      const orig = window.handleLockClick;
      window.handleLockClick = function(e) { self.saveState(); orig(e); };
    }
    
    // handleToggleClick
    if (typeof window.handleToggleClick === 'function') {
      const orig = window.handleToggleClick;
      window.handleToggleClick = function(e) { self.saveState(); orig(e); };
    }
    
    // openPicker
    if (typeof window.openPicker === 'function') {
      const orig = window.openPicker;
      window.openPicker = function(hex, opacity, cb) {
        self.onDragStart();
        orig(hex, opacity, cb);
      };
    }
    
    // closePicker
    if (typeof window.closePicker === 'function') {
      const orig = window.closePicker;
      window.closePicker = function() {
        orig();
        setTimeout(() => self.onDragEnd(), 50);
      };
    }
    
    // openStopColorPicker
    if (typeof window.openStopColorPicker === 'function') {
      const orig = window.openStopColorPicker;
      window.openStopColorPicker = function(a, b, c) {
        self.onDragStart();
        orig(a, b, c);
      };
    }
    
    // setStopBlendMode
    if (typeof window.setStopBlendMode === 'function') {
      const orig = window.setStopBlendMode;
      window.setStopBlendMode = function(id, mode) { self.saveState(); orig(id, mode); };
    }
    
    // setBgBlendMode
    if (typeof window.setBgBlendMode === 'function') {
      const orig = window.setBgBlendMode;
      window.setBgBlendMode = function(mode) { self.saveState(); orig(mode); };
    }
    
    // startAngleDrag
    if (typeof window.startAngleDrag === 'function') {
      const orig = window.startAngleDrag;
      window.startAngleDrag = function(e, id) {
        self.onDragStart();
        orig(e, id);
      };
    }
    
    // startConicAngleDrag
    if (typeof window.startConicAngleDrag === 'function') {
      const orig = window.startConicAngleDrag;
      window.startConicAngleDrag = function(e, id) {
        self.onDragStart();
        orig(e, id);
      };
    }
    
    // stopAngleDrag
    if (typeof window.stopAngleDrag === 'function') {
      const orig = window.stopAngleDrag;
      window.stopAngleDrag = function() {
        orig();
        setTimeout(() => self.onDragEnd(), 50);
      };
    }
  }
};

// ========== HELPER FUNCTIONS برای Inspector ==========
// این توابع با onfocus و onblur کار می‌کنن

function HF() { History.onInputFocus(); }  // History Focus
function HB() { History.onInputBlur(); }   // History Blur

window.HF = HF;
window.HB = HB;

// ========== FILE MANAGER ==========
const FileManager = {
  getState() {
    return {
      version: 1,
      timestamp: Date.now(),
      stops: state.stops,
      selected: state.selected,
      bgColor: state.bgColor,
      bgAlpha: state.bgAlpha,
      bgBlendMode: state.bgBlendMode,
      bgEnabled: state.bgEnabled,
      cssFormat: state.cssFormat,
      canvasWidth: state.canvasWidth,
      canvasHeight: state.canvasHeight,
      lockVertical: state.lockVertical,
      showHandles: state.showHandles,
      filterState: { ...filterState },
      noiseState: { ...noiseState },
      dimensionState: { ...dimensionState },
      counter: counter,
    };
  },
  
  setState(data) {
    if (!data) return false;
    try {
      if (data.stops) state.stops = data.stops.map(s => ({ ...s, id: s.id || uid() }));
      state.selected = data.selected || null;
      state.bgColor = data.bgColor || "#0a0e14";
      state.bgAlpha = data.bgAlpha ?? 100;
      state.bgBlendMode = data.bgBlendMode || 'normal';
      state.bgEnabled = data.bgEnabled ?? true;
      state.cssFormat = data.cssFormat || 'rgba';
      state.canvasWidth = data.canvasWidth || 800;
      state.canvasHeight = data.canvasHeight || 600;
      state.lockVertical = data.lockVertical ?? false;
      state.showHandles = data.showHandles ?? true;
      if (data.filterState) Object.assign(filterState, data.filterState);
      if (data.noiseState) Object.assign(noiseState, data.noiseState);
      if (data.dimensionState) Object.assign(dimensionState, data.dimensionState);
      if (data.counter !== undefined) counter = data.counter;
      return true;
    } catch (e) {
      return false;
    }
  },
  
  exportJSON() {
    const data = this.getState();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gradient-${data.canvasWidth}x${data.canvasHeight}.json`;
    a.click();
  },
  
  importJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        History.saveState();
        if (this.setState(data)) {
          counter = state.stops.length;
          this.refreshAll();
          History.clear();
        }
      } catch (err) {}
    };
    input.click();
  },
  
  loadPresetFromSession() {
    const json = sessionStorage.getItem('loadPreset');
    if (!json) return;
    sessionStorage.removeItem('loadPreset');
    try {
      const preset = JSON.parse(json);
      if (this.setState(preset.data)) {
        counter = state.stops.length;
        this.refreshAll();
        History.clear();
      }
    } catch (e) {}
  },
  
  refreshAll() {
    resize(); draw(); renderList(); renderInspector();
    updateCSS(); updateBgPreview();
    if (typeof updateAllDimensionUI === 'function') updateAllDimensionUI();
    if (typeof updateFilterUI === 'function') updateFilterUI();
    if (typeof updateNoiseUI === 'function') updateNoiseUI();
    if (typeof updateBgUI === 'function') updateBgUI();
    if (typeof updateZoomUI === 'function') updateZoomUI();
    if (typeof applyNoiseFilter === 'function') applyNoiseFilter();
    setTimeout(() => { if (typeof fitToScreen === 'function') fitToScreen(); }, 100);
  }
};

// ========== KEYBOARD ==========
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  const isMod = e.ctrlKey || e.metaKey;
  if (isMod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); History.undo(); }
  else if (isMod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); History.redo(); }
  else if (isMod && e.key === 's') { e.preventDefault(); FileManager.exportJSON(); }
  else if (isMod && e.key === 'o') { e.preventDefault(); FileManager.importJSON(); }
});

// ========== INIT ==========
function initHistorySystem() {
  History.init();
  setTimeout(() => FileManager.loadPresetFromSession(), 500);
}

if (document.readyState === 'complete') initHistorySystem();
else window.addEventListener('load', initHistorySystem);

window.History = History;
window.FileManager = FileManager;
window.undo = () => History.undo();
window.redo = () => History.redo();
window.exportJSON = () => FileManager.exportJSON();
window.importJSON = () => FileManager.importJSON();

const buttons = document.querySelectorAll('.control-btn');

buttons.forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.remove('run'); // reset
    void btn.offsetWidth;        // force reflow
    btn.classList.add('run');
  });
});

const select = document.getElementById('themeSelect');

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyTheme(theme) {
  const finalTheme = theme === 'auto' ? getSystemTheme() : theme;
  document.documentElement.dataset.theme = finalTheme;
}

const savedTheme = localStorage.getItem('theme') || 'auto';

// ست شدن دقیق select
select.value = savedTheme;

// اعمال تم
applyTheme(savedTheme);

// تغییر تم توسط کاربر
select.addEventListener('change', () => {
  const value = select.value;
  localStorage.setItem('theme', value);
  applyTheme(value);
});

// واکنش به تغییر تم سیستم وقتی auto فعاله
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (localStorage.getItem('theme') === 'auto') {
    applyTheme('auto');
  }
});


select.addEventListener('change', e => {
  applyTheme(e.target.value);
});

// ========== SECTION DRAG & DROP - TOUCH + MOUSE ==========
document.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('.panel');
  if (!container) return;

  // ========== CONFIG ==========
  const STORAGE_KEY = 'section-order';
  const DRAG_CONFIG = {
    delay: 200,
    scrollThreshold: 15,
    throttleMs: 16, // ~60fps
  };

  // ========== STATE ==========
  const sectionDrag = {
    active: false,
    pending: false,
    element: null,
    clone: null,
    placeholder: null,
    startY: 0,
    startX: 0,
    offsetY: 0,
    delayTimer: null,
    initialRect: null,
    scrollCancelled: false,
    rafId: null, // برای requestAnimationFrame
    lastMoveTime: 0, // برای throttle
  };

  // ========== LOAD ORDER FROM STORAGE ==========
  function loadOrder() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;

      const order = JSON.parse(saved);
      const sections = container.querySelectorAll('.section');
      const sectionMap = new Map();

      // ساخت map از section‌ها
      sections.forEach(section => {
        const id = section.dataset.id || section.id || section.querySelector('.section-header')?.textContent?.trim();
        if (id) sectionMap.set(id, section);
      });

      // مرتب‌سازی
      order.forEach(id => {
        const section = sectionMap.get(id);
        if (section) {
          container.appendChild(section);
        }
      });

      console.log('✅ Section order loaded');
    } catch (e) {
      console.warn('Failed to load section order:', e);
    }
  }

  // ========== SAVE ORDER TO STORAGE ==========
  function saveOrder() {
    try {
      const sections = container.querySelectorAll('.section:not(.section-drag-placeholder)');
      const order = [];

      sections.forEach(section => {
        const id = section.dataset.id || section.id || section.querySelector('.section-header')?.textContent?.trim();
        if (id) order.push(id);
      });

      localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
      console.log('💾 Section order saved');
    } catch (e) {
      console.warn('Failed to save section order:', e);
    }
  }

  // ========== THROTTLE HELPER ==========
  function throttle(fn, wait) {
    let lastTime = 0;
    return function(...args) {
      const now = Date.now();
      if (now - lastTime >= wait) {
        lastTime = now;
        fn.apply(this, args);
      }
    };
  }

  // ========== INIT ==========
  loadOrder(); // بارگذاری ترتیب ذخیره شده

  container.querySelectorAll('.section').forEach(section => {
    // اطمینان از وجود ID
    if (!section.dataset.id && !section.id) {
      section.dataset.id = 'section-' + Math.random().toString(36).substr(2, 9);
    }

    const header = section.querySelector('.section-header');
    if (!header) return;

    section.draggable = false;

    // ========== MOUSE ==========
    header.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('select, input, button, a, .control-btn')) return;
      e.preventDefault();
      startPending(section, e.clientX, e.clientY);
    });

    // ========== TOUCH ==========
    header.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      if (e.target.closest('select, input, button, a, .control-btn')) return;
      startPending(section, e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
  });

  // ========== START PENDING ==========
  function startPending(section, clientX, clientY) {
    const rect = section.getBoundingClientRect();

    Object.assign(sectionDrag, {
      pending: true,
      element: section,
      startX: clientX,
      startY: clientY,
      offsetY: clientY - rect.top,
      initialRect: rect,
      scrollCancelled: false,
    });

    sectionDrag.delayTimer = setTimeout(() => {
      if (sectionDrag.pending && !sectionDrag.scrollCancelled) {
        startActualDrag();
      }
    }, DRAG_CONFIG.delay);

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
  }

  // ========== ON MOVE (OPTIMIZED) ==========
  function onMove(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // در حالت pending
    if (sectionDrag.pending && !sectionDrag.active) {
      const dx = Math.abs(clientX - sectionDrag.startX);
      const dy = Math.abs(clientY - sectionDrag.startY);

      if (dy > DRAG_CONFIG.scrollThreshold || dx > DRAG_CONFIG.scrollThreshold) {
        clearTimeout(sectionDrag.delayTimer);
        sectionDrag.scrollCancelled = true;
        sectionDrag.pending = false;
        cleanup();
        return;
      }
      return;
    }

    if (!sectionDrag.active || !sectionDrag.clone) return;
    e.preventDefault();

    // 🚀 Throttle + RAF برای جلوگیری از لگ
    const now = Date.now();
    if (now - sectionDrag.lastMoveTime < DRAG_CONFIG.throttleMs) return;
    sectionDrag.lastMoveTime = now;

    if (sectionDrag.rafId) {
      cancelAnimationFrame(sectionDrag.rafId);
    }

    sectionDrag.rafId = requestAnimationFrame(() => {
      if (!sectionDrag.clone) return;
      
      // حرکت clone با transform (سریع‌تر از top)
      const newTop = clientY - sectionDrag.offsetY;
      sectionDrag.clone.style.transform = `translateY(${newTop - sectionDrag.initialRect.top}px) scale(1.02)`;
      
      updatePlaceholderPosition(clientY);
    });
  }

  // ========== UPDATE PLACEHOLDER ==========
  function updatePlaceholderPosition(clientY) {
    const sections = container.querySelectorAll('.section:not(.drag-original):not(.section-drag-placeholder)');
    let targetSection = null;
    let insertBefore = true;

    for (const sec of sections) {
      const rect = sec.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (clientY < midY) {
        targetSection = sec;
        insertBefore = true;
        break;
      } else {
        targetSection = sec;
        insertBefore = false;
      }
    }

    if (!targetSection || !sectionDrag.placeholder) return;

    const placeholder = sectionDrag.placeholder;
    
    if (insertBefore) {
      if (placeholder.nextElementSibling !== targetSection) {
        container.insertBefore(placeholder, targetSection);
      }
    } else {
      const next = targetSection.nextElementSibling;
      if (next && next !== placeholder) {
        container.insertBefore(placeholder, next);
      } else if (!next && placeholder.nextElementSibling) {
        container.appendChild(placeholder);
      }
    }
  }

  // ========== START ACTUAL DRAG ==========
  function startActualDrag() {
    if (sectionDrag.active || !sectionDrag.element) return;

    const section = sectionDrag.element;
    const rect = sectionDrag.initialRect;

    sectionDrag.pending = false;
    sectionDrag.active = true;

    // 🚀 Clone با will-change برای GPU acceleration
    sectionDrag.clone = section.cloneNode(true);
    sectionDrag.clone.classList.add('section-drag-clone');
    Object.assign(sectionDrag.clone.style, {
      position: 'fixed',
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      zIndex: '10000',
      pointerEvents: 'none',
      opacity: '0.95',
      boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
      borderRadius: '8px',
      background: 'var(--TransParent-bg)',
      backdropFilter: 'blur(6px)',
      border: '2px solid var(--border)',
      willChange: 'transform', // 🚀 GPU acceleration
      transform: 'scale(1.02)',
    });
    document.body.appendChild(sectionDrag.clone);

    // Placeholder
    sectionDrag.placeholder = document.createElement('div');
    sectionDrag.placeholder.className = 'section-drag-placeholder';
    Object.assign(sectionDrag.placeholder.style, {
      height: rect.height + 'px',
      marginBottom: '18px',
      border: '2px dashed var(--border)',
      borderRadius: '8px',
      background: 'rgba(255,255,255,0.05)',
      transition: 'height 0.2s ease',
    });

    // مخفی کردن اصلی
    section.classList.add('drag-original');
    Object.assign(section.style, {
      opacity: '0',
      height: '0',
      margin: '0',
      padding: '0',
      overflow: 'hidden',
    });

    section.parentNode.insertBefore(sectionDrag.placeholder, section);

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    if (navigator.vibrate) navigator.vibrate(30);
  }

  // ========== ON END ==========
  function onEnd() {
    clearTimeout(sectionDrag.delayTimer);
    if (sectionDrag.rafId) cancelAnimationFrame(sectionDrag.rafId);

    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    document.removeEventListener('touchcancel', onEnd);

    if (!sectionDrag.active) {
      cleanup();
      return;
    }

    // انیمیشن بازگشت
    if (sectionDrag.clone && sectionDrag.placeholder) {
      const placeholderRect = sectionDrag.placeholder.getBoundingClientRect();
      const startRect = sectionDrag.initialRect;
      
      Object.assign(sectionDrag.clone.style, {
        transition: 'all 0.2s ease-out',
        transform: 'scale(1)',
        top: placeholderRect.top + 'px',
        left: placeholderRect.left + 'px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
      });

      setTimeout(finalizeDrag, 200);
    } else {
      finalizeDrag();
    }
  }

  // ========== FINALIZE ==========
  function finalizeDrag() {
    if (sectionDrag.element && sectionDrag.placeholder) {
      container.insertBefore(sectionDrag.element, sectionDrag.placeholder);
    }
    
    const wasActive = sectionDrag.active;
    cleanup();
    
    // 💾 ذخیره در localStorage
    if (wasActive) {
      saveOrder();
    }
  }

  // ========== CLEANUP ==========
  function cleanup() {
    sectionDrag.clone?.remove();
    sectionDrag.placeholder?.remove();

    if (sectionDrag.element) {
      sectionDrag.element.classList.remove('drag-original');
      sectionDrag.element.style.cssText = '';
    }

    Object.assign(document.body.style, {
      overflow: '',
      touchAction: '',
      userSelect: '',
      cursor: '',
    });

    Object.assign(sectionDrag, {
      active: false,
      pending: false,
      element: null,
      clone: null,
      placeholder: null,
      delayTimer: null,
      initialRect: null,
      scrollCancelled: false,
      rafId: null,
      lastMoveTime: 0,
    });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.section').forEach(section => {
    const header = section.querySelector('.section-header');
    const content = section.querySelector('.section-content');

    if (!header || !content) return;

    let isOpen = false;
    let isAnimating = false;
    
    // ========== Touch State ==========
    let touchStartY = 0;
    let touchStartTime = 0;
    let isTouchMoved = false;

    // ========== CONFIG ==========
    const TAP_THRESHOLD = 10;      // حداکثر حرکت برای تشخیص tap (px)
    const TAP_MAX_DURATION = 300;  // حداکثر زمان برای tap (ms)

    // ✅ مقداردهی اولیه
    content.style.height = '0px';

    // ========== Toggle Function ==========
    function toggle() {
      if (isAnimating) return;
      isAnimating = true;

      if (isOpen) {
        // ═══════════ بستن ═══════════
        content.style.height = content.scrollHeight + 'px';
        content.offsetHeight; // Force reflow
        content.style.height = '0px';
        section.classList.remove('open');
      } else {
        // ═══════════ باز کردن ═══════════
        content.style.height = content.scrollHeight + 'px';
        section.classList.add('open');
        
        // ✅ Haptic feedback
        if (navigator.vibrate) {
          navigator.vibrate(10);
        }
      }
      
      isOpen = !isOpen;
    }

    // ========== Mouse Click ==========
    header.addEventListener('click', (e) => {
      // جلوگیری از تداخل با دکمه‌ها
      if (e.target.closest('button, input, select, a, .control-btn')) return;
      toggle();
    });

    // ========== Touch Events ==========
    header.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      if (e.target.closest('select, input, button, a, .control-btn')) return;
    
      startPending(e, section, e.touches[0].clientY);
    }, { passive: true });
    

    header.addEventListener('touchmove', (e) => {
      if (!touchStartTime) return;
      
      const deltaY = Math.abs(e.touches[0].clientY - touchStartY);
      
      // اگر بیشتر از threshold حرکت کرد، scroll است نه tap
      if (deltaY > TAP_THRESHOLD) {
        isTouchMoved = true;
      }
    }, { passive: true });

    header.addEventListener('touchend', (e) => {
      // جلوگیری از تداخل با دکمه‌ها
      if (e.target.closest('button, input, select, a, .control-btn')) return;
      
      const touchDuration = Date.now() - touchStartTime;
      
      // ✅ فقط اگر tap بود (نه scroll)
      if (!isTouchMoved && touchDuration < TAP_MAX_DURATION) {
        e.preventDefault(); // جلوگیری از ghost click
        toggle();
      }
      
      // Reset
      touchStartY = 0;
      touchStartTime = 0;
      isTouchMoved = false;
    }, { passive: false });

    // ========== Transition End ==========
    content.addEventListener('transitionend', (e) => {
      if (e.propertyName !== 'height') return;
      
      isAnimating = false;
      
      if (isOpen) {
        content.style.height = 'auto';
      }
    });
  });
});

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

// ========== CANVAS ==========
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
const toolbar = document.querySelector('.tool-bar');
const zoomControls = document.querySelector('.zoom-controls');
const canvasWrap = document.querySelector('.canvas-wrap');

canvasWrap.addEventListener('scroll', () => {
  const x = canvasWrap.scrollLeft;
  const y = canvasWrap.scrollTop;
  toolbar.style.transform = `translate(${x}px, ${y}px)`;
  zoomControls.style.transform = `translate(${x}px, ${y}px)`;
});

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

  if (panState.mode || panState.isPinch) {
    return;
  }

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

      // بررسی Color Stops
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

      // بررسی مرکز
      if (Math.hypot(cx - mx, cy - my) < hitRadius) {
        drag = { t: "move", s };
        state.selected = s.id;
        refresh();
        return;
      }

      // بررسی خط برای چرخش
      const lineLen = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
      const t = ((mx - x1) * (x2 - x1) + (my - y1) * (y2 - y1)) / (lineLen * lineLen);
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

      // ✅ ۱. بررسی Color Stops روی دایره
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

      // ✅ ۲. بررسی نقطه انتهای خط شعاعی (هندل چرخش)
      const rotateX = cx + Math.cos(startAngleRad) * radius;
      const rotateY = cy + Math.sin(startAngleRad) * radius;
      if (Math.hypot(rotateX - mx, rotateY - my) < hitRadius) {
        drag = { t: "conic-angle", s };
        state.selected = s.id;
        refresh();
        return;
      }

      // ✅ ۳. بررسی کل خط شعاعی (برای چرخش)
      const lineDx = rotateX - cx;
      const lineDy = rotateY - cy;
      const lineLen2 = lineDx * lineDx + lineDy * lineDy;
      const t = ((mx - cx) * lineDx + (my - cy) * lineDy) / lineLen2;
      if (t >= 0.3 && t <= 1) { // از 30% به بعد تا با مرکز تداخل نکند
        const projX = cx + t * lineDx;
        const projY = cy + t * lineDy;
        if (Math.hypot(projX - mx, projY - my) < hitRadius) {
          drag = { t: "conic-angle", s };
          state.selected = s.id;
          refresh();
          return;
        }
      }

      // ✅ ۴. بررسی مرکز (برای جابجایی)
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
// ========== DRAWING FUNCTIONS ==========
function draw() {
  const dpr = canvas.width / W;
  
  // ✅ همیشه transform رو ریست کن و دوباره ست کن
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  
  const visibleStops = state.stops.filter((s) => s.visible);
  const needsFilter = hasActiveFilters();
  
  // ========== بدون فیلتر - رسم مستقیم ==========
  if (!needsFilter) {
    drawScene(ctx, W, H);
    
    // هندل‌ها
    if (state.showHandles) {
      visibleStops.forEach(drawHandle);
    }
    return;
  }
  
  // ========== با فیلتر - Canvas موقت ==========
  
  // ✅ Canvas موقت با ابعاد واقعی (بدون dpr)
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = W;
  tempCanvas.height = H;
  const tempCtx = tempCanvas.getContext('2d');
  
  // رسم صحنه روی temp (بدون dpr)
  drawScene(tempCtx, W, H);
  
  // ========== اعمال فیلترها ==========
  
  // 1. Blur (با CSS filter چون سریعتره)
  if (filterState.blur > 0) {
    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = W;
    blurCanvas.height = H;
    const blurCtx = blurCanvas.getContext('2d');
    blurCtx.filter = `blur(${filterState.blur}px)`;
    blurCtx.drawImage(tempCanvas, 0, 0);
    
    // کپی برگشت به temp
    tempCtx.clearRect(0, 0, W, H);
    tempCtx.drawImage(blurCanvas, 0, 0);
  }
  
  // 2. سایر فیلترها (pixel manipulation)
  if (hasNonBlurFilters()) {
    const imageData = tempCtx.getImageData(0, 0, W, H);
    applyFiltersToImageData(imageData);
    tempCtx.putImageData(imageData, 0, 0);
  }
  
  // ========== کپی به Canvas اصلی ==========
  // ✅ مهم: با در نظر گرفتن dpr
  ctx.drawImage(tempCanvas, 0, 0, W, H);
  
  // ========== هندل‌ها (بعد از فیلتر، روی ctx اصلی) ==========
  if (state.showHandles) {
    visibleStops.forEach(drawHandle);
  }
}

function drawScene(targetCtx, width, height) {
  const visibleStops = state.stops.filter((s) => s.visible);
  
  // 1. پس‌زمینه
  if (state.bgEnabled) {
    targetCtx.fillStyle = rgba(state.bgColor, state.bgAlpha / 100);
    targetCtx.fillRect(0, 0, width, height);
  }

  // 2. خط قفل عمودی
  if (state.lockVertical) {
    const scale = Math.max(width, height) / 800;
    targetCtx.strokeStyle = "rgba(255,255,255,0.5)";
    targetCtx.lineWidth = 2 * scale;
    targetCtx.setLineDash([10 * scale, 5 * scale]);
    targetCtx.beginPath();
    targetCtx.moveTo(0, height / 2);
    targetCtx.lineTo(width, height / 2);
    targetCtx.stroke();
    targetCtx.setLineDash([]);
  }

  // 3. گرادینت‌ها
  if (visibleStops.length > 0) {
    const reversedStops = [...visibleStops].reverse();
    
    const needsBgBlend = state.bgEnabled && 
                         state.bgBlendMode && 
                         state.bgBlendMode !== 'normal';
    
    if (needsBgBlend) {
      const gradCanvas = document.createElement('canvas');
      gradCanvas.width = width;
      gradCanvas.height = height;
      const gradCtx = gradCanvas.getContext('2d');
      
      reversedStops.forEach(s => {
        gradCtx.globalCompositeOperation = getCanvasBlendMode(s.blendMode);
        drawGradToCtxFixed(s, gradCtx, width, height);
      });
      gradCtx.globalCompositeOperation = 'source-over';
      
      targetCtx.globalCompositeOperation = getCanvasBlendMode(state.bgBlendMode);
      targetCtx.drawImage(gradCanvas, 0, 0);
      targetCtx.globalCompositeOperation = 'source-over';
      
    } else {
      reversedStops.forEach(s => {
        targetCtx.globalCompositeOperation = getCanvasBlendMode(s.blendMode);
        drawGradToCtxFixed(s, targetCtx, width, height);
      });
      targetCtx.globalCompositeOperation = 'source-over';
    }
  }
}
function drawGradToCtxFixed(s, targetCtx, width, height) {
  const cx = s.x * width;
  const cy = s.y * height;

  if (s.type === "radial") {
    // ✅ مقیاس‌بندی سایز برای ابعاد مختلف
    const sizeScale = Math.max(width, height) / Math.max(W, H);
    const scaledSize = s.size * sizeScale;
    
    const solidEnd = 1 - s.feather / 100;
    const grad = targetCtx.createRadialGradient(cx, cy, 0, cx, cy, scaledSize);
    const color = rgba(s.color, s.opacity / 100);

    grad.addColorStop(0, color);
    if (solidEnd > 0 && solidEnd < 1) {
      grad.addColorStop(solidEnd, color);
    }
    grad.addColorStop(1, rgba(s.color, 0));

    targetCtx.fillStyle = grad;
    targetCtx.beginPath();
    targetCtx.arc(cx, cy, scaledSize, 0, Math.PI * 2);
    targetCtx.fill();
  } 
  else if (s.type === "linear") {
    const angleRad = ((s.angle - 90) * Math.PI) / 180;
    const diagonal = Math.hypot(width, height);
    const mx = width / 2;
    const my = height / 2;
    const dx = (Math.cos(angleRad) * diagonal) / 2;
    const dy = (Math.sin(angleRad) * diagonal) / 2;

    const grad = targetCtx.createLinearGradient(mx - dx, my - dy, mx + dx, my + dy);

    const fixedStops = fixTransparentStops(s.stops);
    fixedStops.forEach((cs) => {
      grad.addColorStop(
        clamp(cs.pos / 100, 0, 1),
        rgba(cs.color, cs.opacity / 100)
      );
    });

    targetCtx.fillStyle = grad;
    targetCtx.fillRect(0, 0, width, height);
  } 
  else if (s.type === "conic") {
    const startAngle = ((s.startAngle - 90) * Math.PI) / 180;
    const grad = targetCtx.createConicGradient(startAngle, cx, cy);

    const fixedStops = fixTransparentStops(s.stops);
    fixedStops.forEach((cs) => {
      grad.addColorStop(
        clamp(cs.pos / 100, 0, 1),
        rgba(cs.color, cs.opacity / 100)
      );
    });

    targetCtx.fillStyle = grad;
    targetCtx.fillRect(0, 0, width, height);
  }
}
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

// ========== BLEND MODE HELPER ==========
function getCanvasBlendMode(cssBlendMode) {
  // CSS 'normal' = Canvas 'source-over'
  if (!cssBlendMode || cssBlendMode === 'normal') {
    return 'source-over';
  }
  return cssBlendMode;
}

function fixTransparentStops(stops) {
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  const result = [];
  
  for (let i = 0; i < sorted.length; i++) {
    const cs = sorted[i];
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    
    if (cs.opacity === 0) {
      // ✅ برای Hard Edge: دو stop شفاف در همان position
      
      if (prev) {
        result.push({
          pos: cs.pos,
          color: prev.color,
          opacity: 0
        });
      }
      
      if (next) {
        result.push({
          pos: cs.pos,  // ✅ همان position - بدون فاصله!
          color: next.color,
          opacity: 0
        });
      }
      
      // اگر تنها stop شفاف است
      if (!prev && !next) {
        result.push(cs);
      }
      
    } else {
      result.push(cs);
    }
  }
  
  return result;
}

function drawGradToCtx(s, targetCtx, width = W, height = H) {
  const cx = s.x * width;
  const cy = s.y * height;

  if (s.type === "radial") {
    const outer = s.size;
    const solidEnd = 1 - s.feather / 100;
    const grad = targetCtx.createRadialGradient(cx, cy, 0, cx, cy, outer);
    const color = rgba(s.color, s.opacity / 100);

    grad.addColorStop(0, color);
    if (solidEnd > 0 && solidEnd < 1) {
      grad.addColorStop(solidEnd, color);
    }
    grad.addColorStop(1, rgba(s.color, 0));

    targetCtx.fillStyle = grad;
    targetCtx.beginPath();
    targetCtx.arc(cx, cy, outer, 0, Math.PI * 2);
    targetCtx.fill();
  } 
  else if (s.type === "linear") {
    const { x1, y1, x2, y2 } = getLinearGradientPoints(s.angle, width, height);
    const grad = targetCtx.createLinearGradient(x1, y1, x2, y2);

    const fixedStops = fixTransparentStops(s.stops);
    fixedStops.forEach((cs) => {
      grad.addColorStop(
        clamp(cs.pos / 100, 0, 1),
        rgba(cs.color, cs.opacity / 100)
      );
    });

    targetCtx.fillStyle = grad;
    targetCtx.fillRect(0, 0, width, height);
  } 
  else if (s.type === "conic") {
    const startAngle = ((s.startAngle - 90) * Math.PI) / 180;
    const grad = targetCtx.createConicGradient(startAngle, cx, cy);

    const fixedStops = fixTransparentStops(s.stops);
    fixedStops.forEach((cs) => {
      grad.addColorStop(
        clamp(cs.pos / 100, 0, 1),
        rgba(cs.color, cs.opacity / 100)
      );
    });

    targetCtx.fillStyle = grad;
    targetCtx.fillRect(0, 0, width, height);
  }
}

function drawGradToContext(s, targetCtx, width, height) {
  const cx = s.x * width;
  const cy = s.y * height;

  if (s.type === "radial") {
    const outer = s.size;
    const solidEnd = 1 - s.feather / 100;
    const grad = targetCtx.createRadialGradient(cx, cy, 0, cx, cy, outer);
    const color = rgba(s.color, s.opacity / 100);

    grad.addColorStop(0, color);
    if (solidEnd > 0 && solidEnd < 1) {
      grad.addColorStop(solidEnd, color);
    }
    grad.addColorStop(1, rgba(s.color, 0));

    targetCtx.fillStyle = grad;
    targetCtx.beginPath();
    targetCtx.arc(cx, cy, outer, 0, Math.PI * 2);
    targetCtx.fill();
  } 
  else if (s.type === "linear") {
    const { x1, y1, x2, y2 } = getLinearGradientPoints(s.angle, width, height);
    const grad = targetCtx.createLinearGradient(x1, y1, x2, y2);

    [...s.stops]
      .sort((a, b) => a.pos - b.pos)
      .forEach((cs) => {
        grad.addColorStop(
          clamp(cs.pos / 100, 0, 1),
          rgba(cs.color, cs.opacity / 100)
        );
      });

    targetCtx.fillStyle = grad;
    targetCtx.fillRect(0, 0, width, height);
  } 
  else if (s.type === "conic") {
    const startAngle = ((s.startAngle - 90) * Math.PI) / 180;
    const grad = targetCtx.createConicGradient(startAngle, cx, cy);

    [...s.stops]
      .sort((a, b) => a.pos - b.pos)
      .forEach((cs) => {
        grad.addColorStop(
          clamp(cs.pos / 100, 0, 1),
          rgba(cs.color, cs.opacity / 100)
        );
      });

    targetCtx.fillStyle = grad;
    targetCtx.fillRect(0, 0, width, height);
  }
}

function drawGradToContext(s, targetCtx) {
  const cx = s.x * W;
  const cy = s.y * H;

  if (s.type === "radial") {
    const outer = s.size;
    const solidEnd = 1 - s.feather / 100;
    const grad = targetCtx.createRadialGradient(cx, cy, 0, cx, cy, outer);
    const color = rgba(s.color, s.opacity / 100);

    grad.addColorStop(0, color);
    if (solidEnd > 0 && solidEnd < 1) {
      grad.addColorStop(solidEnd, color);
    }
    grad.addColorStop(1, rgba(s.color, 0));

    targetCtx.fillStyle = grad;
    targetCtx.beginPath();
    targetCtx.arc(cx, cy, outer, 0, Math.PI * 2);
    targetCtx.fill();
  } 
  else if (s.type === "linear") {
    const { x1, y1, x2, y2 } = getLinearGradientPoints(s.angle, W, H);
    const grad = targetCtx.createLinearGradient(x1, y1, x2, y2);

    [...s.stops]
      .sort((a, b) => a.pos - b.pos)
      .forEach((cs) => {
        grad.addColorStop(
          clamp(cs.pos / 100, 0, 1),
          rgba(cs.color, cs.opacity / 100)
        );
      });

    targetCtx.fillStyle = grad;
    targetCtx.fillRect(0, 0, W, H);
  } 
  else if (s.type === "conic") {
    const startAngle = ((s.startAngle - 90) * Math.PI) / 180;
    const grad = targetCtx.createConicGradient(startAngle, cx, cy);

    [...s.stops]
      .sort((a, b) => a.pos - b.pos)
      .forEach((cs) => {
        grad.addColorStop(
          clamp(cs.pos / 100, 0, 1),
          rgba(cs.color, cs.opacity / 100)
        );
      });

    targetCtx.fillStyle = grad;
    targetCtx.fillRect(0, 0, W, H);
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

  const sortedStops = [...s.stops].sort((a, b) => a.pos - b.pos);
  const finalStops = [];
  
  for (let i = 0; i < sortedStops.length; i++) {
    const cs = sortedStops[i];
    
    if (cs.opacity === 0) {
      const prev = sortedStops[i - 1];
      const next = sortedStops[i + 1];
      
      // شفاف با رنگ قبلی
      if (prev) {
        finalStops.push({
          pos: cs.pos,
          color: prev.color,
          opacity: 0
        });
      }
      
      // شفاف با رنگ بعدی
      if (next && (!prev || next.color !== prev.color)) {
        finalStops.push({
          pos: cs.pos + 0.001,
          color: next.color,
          opacity: 0
        });
      }
      
      // اگه اولین یا آخرین stop بود
      if (!prev && next) {
        finalStops.push({ pos: cs.pos, color: next.color, opacity: 0 });
      }
      if (!next && prev) {
        finalStops.push({ pos: cs.pos, color: prev.color, opacity: 0 });
      }
    } else {
      finalStops.push(cs);
    }
  }

  finalStops.sort((a, b) => a.pos - b.pos);

  finalStops.forEach((cs) => {
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

  const sortedStops = [...s.stops].sort((a, b) => a.pos - b.pos);
  const finalStops = [];
  const len = sortedStops.length;

  for (let i = 0; i < len; i++) {
    const cs = sortedStops[i];
    const prev = sortedStops[(i - 1 + len) % len];
    const next = sortedStops[(i + 1) % len];

    if (cs.opacity === 0) {
      // ✅ مرز تیز: دو stop شفاف دقیقاً در یک pos
      if (prev) {
        finalStops.push({
          pos: cs.pos,
          color: prev.color,
          opacity: 0
        });
      }

      if (next && (!prev || next.color !== prev.color)) {
        finalStops.push({
          pos: cs.pos,
          color: next.color,
          opacity: 0
        });
      }
    } else {
      finalStops.push(cs);
    }
  }

  finalStops.sort((a, b) => a.pos - b.pos);

  finalStops.forEach(cs => {
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
    ctx.strokeStyle = sel ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.4)";
    ctx.setLineDash([5 * scale, 5 * scale]);
    ctx.lineWidth = 2 * scale;
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
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(rotateX, rotateY);
  ctx.stroke();
  ctx.restore();

  // ✅ ۳. هندل چرخش در انتهای خط شعاعی
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 6 * scale;
  ctx.shadowOffsetY = 2 * scale;


  // ۴. رسم Color Stops
  s.stops.forEach((cs) => {
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

  drawCenterHandle(cx, cy, sel, handleSize, lineWidth, scale, s.stops[0]?.color);
}
let drawRAF = null;

function throttledDraw() {
  if (drawRAF) return;
  drawRAF = requestAnimationFrame(() => {
    drawRAF = null;
    draw();
  });
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

// ========== PAN ==========
const panState = {
  active: false,
  startX: 0,
  startY: 0,
  scrollLeft: 0,
  scrollTop: 0,
  mode: false // true = pan mode فعال
};

function initPan() {
  const wrap = document.querySelector('.canvas-wrap');
  const canvas = document.getElementById('canvas');
  if (!wrap || !canvas) return;

  // ✅ دکمه Pan
  const panBtn = document.getElementById('panBtn');
  if (panBtn) {
    panBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePanMode();
    });
    
    panBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePanMode();
    }, { passive: false });
  }

  // ========== MOUSE - فقط روی Canvas ==========
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && panState.mode)) {
      e.preventDefault();
      e.stopPropagation();
      startPan(e.clientX, e.clientY, wrap);
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (panState.active) {
      e.preventDefault();
      doPan(e.clientX, e.clientY, wrap);
    }
  });

  document.addEventListener('mouseup', () => {
    endPan(wrap);
  });

  // Space + drag (desktop)
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.target.closest('input, textarea')) {
      e.preventDefault();
      panState.mode = true;
      updatePanUI();
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      panState.mode = false;
      updatePanUI();
    }
  });

  // ========== TOUCH - فقط روی Canvas ==========
  canvas.addEventListener('touchstart', (e) => {
    if (panState.mode && e.touches.length === 1) {
      e.preventDefault();
      e.stopPropagation();
      startPan(e.touches[0].clientX, e.touches[0].clientY, wrap);
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (panState.active && e.touches.length === 1) {
      e.preventDefault();
      doPan(e.touches[0].clientX, e.touches[0].clientY, wrap);
    }
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    endPan(wrap);
  });

  canvas.addEventListener('touchcancel', () => {
    endPan(wrap);
  });
}

function startPan(x, y, wrap) {
  panState.active = true;
  panState.startX = x;
  panState.startY = y;
  panState.scrollLeft = wrap.scrollLeft;
  panState.scrollTop = wrap.scrollTop;
  wrap.classList.add('panning');
}

function doPan(x, y, wrap) {
  if (!panState.active) return;
  
  const dx = x - panState.startX;
  const dy = y - panState.startY;
  
  wrap.scrollLeft = panState.scrollLeft - dx;
  wrap.scrollTop = panState.scrollTop - dy;
}

function endPan(wrap) {
  panState.active = false;
  wrap.classList.remove('panning');
}

function togglePanMode() {
  panState.mode = !panState.mode;
  updatePanUI();
}

function updatePanUI() {
  const wrap = document.querySelector('.canvas-wrap');
  const canvas = document.getElementById('canvas');
  const btn = document.getElementById('panBtn');
  
  if (wrap) {
    wrap.style.cursor = panState.mode ? 'grab' : '';
  }
  
  if (canvas) {
    canvas.style.cursor = panState.mode ? 'grab' : 'crosshair';
  }
  
  if (btn) {
    btn.classList.toggle('active', panState.mode);
    btn.innerHTML = panState.mode
      ? `<img src="./icon/pan.svg" alt="pan tool">`
      : `<img src="./icon/hand.svg" alt="pan tool">`;
  }
  
}
window.togglePanMode = togglePanMode;

// ========== FULLSCREEN PREVIEW - COMPLETE FIXED ==========
let fullscreenOverlay = null;
let fullscreenCanvas = null;
let fullscreenCtx = null;
let fullscreenRotation = 0;

const fullscreenZoom = {
  scale: 1,
  minScale: 0.5,
  maxScale: 10,
  translateX: 0,
  translateY: 0,
  
  isPinching: false,
  isPanning: false,
  startDist: 0,
  startScale: 1,
  startX: 0,
  startY: 0,
  startTranslateX: 0,
  startTranslateY: 0,
  pinchCenterX: 0,
  pinchCenterY: 0,
  lastTap: 0,
  lastTapX: 0,
  lastTapY: 0,
};

async function openFullscreenPreview() {
  // ریست
  fullscreenRotation = 0;
  Object.assign(fullscreenZoom, {
    scale: 1,
    translateX: 0,
    translateY: 0,
    isPinching: false,
    isPanning: false,
  });
  
  // History برای Back
  history.pushState({ fullscreen: true }, '', '');
  
  // ساخت overlay
  fullscreenOverlay = document.createElement('div');
  fullscreenOverlay.className = 'fullscreen-overlay';
  fullscreenOverlay.innerHTML = `
    <div class="fullscreen-canvas-container" id="fsContainer">
      <canvas id="fullscreenCanvas"></canvas>
    </div>
    <div class="fullscreen-controls">
      <button class="fullscreen-btn" id="fsZoomOut" title="Zoom Out">
      <img src="./icon/minus.svg" alt="zoom out">
      </button>
      <span class="fullscreen-zoom-value" id="fsZoomValue">100%</span>
      <button class="fullscreen-btn" id="fsZoomIn" title="Zoom In">
      <img src="./icon/plus.svg" alt="zoom in">
      </button>
      <div class="fullscreen-divider"></div>
      <button class="fullscreen-btn" id="fsRotate" title="Rotate (R)">
<img src="./icon/reset.svg" alt="rotate">
      </button>
      <button class="fullscreen-btn" id="fsReset" title="Reset (0)">
<img src="./icon/fit.svg" alt="fit">
      </button>
      <button class="fullscreen-btn" id="fsClose" title="Close (ESC)">
<img src="./icon/full-screen-exit.svg" alt="fullscreen exit">
        </svg>
      </button>
    </div>
    <div class="fullscreen-info" id="fullscreenInfo">
      ${Math.round(state.canvasWidth)} × ${Math.round(state.canvasHeight)}
    </div>
  `;
  
  document.body.appendChild(fullscreenOverlay);
  document.body.style.overflow = 'hidden';
  
  fullscreenCanvas = document.getElementById('fullscreenCanvas');
  fullscreenCtx = fullscreenCanvas.getContext('2d');
  
  const container = document.getElementById('fsContainer');
  
  // ✅ رندر و منتظر بمون
  await renderFullscreenCanvas();
  
  // Event Listeners
  fullscreenOverlay.addEventListener('click', (e) => {
    if (e.target === fullscreenOverlay) history.back();
  });
  
  document.getElementById('fsClose').addEventListener('click', () => history.back());
  document.getElementById('fsRotate').addEventListener('click', rotateFullscreen);
  document.getElementById('fsReset').addEventListener('click', resetFullscreenView);
  document.getElementById('fsZoomIn').addEventListener('click', () => zoomFullscreen(1.5, null, null));
  document.getElementById('fsZoomOut').addEventListener('click', () => zoomFullscreen(0.67, null, null));
  
  document.addEventListener('keydown', handleFullscreenKeys);
  window.addEventListener('popstate', handleFullscreenPopState);
  
  container.addEventListener('touchstart', handleFSTouchStart, { passive: false });
  container.addEventListener('touchmove', handleFSTouchMove, { passive: false });
  container.addEventListener('touchend', handleFSTouchEnd, { passive: false });
  container.addEventListener('touchcancel', handleFSTouchEnd, { passive: false });
  
  container.addEventListener('wheel', handleFSWheel, { passive: false });
  container.addEventListener('mousedown', handleFSMouseDown);
  container.addEventListener('dblclick', handleFSDoubleClick);
  document.addEventListener('mousemove', handleFSMouseMove);
  document.addEventListener('mouseup', handleFSMouseUp);
  
  window.addEventListener('resize', handleFSResize);
  
  // انیمیشن
  requestAnimationFrame(() => {
    fullscreenOverlay.classList.add('show');
    setTimeout(() => {
      const hint = document.getElementById('fullscreenHint');
      if (hint) hint.classList.add('hide');
    }, 3000);
  });
}

function closeFullscreenPreview() {
  if (!fullscreenOverlay) return;
  
  document.removeEventListener('keydown', handleFullscreenKeys);
  window.removeEventListener('popstate', handleFullscreenPopState);
  window.removeEventListener('resize', handleFSResize);
  document.removeEventListener('mousemove', handleFSMouseMove);
  document.removeEventListener('mouseup', handleFSMouseUp);
  
  fullscreenOverlay.classList.remove('show');
  
  setTimeout(() => {
    if (fullscreenOverlay?.parentNode) {
      fullscreenOverlay.parentNode.removeChild(fullscreenOverlay);
    }
    fullscreenOverlay = null;
    fullscreenCanvas = null;
    fullscreenCtx = null;
    fullscreenRotation = 0;
  }, 300);
  
  document.body.style.overflow = '';
}

function handleFullscreenPopState() {
  if (fullscreenOverlay) closeFullscreenPreview();
}

function handleFullscreenKeys(e) {
  if (!fullscreenOverlay) return;
  
  switch(e.key) {
    case 'Escape': e.preventDefault(); history.back(); break;
    case 'r': case 'R': e.preventDefault(); rotateFullscreen(); break;
    case '+': case '=': e.preventDefault(); zoomFullscreen(1.25, null, null); break;
    case '-': case '_': e.preventDefault(); zoomFullscreen(0.8, null, null); break;
    case '0': e.preventDefault(); resetFullscreenView(); break;
  }
}

async function renderFullscreenCanvas() {
  if (!fullscreenCanvas) return;
  
  const originalW = state.canvasWidth;
  const originalH = state.canvasHeight;
  
  // ========== محاسبه ابعاد نمایش ==========
  const isRotated = fullscreenRotation === 90 || fullscreenRotation === 270;
  const sourceW = isRotated ? originalH : originalW;
  const sourceH = isRotated ? originalW : originalH;
  
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  const scaleX = vpW / sourceW;
  const scaleY = vpH / sourceH;
  const fitScale = Math.min(scaleX, scaleY, 1); // حداکثر 100%
  
  const dispW = sourceW * fitScale;
  const dispH = sourceH * fitScale;
  
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  
  // ========== تنظیم سایز canvas نمایش ==========
  fullscreenCanvas.width = dispW * dpr;
  fullscreenCanvas.height = dispH * dpr;
  fullscreenCanvas.style.width = dispW + 'px';
  fullscreenCanvas.style.height = dispH + 'px';
  
  // ========== رندر در ابعاد اصلی (بدون چرخش) ==========
  const workCanvas = document.createElement('canvas');
  workCanvas.width = originalW;
  workCanvas.height = originalH;
  const workCtx = workCanvas.getContext('2d');
  
  // ✅ استفاده از همان منطق draw()
  await renderSceneToContext(workCtx, originalW, originalH);
  
  // ========== انتقال به canvas نمایش با چرخش ==========
  const ctx = fullscreenCanvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, fullscreenCanvas.width, fullscreenCanvas.height);
  
  ctx.save();
  
  // چرخش و مقیاس
  if (fullscreenRotation === 0) {
    ctx.scale(dispW / originalW * dpr, dispH / originalH * dpr);
    ctx.drawImage(workCanvas, 0, 0);
  } 
  else if (fullscreenRotation === 90) {
    ctx.translate(dispW * dpr, 0);
    ctx.rotate(Math.PI / 2);
    ctx.scale(dispH / originalW * dpr, dispW / originalH * dpr);
    ctx.drawImage(workCanvas, 0, 0);
  } 
  else if (fullscreenRotation === 180) {
    ctx.translate(dispW * dpr, dispH * dpr);
    ctx.rotate(Math.PI);
    ctx.scale(dispW / originalW * dpr, dispH / originalH * dpr);
    ctx.drawImage(workCanvas, 0, 0);
  } 
  else if (fullscreenRotation === 270) {
    ctx.translate(0, dispH * dpr);
    ctx.rotate(-Math.PI / 2);
    ctx.scale(dispH / originalW * dpr, dispW / originalH * dpr);
    ctx.drawImage(workCanvas, 0, 0);
  }
  
  ctx.restore();
}

// ========== تابع اصلی رندر - مشترک بین canvas و fullscreen ==========
async function renderSceneToContext(targetCtx, width, height) {
  // ذخیره W و H اصلی
  const savedW = W;
  const savedH = H;
  
  // تنظیم موقت برای رندر
  W = width;
  H = height;
  
  targetCtx.clearRect(0, 0, width, height);
  
  const visibleStops = state.stops.filter(s => s.visible);
  const needsFilter = hasActiveFilters();
  
  let renderCtx = targetCtx;
  let tempCanvas = null;
  
  // اگر فیلتر داریم، روی canvas موقت رندر کن
  if (needsFilter) {
    tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    renderCtx = tempCanvas.getContext('2d');
  }
  
  // ========== 1. پس‌زمینه ==========
  if (state.bgEnabled) {
    renderCtx.fillStyle = rgba(state.bgColor, state.bgAlpha / 100);
    renderCtx.fillRect(0, 0, width, height);
  }
  
  // ========== 2. خط قفل عمودی ==========
  if (state.lockVertical) {
    const scale = Math.max(width, height) / 800;
    renderCtx.strokeStyle = "rgba(255,255,255,0.5)";
    renderCtx.lineWidth = 2 * scale;
    renderCtx.setLineDash([10 * scale, 5 * scale]);
    renderCtx.beginPath();
    renderCtx.moveTo(0, height / 2);
    renderCtx.lineTo(width, height / 2);
    renderCtx.stroke();
    renderCtx.setLineDash([]);
  }
  
  // ========== 3. گرادینت‌ها (ترتیب معکوس) ==========
  if (visibleStops.length > 0) {
    const reversedStops = [...visibleStops].reverse();
    
    reversedStops.forEach(s => {
      renderCtx.globalCompositeOperation = s.blendMode || 'screen';
      drawGradToCtxGeneric(s, renderCtx, width, height);
    });
    
    renderCtx.globalCompositeOperation = 'source-over';
  }
  
  // ========== 4. فیلترها ==========
  if (needsFilter && tempCanvas) {
    // Blur
    if (filterState.blur > 0) {
      const blurCanvas = document.createElement('canvas');
      blurCanvas.width = width;
      blurCanvas.height = height;
      const blurCtx = blurCanvas.getContext('2d');
      blurCtx.filter = `blur(${filterState.blur}px)`;
      blurCtx.drawImage(tempCanvas, 0, 0);
      tempCanvas = blurCanvas;
      renderCtx = blurCanvas.getContext('2d');
    }
    
    // سایر فیلترها
    if (hasNonBlurFilters()) {
      const imageData = renderCtx.getImageData(0, 0, width, height);
      applyFiltersToImageData(imageData);
      renderCtx.putImageData(imageData, 0, 0);
    }
    
    // کپی به context اصلی
    targetCtx.drawImage(tempCanvas, 0, 0);
  }
  
  // ========== 5. نویز ==========
  if (noiseState.enabled && noiseState.opacity > 0) {
    const noiseCanvas = await getNoiseCanvas(
      width,
      height,
      noiseState.frequency
    );
  
    if (noiseCanvas) {
      targetCtx.save();
      targetCtx.globalCompositeOperation = noiseState.blend;
      targetCtx.globalAlpha = noiseState.opacity / 100;
      targetCtx.drawImage(noiseCanvas, 0, 0, width, height);
      targetCtx.restore();
    }
  }
  
  
  
  // برگرداندن W و H
  W = savedW;
  H = savedH;
}

// ========== رسم گرادینت روی هر context با ابعاد دلخواه ==========
function drawGradToCtxGeneric(s, ctx, width, height) {
  const cx = s.x * width;
  const cy = s.y * height;

  if (s.type === "radial") {
    // مقیاس‌بندی سایز بر اساس نسبت ابعاد
    const sizeScale = Math.max(width, height) / Math.max(W || 800, H || 600);
    const scaledSize = s.size * sizeScale;
    
    const solidEnd = 1 - s.feather / 100;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scaledSize);
    const color = rgba(s.color, s.opacity / 100);

    grad.addColorStop(0, color);
    if (solidEnd > 0 && solidEnd < 1) {
      grad.addColorStop(solidEnd, color);
    }
    grad.addColorStop(1, rgba(s.color, 0));

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, scaledSize, 0, Math.PI * 2);
    ctx.fill();
  } 
  else if (s.type === "linear") {
    const angleRad = ((s.angle - 90) * Math.PI) / 180;
    const diagonal = Math.hypot(width, height);
    const mx = width / 2;
    const my = height / 2;
    const dx = (Math.cos(angleRad) * diagonal) / 2;
    const dy = (Math.sin(angleRad) * diagonal) / 2;
    
    const grad = ctx.createLinearGradient(mx - dx, my - dy, mx + dx, my + dy);

    const fixedStops = fixTransparentStops(s.stops);
    fixedStops.forEach((cs) => {
      grad.addColorStop(
        clamp(cs.pos / 100, 0, 1),
        rgba(cs.color, cs.opacity / 100)
      );
    });

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  } 
  else if (s.type === "conic") {
    const startAngle = ((s.startAngle - 90) * Math.PI) / 180;
    const grad = ctx.createConicGradient(startAngle, cx, cy);

    const fixedStops = fixTransparentStops(s.stops);
    fixedStops.forEach((cs) => {
      grad.addColorStop(
        clamp(cs.pos / 100, 0, 1),
        rgba(cs.color, cs.opacity / 100)
      );
    });

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }
}

// ========== DRAW GRADIENT FOR FULLSCREEN ==========
function drawGradientForFullscreen(s, ctx, W, H, sizeScale) {
  const cx = s.x * W;
  const cy = s.y * H;
  
  if (s.type === 'radial') {
    const scaledSize = s.size * sizeScale;
    const solidEnd = 1 - (s.feather || 60) / 100;
    
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scaledSize);
    const color = rgba(s.color, s.opacity / 100);
    
    grad.addColorStop(0, color);
    if (solidEnd > 0 && solidEnd < 1) {
      grad.addColorStop(solidEnd, color);
    }
    grad.addColorStop(1, rgba(s.color, 0));
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, scaledSize, 0, Math.PI * 2);
    ctx.fill();
  } 
  else if (s.type === 'linear') {
    const angleRad = ((s.angle - 90) * Math.PI) / 180;
    const diagonal = Math.hypot(W, H);
    const midX = W / 2;
    const midY = H / 2;
    const dx = (Math.cos(angleRad) * diagonal) / 2;
    const dy = (Math.sin(angleRad) * diagonal) / 2;
    
    const grad = ctx.createLinearGradient(midX - dx, midY - dy, midX + dx, midY + dy);
    
    const stops = s.stops || [];
    [...stops].sort((a, b) => a.pos - b.pos).forEach(cs => {
      grad.addColorStop(
        Math.max(0, Math.min(1, cs.pos / 100)),
        rgba(cs.color, cs.opacity / 100)
      );
    });
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  } 
  else if (s.type === 'conic') {
    const startAngle = ((s.startAngle - 90) * Math.PI) / 180;
    const grad = ctx.createConicGradient(startAngle, cx, cy);
    
    const stops = s.stops || [];
    [...stops].sort((a, b) => a.pos - b.pos).forEach(cs => {
      grad.addColorStop(
        Math.max(0, Math.min(1, cs.pos / 100)),
        rgba(cs.color, cs.opacity / 100)
      );
    });
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
}

// ========== RENDER GRADIENT - FIXED ==========
function renderGradientFS(s, ctx, W, H, sizeScale) {
  const cx = s.x * W;
  const cy = s.y * H;
  
  ctx.save();
  
  if (s.type === 'radial') {
    const scaledSize = s.size * sizeScale;
    const solidEnd = 1 - (s.feather || 60) / 100;
    
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scaledSize);
    const col = rgbaColor(s.color, s.opacity / 100);
    
    grad.addColorStop(0, col);
    if (solidEnd > 0 && solidEnd < 1) {
      grad.addColorStop(solidEnd, col);
    }
    grad.addColorStop(1, rgbaColor(s.color, 0));
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, scaledSize, 0, Math.PI * 2);
    ctx.fill();
  } 
  else if (s.type === 'linear') {
    const angle = ((s.angle || 0) - 90) * Math.PI / 180;
    const diagonal = Math.hypot(W, H);
    const midX = W / 2;
    const midY = H / 2;
    const dx = Math.cos(angle) * diagonal / 2;
    const dy = Math.sin(angle) * diagonal / 2;
    
    const grad = ctx.createLinearGradient(midX - dx, midY - dy, midX + dx, midY + dy);
    
    const stops = s.stops || [
      { pos: 0, color: '#ff0000', opacity: 100 },
      { pos: 100, color: '#0000ff', opacity: 100 }
    ];
    
    [...stops].sort((a, b) => a.pos - b.pos).forEach(cs => {
      grad.addColorStop(
        Math.max(0, Math.min(1, cs.pos / 100)),
        rgbaColor(cs.color, cs.opacity / 100)
      );
    });
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  } 
  else if (s.type === 'conic') {
    const startAngle = ((s.startAngle || 0) - 90) * Math.PI / 180;
    
    const grad = ctx.createConicGradient(startAngle, cx, cy);
    
    const stops = s.stops || [
      { pos: 0, color: '#ff0000', opacity: 100 },
      { pos: 100, color: '#0000ff', opacity: 100 }
    ];
    
    [...stops].sort((a, b) => a.pos - b.pos).forEach(cs => {
      grad.addColorStop(
        Math.max(0, Math.min(1, cs.pos / 100)),
        rgbaColor(cs.color, cs.opacity / 100)
      );
    });
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
  
  ctx.restore();
}

// ========== RGBA HELPER - LOCAL ==========
function rgbaColor(hex, alpha) {
  // اگر تابع rgba وجود داره ازش استفاده کن
  if (typeof rgba === 'function') {
    return rgba(hex, alpha);
  }
  
  // fallback
  hex = hex || '#000000';
  hex = hex.replace('#', '');
  
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ========== ZOOM FUNCTIONS ==========
function zoomFullscreen(factor, clientX, clientY) {
  const container = document.getElementById('fsContainer');
  if (!container || !fullscreenCanvas) return;
  
  const containerRect = container.getBoundingClientRect();
  const canvasRect = fullscreenCanvas.getBoundingClientRect();
  
  const oldScale = fullscreenZoom.scale;
  const newScale = Math.max(
    fullscreenZoom.minScale,
    Math.min(fullscreenZoom.maxScale, oldScale * factor)
  );
  
  if (Math.abs(newScale - oldScale) < 0.001) return;
  
  // مرکز پیش‌فرض
  if (clientX === null || clientY === null) {
    clientX = containerRect.left + containerRect.width / 2;
    clientY = containerRect.top + containerRect.height / 2;
  }
  
  // مرکز canvas
  const canvasCenterX = canvasRect.left + canvasRect.width / 2;
  const canvasCenterY = canvasRect.top + canvasRect.height / 2;
  
  const scaleRatio = newScale / oldScale;
  
  fullscreenZoom.translateX = clientX - canvasCenterX - (clientX - canvasCenterX - fullscreenZoom.translateX) * scaleRatio;
  fullscreenZoom.translateY = clientY - canvasCenterY - (clientY - canvasCenterY - fullscreenZoom.translateY) * scaleRatio;
  fullscreenZoom.scale = newScale;
  
  applyFullscreenTransform();
  updateFullscreenZoomUI();
  setTimeout(() => constrainFullscreenPan(), 10);
}

function resetFullscreenView() {
  fullscreenZoom.scale = 1;
  fullscreenZoom.translateX = 0;
  fullscreenZoom.translateY = 0;
  
  applyFullscreenTransform(true);
  updateFullscreenZoomUI();
  updateFullscreenCursor();
}

function applyFullscreenTransform(animate = false) {
  if (!fullscreenCanvas) return;
  
  fullscreenCanvas.style.transition = animate ? 'transform 0.3s ease-out' : 'none';
  fullscreenCanvas.style.transform = `translate(${fullscreenZoom.translateX}px, ${fullscreenZoom.translateY}px) scale(${fullscreenZoom.scale})`;
  
  if (animate) {
    setTimeout(() => {
      if (fullscreenCanvas) fullscreenCanvas.style.transition = 'none';
    }, 300);
  }
}

function constrainFullscreenPan() {
  if (!fullscreenCanvas) return;
  
  const container = document.getElementById('fsContainer');
  if (!container) return;
  
  const containerRect = container.getBoundingClientRect();
  const canvasW = parseFloat(fullscreenCanvas.style.width) || 100;
  const canvasH = parseFloat(fullscreenCanvas.style.height) || 100;
  
  const scaledW = canvasW * fullscreenZoom.scale;
  const scaledH = canvasH * fullscreenZoom.scale;
  
  const maxX = Math.max(0, (scaledW - containerRect.width) / 2);
  const maxY = Math.max(0, (scaledH - containerRect.height) / 2);
  
  let changed = false;
  
  if (scaledW <= containerRect.width) {
    if (fullscreenZoom.translateX !== 0) { fullscreenZoom.translateX = 0; changed = true; }
  } else {
    const clamped = Math.max(-maxX, Math.min(maxX, fullscreenZoom.translateX));
    if (clamped !== fullscreenZoom.translateX) { fullscreenZoom.translateX = clamped; changed = true; }
  }
  
  if (scaledH <= containerRect.height) {
    if (fullscreenZoom.translateY !== 0) { fullscreenZoom.translateY = 0; changed = true; }
  } else {
    const clamped = Math.max(-maxY, Math.min(maxY, fullscreenZoom.translateY));
    if (clamped !== fullscreenZoom.translateY) { fullscreenZoom.translateY = clamped; changed = true; }
  }
  
  if (changed) applyFullscreenTransform(true);
  updateFullscreenCursor();
}

function updateFullscreenZoomUI() {
  const el = document.getElementById('fsZoomValue');
  if (el) el.textContent = Math.round(fullscreenZoom.scale * 100) + '%';
  
  const zoomOut = document.getElementById('fsZoomOut');
  const zoomIn = document.getElementById('fsZoomIn');
  if (zoomOut) zoomOut.disabled = fullscreenZoom.scale <= fullscreenZoom.minScale;
  if (zoomIn) zoomIn.disabled = fullscreenZoom.scale >= fullscreenZoom.maxScale;
}

function updateFullscreenCursor() {
  const container = document.getElementById('fsContainer');
  if (!container) return;
  
  if (fullscreenZoom.isPanning) {
    container.style.cursor = 'grabbing';
  } else if (fullscreenZoom.scale > 1.01) {
    container.style.cursor = 'grab';
  } else {
    container.style.cursor = 'default';
  }
}

// ========== TOUCH ==========
function handleFSTouchStart(e) {
  const container = document.getElementById('fsContainer');
  if (!container) return;
  
  if (e.touches.length === 2) {
    e.preventDefault();
    fullscreenZoom.isPinching = true;
    fullscreenZoom.isPanning = false;
    fullscreenZoom.startDist = getPinchDistance(e.touches);
    fullscreenZoom.startScale = fullscreenZoom.scale;
    fullscreenZoom.startTranslateX = fullscreenZoom.translateX;
    fullscreenZoom.startTranslateY = fullscreenZoom.translateY;
    
    const center = getPinchCenter(e.touches);
    fullscreenZoom.pinchCenterX = center.x;
    fullscreenZoom.pinchCenterY = center.y;
    
  } else if (e.touches.length === 1) {
    const touch = e.touches[0];
    const now = Date.now();
    
    const dx = touch.clientX - fullscreenZoom.lastTapX;
    const dy = touch.clientY - fullscreenZoom.lastTapY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (now - fullscreenZoom.lastTap < 300 && dist < 50) {
      e.preventDefault();
      handleFSDoubleTap(touch.clientX, touch.clientY);
      fullscreenZoom.lastTap = 0;
      return;
    }
    
    fullscreenZoom.lastTap = now;
    fullscreenZoom.lastTapX = touch.clientX;
    fullscreenZoom.lastTapY = touch.clientY;
    
    e.preventDefault();
    fullscreenZoom.isPanning = true;
    fullscreenZoom.startX = touch.clientX;
    fullscreenZoom.startY = touch.clientY;
    fullscreenZoom.startTranslateX = fullscreenZoom.translateX;
    fullscreenZoom.startTranslateY = fullscreenZoom.translateY;
    updateFullscreenCursor();
  }
}

function handleFSTouchMove(e) {
  if (fullscreenZoom.isPinching && e.touches.length === 2) {
    e.preventDefault();
    
    const container = document.getElementById('fsContainer');
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    
    const dist = getPinchDistance(e.touches);
    const scaleFactor = dist / fullscreenZoom.startDist;
    const newScale = Math.max(
      fullscreenZoom.minScale,
      Math.min(fullscreenZoom.maxScale, fullscreenZoom.startScale * scaleFactor)
    );
    
    const center = getPinchCenter(e.touches);
    const canvasCenterX = containerRect.left + containerRect.width / 2;
    const canvasCenterY = containerRect.top + containerRect.height / 2;
    
    const panX = center.x - fullscreenZoom.pinchCenterX;
    const panY = center.y - fullscreenZoom.pinchCenterY;
    const scaleRatio = newScale / fullscreenZoom.startScale;
    const pivotX = fullscreenZoom.pinchCenterX - canvasCenterX;
    const pivotY = fullscreenZoom.pinchCenterY - canvasCenterY;
    
    fullscreenZoom.translateX = fullscreenZoom.startTranslateX - pivotX * (scaleRatio - 1) + panX;
    fullscreenZoom.translateY = fullscreenZoom.startTranslateY - pivotY * (scaleRatio - 1) + panY;
    fullscreenZoom.scale = newScale;
    
    applyFullscreenTransform();
    updateFullscreenZoomUI();
    
  } else if (fullscreenZoom.isPanning && e.touches.length === 1) {
    e.preventDefault();
    const touch = e.touches[0];
    fullscreenZoom.translateX = fullscreenZoom.startTranslateX + (touch.clientX - fullscreenZoom.startX);
    fullscreenZoom.translateY = fullscreenZoom.startTranslateY + (touch.clientY - fullscreenZoom.startY);
    applyFullscreenTransform();
  }
}

function handleFSTouchEnd(e) {
  if (e.touches.length === 0) {
    if (fullscreenZoom.isPinching || fullscreenZoom.isPanning) {
      fullscreenZoom.isPinching = false;
      fullscreenZoom.isPanning = false;
      constrainFullscreenPan();
    }
  } else if (e.touches.length === 1 && fullscreenZoom.isPinching) {
    fullscreenZoom.isPinching = false;
    fullscreenZoom.isPanning = true;
    const touch = e.touches[0];
    fullscreenZoom.startX = touch.clientX;
    fullscreenZoom.startY = touch.clientY;
    fullscreenZoom.startTranslateX = fullscreenZoom.translateX;
    fullscreenZoom.startTranslateY = fullscreenZoom.translateY;
  }
  updateFullscreenCursor();
}

function handleFSDoubleTap(clientX, clientY) {
  if (fullscreenZoom.scale > 1.1) {
    resetFullscreenView();
  } else {
    zoomFullscreen(3, clientX, clientY);
  }
}

// ========== MOUSE ==========
function handleFSWheel(e) {
  e.preventDefault();
  zoomFullscreen(e.deltaY > 0 ? 0.85 : 1.18, e.clientX, e.clientY);
}

function handleFSMouseDown(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  fullscreenZoom.isPanning = true;
  fullscreenZoom.startX = e.clientX;
  fullscreenZoom.startY = e.clientY;
  fullscreenZoom.startTranslateX = fullscreenZoom.translateX;
  fullscreenZoom.startTranslateY = fullscreenZoom.translateY;
  updateFullscreenCursor();
}

function handleFSMouseMove(e) {
  if (!fullscreenZoom.isPanning) return;
  fullscreenZoom.translateX = fullscreenZoom.startTranslateX + (e.clientX - fullscreenZoom.startX);
  fullscreenZoom.translateY = fullscreenZoom.startTranslateY + (e.clientY - fullscreenZoom.startY);
  applyFullscreenTransform();
}

function handleFSMouseUp() {
  if (!fullscreenZoom.isPanning) return;
  fullscreenZoom.isPanning = false;
  constrainFullscreenPan();
}

function handleFSDoubleClick(e) {
  e.preventDefault();
  if (fullscreenZoom.scale > 1.1) {
    resetFullscreenView();
  } else {
    zoomFullscreen(3, e.clientX, e.clientY);
  }
}

// ========== RESIZE ==========
async function handleFSResize() {
  if (!fullscreenCanvas) return;
  await renderFullscreenCanvas();
  resetFullscreenView();
}

// ========== ROTATE ==========
async function rotateFullscreen() {
  fullscreenRotation = (fullscreenRotation + 90) % 360;
  
  fullscreenZoom.scale = 1;
  fullscreenZoom.translateX = 0;
  fullscreenZoom.translateY = 0;
  
  await renderFullscreenCanvas();
  applyFullscreenTransform();
  updateFullscreenZoomUI();
  updateFullscreenCursor();
  
  const info = document.getElementById('fullscreenInfo');
  if (info) {
    const isRotated = fullscreenRotation === 90 || fullscreenRotation === 270;
    const w = isRotated ? state.canvasHeight : state.canvasWidth;
    const h = isRotated ? state.canvasWidth : state.canvasHeight;
    info.textContent = `${Math.round(w)} × ${Math.round(h)}`;
  }
}

// ========== UTILS ==========
function getPinchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function getPinchCenter(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}
window.openFullscreenPreview = openFullscreenPreview;
window.closeFullscreenPreview = closeFullscreenPreview;
window.rotateFullscreen = rotateFullscreen;

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

// ========== ZOOM SYSTEM ==========
function calcDynamicMinZoom() {
  const wrap = document.querySelector(".canvas-wrap");
  if (!wrap) return 10;

  const rect = wrap.getBoundingClientRect();

  const minScaleX = (rect.width - zoomState.paddingX * 2) / state.canvasWidth;
  const minScaleY = (rect.height - zoomState.paddingY * 2) / state.canvasHeight;

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

  const scaleX = (rect.width - zoomState.paddingX * 2) / state.canvasWidth;
  const scaleY = (rect.height - zoomState.paddingY * 2) / state.canvasHeight;
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
  const wrap = document.querySelector(".canvas-wrap");
  if (!wrap) return;

  wrap.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();

        const rect = canvas.getBoundingClientRect();
        const center = {
          x: (e.clientX - rect.left) / (zoomState.current / 100),
          y: (e.clientY - rect.top) / (zoomState.current / 100),
        };

        const delta = e.deltaY > 0 ? -10 : 10;
        setZoom(zoomState.current + delta, center);
      }
    },
    { passive: false }
  );
}

function setupTouchZoom() {
  const wrap = document.querySelector(".canvas-wrap");
  if (!wrap) return;

  let initialPinchDist = 0;
  let initialZoom = 100;

  function getPinchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function getPinchCenter(touches) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  }

  wrap.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        initialPinchDist = getPinchDist(e.touches);
        initialZoom = zoomState.current;
      }
    },
    { passive: false }
  );

  wrap.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();

        const currentDist = getPinchDist(e.touches);
        const scale = currentDist / initialPinchDist;
        const newZoom = Math.round(initialZoom * scale);

        const center = getPinchCenter(e.touches);
        const rect = canvas.getBoundingClientRect();
        const canvasCenter = {
          x: (center.x - rect.left) / (zoomState.current / 100),
          y: (center.y - rect.top) / (zoomState.current / 100),
        };

        setZoom(newZoom, canvasCenter);
      }
    },
    { passive: false }
  );

  wrap.addEventListener("touchend", () => {
    initialPinchDist = 0;
  });
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
        case "p":
  if (!isMod) {
    e.preventDefault();
    openFullscreenPreview();
  }
  break;
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

let lastCanvasW = 0;
let lastCanvasH = 0;
function checkAndFixZoom() {
  if (state.canvasWidth === lastCanvasW && state.canvasHeight === lastCanvasH) {
    return;
  }
  
  lastCanvasW = state.canvasWidth;
  lastCanvasH = state.canvasHeight;

  const wrap = document.querySelector(".canvas-wrap");
  if (!wrap) return;

  const rect = wrap.getBoundingClientRect();
  const scale = zoomState.current / 100;

  const displayWidth = state.canvasWidth * scale;
  const displayHeight = state.canvasHeight * scale;

  const tooLarge =
    displayWidth > rect.width - zoomState.paddingX * 2 ||
    displayHeight > rect.height - zoomState.paddingY * 2;

  const tooSmall =
    displayWidth < (rect.width - zoomState.paddingX * 2) * 0.93 &&
    displayHeight < (rect.height - zoomState.paddingY * 2) * 0.3;

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


function refreshUI() {
  draw();
  renderList();
  renderInspector();
  updateCSS();
  updateBgPreview();
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
    blendMode: 'screen',  // ✅ اضافه شد - پیش‌فرض screen
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

// ========== FILTER ==========
const filterState = {
  enabled: true,
  brightness: 100,
  contrast: 100,    
  saturate: 100,    
  hue: 0,        
  blur: 0,    
  grayscale: 0,      
  sepia: 0,    
  invert: 0,
};

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
    
    if (!slider) return;
    
    const row = slider.closest('.filter-row');
    
    // ✅ Slider events - با History tracking
    slider.addEventListener('mousedown', () => History.onDragStart());
    slider.addEventListener('touchstart', () => History.onDragStart(), { passive: true });
    slider.addEventListener('input', (e) => setFilter(name, e.target.value));
    slider.addEventListener('mouseup', () => History.onDragEnd());
    slider.addEventListener('touchend', () => History.onDragEnd());
    
    // ✅ Number input events - با focus/blur
    if (numInput) {
      numInput.addEventListener('focus', () => History.onInputFocus());
      numInput.addEventListener('blur', () => History.onInputBlur());
      numInput.addEventListener('input', (e) => setFilter(name, e.target.value));
      numInput.addEventListener('change', (e) => setFilter(name, e.target.value));
    }
    
    // Double-click/tap برای ریست
    if (row) {
      // Desktop - dblclick
      row.addEventListener('dblclick', function(e) {
        if (e.target.tagName === 'INPUT') return;
        History.saveState();  // ✅ اضافه شد
        resetSingleFilter(name, row);
      });
      
      // Mobile - double tap
      let lastTap = 0;
      row.addEventListener('touchend', function(e) {
        if (e.target.tagName === 'INPUT') return;
        
        const now = Date.now();
        const DOUBLE_TAP_DELAY = 300;
        
        if (now - lastTap < DOUBLE_TAP_DELAY) {
          e.preventDefault();
          History.saveState();  // ✅ اضافه شد
          resetSingleFilter(name, row);
          lastTap = 0;
        } else {
          lastTap = now;
        }
      });
    }
  });
  
  // Toggle & Reset buttons - اینا توی overrideFunctions هندل میشن
  document.getElementById('filtersToggleBtn')?.addEventListener('click', toggleFilters);
  document.getElementById('filtersResetBtn')?.addEventListener('click', resetFilters);
}

function resetSingleFilter(name, row) {
  // ریست به مقدار پیش‌فرض
  filterState[name] = filterDefaults[name];
  
  // آپدیت UI
  updateFilterUI();
  draw();
  updateCSS();
  
  // انیمیشن فلش سبز
  if (row) {
    setTimeout(() => {
      row.style.backgroundColor = '';
    }, 300);
  }
}

function applyFiltersToImageData(imageData) {
  const data = imageData.data;
  const len = data.length;
  
  // محاسبه مقادیر یک بار
  const brightness = filterState.brightness / 100;
  const contrast = filterState.contrast / 100;
  const saturate = filterState.saturate / 100;
  const grayscale = filterState.grayscale / 100;
  const sepia = filterState.sepia / 100;
  const invert = filterState.invert / 100;
  const hue = filterState.hue;
  
  // Pre-calculate hue rotation matrix
  let hueMatrix = null;
  if (hue !== 0) {
    hueMatrix = getHueRotationMatrix(hue);
  }
  
  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    // alpha = data[i + 3] - don't touch
    
    // ========== ترتیب صحیح - مطابق CSS ==========
    
    // 1. Brightness (اول)
    if (brightness !== 1) {
      r = r * brightness;
      g = g * brightness;
      b = b * brightness;
    }
    
    // 2. Contrast
    if (contrast !== 1) {
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;
    }
    
    // 3. Saturate
    if (saturate !== 1) {
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = gray + (r - gray) * saturate;
      g = gray + (g - gray) * saturate;
      b = gray + (b - gray) * saturate;
    }
    
    // 4. Hue Rotate
    if (hueMatrix) {
      const nr = r * hueMatrix[0] + g * hueMatrix[1] + b * hueMatrix[2];
      const ng = r * hueMatrix[3] + g * hueMatrix[4] + b * hueMatrix[5];
      const nb = r * hueMatrix[6] + g * hueMatrix[7] + b * hueMatrix[8];
      r = nr;
      g = ng;
      b = nb;
    }
    
    // 5. Grayscale
    if (grayscale > 0) {
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = r + (gray - r) * grayscale;
      g = g + (gray - g) * grayscale;
      b = b + (gray - b) * grayscale;
    }
    
    // 6. Sepia
    if (sepia > 0) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = r + (sr - r) * sepia;
      g = g + (sg - g) * sepia;
      b = b + (sb - b) * sepia;
    }
    
    // 7. Invert (آخر - مهم!)
    if (invert > 0) {
      r = r + (255 - 2 * r) * invert;
      g = g + (255 - 2 * g) * invert;
      b = b + (255 - 2 * b) * invert;
    }
    
    // Clamp to 0-255
    data[i]     = Math.max(0, Math.min(255, Math.round(r)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
  }
  
  return imageData;
}

function getHueRotationMatrix(degrees) {
  const rad = degrees * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  
  // Standard hue rotation matrix
  return [
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
}

function applyBlur(ctx, width, height, radius) {
  if (radius <= 0) return;
  
  // از ctx.filter برای blur استفاده می‌کنیم چون سریع‌تره
  const imageData = ctx.getImageData(0, 0, width, height);
  
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.putImageData(imageData, 0, 0);
  
  ctx.clearRect(0, 0, width, height);
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(tempCanvas, 0, 0);
  ctx.filter = 'none';
}
window.setFilter = setFilter;
window.toggleFilters = toggleFilters;
window.resetFilters = resetFilters;


// ========== BACKGROUND CONTROLS ==========
function toggleBackground() {
  state.bgEnabled = !state.bgEnabled;
  updateBgUI();
  draw();
  updateCSS();
}

function setBgBlendMode(mode) {
  state.bgBlendMode = mode;
  draw();
  updateCSS();
}

function updateBgUI() {
  const toggleBtn = document.getElementById('bgToggleBtn');
  const bgControls = document.querySelector('.bg-controls');
  
  if (toggleBtn) {
    const img = toggleBtn.querySelector('img');
    if (img) {
      img.src = state.bgEnabled ? './icon/eye.svg' : './icon/eye-close.svg';
    }
    toggleBtn.classList.toggle('disabled', !state.bgEnabled);
  }
  
  if (bgControls) {
    bgControls.classList.toggle('disabled', !state.bgEnabled);
  }
  
  const blendSelect = document.getElementById('bgBlendMode');
  if (blendSelect) {
    blendSelect.value = state.bgBlendMode;
  }
}

function initBackgroundEvents() {
  // Toggle button
  document.getElementById('bgToggleBtn')?.addEventListener('click', toggleBackground);
  
  // Blend mode select
  document.getElementById('bgBlendMode')?.addEventListener('change', (e) => {
    History.saveState();  // ✅ اضافه شد
    setBgBlendMode(e.target.value);
  });
}
window.toggleBackground = toggleBackground;
window.setBgBlendMode = setBgBlendMode;

// ========== SVG NOISE FILTER SYSTEM ==========
const noiseState = {
  enabled: true,
  opacity: 0,          // 0 - 100
  frequency: 0.65,    // 0.01 - 1
  blend: 'overlay'
};

function getNoiseWrap() {
  return document.querySelector('.canvas-wrap');
}

function applyNoiseFilter() {
  const wrap = getNoiseWrap();
  const turb = document.getElementById('noiseTurbulence');
  if (!wrap || !turb) return;

  if (noiseState.enabled && noiseState.opacity > 0) {
    wrap.style.setProperty('--noise-opacity', noiseState.opacity / 100);
    wrap.style.setProperty('--noise-blend', noiseState.blend);
    turb.setAttribute('baseFrequency', noiseState.frequency);
    wrap.classList.add('noise-enabled');
  } else {
    wrap.style.setProperty('--noise-opacity', 0);
    wrap.classList.remove('noise-enabled');
  }
}

// ========== NOISE CONTROLS ==========
function setNoiseOpacity(value) {
  noiseState.opacity = clamp(parseFloat(value) || 0, 0, 100);
  updateNoiseUI();
  applyNoiseFilter();
  updateCSS();
}

function setNoiseFrequency(value) {
  noiseState.frequency = clamp(parseFloat(value) || 0.65, 0.01, 1);
  updateNoiseUI();
  applyNoiseFilter();
  updateCSS();
}

function setNoiseBlend(value) {
  noiseState.blend = value;
  updateNoiseUI();
  applyNoiseFilter();
  updateCSS();
}

function toggleNoise() {
  noiseState.enabled = !noiseState.enabled;
  updateNoiseUI();
  applyNoiseFilter();
  updateCSS();
}

const noiseCache = {
  canvas: null,
  width: 0,
  height: 0,
  frequency: null,
};

async function getNoiseCanvas(width, height, frequency) {
  // اگر همون نویز قبلیه → همونو بده
  if (
    noiseCache.canvas &&
    noiseCache.width === width &&
    noiseCache.height === height &&
    noiseCache.frequency === frequency
  ) {
    return noiseCache.canvas;
  }

  // ❌ پاک‌سازی نویز قبلی
  if (noiseCache.canvas) {
    noiseCache.canvas.width = 0;
    noiseCache.canvas.height = 0;
    noiseCache.canvas = null;
  }

  // ✅ ساخت نویز جدید
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${width}" height="${height}"
         viewBox="0 0 ${width} ${height}">
      <filter id="n">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="${frequency}"
          numOctaves="4"
          stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
      <rect width="100%" height="100%" filter="url(#n)"/>
    </svg>
  `;

  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const img = new Image();

  return new Promise((resolve) => {
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      c.getContext("2d").drawImage(img, 0, 0);

      URL.revokeObjectURL(url);
      img.src = "";

      // 📌 ذخیره در cache
      noiseCache.canvas = c;
      noiseCache.width = width;
      noiseCache.height = height;
      noiseCache.frequency = frequency;

      resolve(c);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      img.src = "";
      resolve(null);
    };

    img.src = url;
  });
}


// ========== UI SYNC ==========
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

// ========== EVENTS ==========
function initNoiseEvents() {
  const opacityInput = document.getElementById('noiseOpacity');
  const frequencyInput = document.getElementById('noiseFrequency');
  const blendSelect = document.getElementById('noiseBlend');
  const toggleBtn = document.getElementById('noiseToggleBtn');

  // ✅ Opacity - اگه slider هست
  if (opacityInput) {
    if (opacityInput.type === 'range') {
      opacityInput.addEventListener('mousedown', () => History.onDragStart());
      opacityInput.addEventListener('touchstart', () => History.onDragStart(), { passive: true });
      opacityInput.addEventListener('mouseup', () => History.onDragEnd());
      opacityInput.addEventListener('touchend', () => History.onDragEnd());
    } else {
      opacityInput.addEventListener('focus', () => History.onInputFocus());
      opacityInput.addEventListener('blur', () => History.onInputBlur());
    }
    opacityInput.addEventListener('input', e => setNoiseOpacity(e.target.value));
    opacityInput.addEventListener('change', e => setNoiseOpacity(e.target.value));
  }

  // ✅ Frequency - اگه slider هست
  if (frequencyInput) {
    if (frequencyInput.type === 'range') {
      frequencyInput.addEventListener('mousedown', () => History.onDragStart());
      frequencyInput.addEventListener('touchstart', () => History.onDragStart(), { passive: true });
      frequencyInput.addEventListener('mouseup', () => History.onDragEnd());
      frequencyInput.addEventListener('touchend', () => History.onDragEnd());
    } else {
      frequencyInput.addEventListener('focus', () => History.onInputFocus());
      frequencyInput.addEventListener('blur', () => History.onInputBlur());
    }
    frequencyInput.addEventListener('input', e => setNoiseFrequency(e.target.value));
    frequencyInput.addEventListener('change', e => setNoiseFrequency(e.target.value));
  }

  // ✅ Blend select
  if (blendSelect) {
    blendSelect.addEventListener('change', e => {
      History.saveState();
      setNoiseBlend(e.target.value);
    });
  }

  // Toggle - توی overrideFunctions هندل میشه
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleNoise);
  }
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  initNoiseEvents();
  applyNoiseFilter();
});


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

// ========== LAYER DRAG & DROP - TOUCH + MOUSE ==========
(function() {
  // ========== STATE ==========
  const layerDrag = {
    active: false,
    pending: false,
    stopId: null,
    element: null,
    clone: null,
    placeholder: null,
    startX: 0,
    startY: 0,
    offsetY: 0,
    delayTimer: null,
    initialRect: null,
    listRect: null,
    moveHandler: null,
  };

  // ========== CONFIG ==========
  const DRAG_CONFIG = {
    delay: 300,
    scrollThreshold: 12,
  };

  // ========== INIT ==========
  function initLayerDragDrop() {
    const list = document.getElementById("list");
    if (!list) return;

    list.addEventListener('mousedown', onMouseDown);
    list.addEventListener('touchstart', onTouchStart, { passive: true });
  }

  // ========== TOUCH START ==========
  function onTouchStart(e) {
    const stopItem = e.target.closest(".stop-item");
    if (!stopItem) return;
    if (e.touches.length !== 1) return;
    if (!isValidDragTarget(e.target)) return;

    const touch = e.touches[0];
    const rect = stopItem.getBoundingClientRect();
    const list = document.getElementById("list");

    // ذخیره اطلاعات اولیه
    layerDrag.pending = true;
    layerDrag.stopId = stopItem.dataset.id;
    layerDrag.element = stopItem;
    layerDrag.startX = touch.clientX;
    layerDrag.startY = touch.clientY;
    layerDrag.offsetY = touch.clientY - rect.top;
    layerDrag.initialRect = rect;
    layerDrag.listRect = list.getBoundingClientRect();

    // ✅ تایمر: اگر ۳۰۰ms نگه داشت = drag
    layerDrag.delayTimer = setTimeout(() => {
      if (layerDrag.pending) {
        activateDrag();
      }
    }, DRAG_CONFIG.delay);

    // ✅ فقط touchend برای کنسل کردن اگر زود برداشت
    document.addEventListener('touchend', onTouchEndEarly, { passive: true });
    document.addEventListener('touchcancel', onTouchEndEarly, { passive: true });
    
    // ✅ touchmove با passive برای تشخیص اسکرول
    document.addEventListener('touchmove', onTouchMoveCheck, { passive: true });
  }

  // ========== CHECK SCROLL ==========
  function onTouchMoveCheck(e) {
    if (!layerDrag.pending || layerDrag.active) return;

    const touch = e.touches[0];
    const dy = Math.abs(touch.clientY - layerDrag.startY);
    const dx = Math.abs(touch.clientX - layerDrag.startX);

    // ✅ کاربر داره اسکرول می‌کنه - کنسل کن
    if (dy > DRAG_CONFIG.scrollThreshold || dx > DRAG_CONFIG.scrollThreshold) {
      cancelPending();
    }
  }

  // ========== EARLY TOUCH END ==========
  function onTouchEndEarly() {
    if (layerDrag.pending && !layerDrag.active) {
      cancelPending();
    }
  }

  // ========== CANCEL PENDING ==========
  function cancelPending() {
    clearTimeout(layerDrag.delayTimer);
    
    document.removeEventListener('touchmove', onTouchMoveCheck);
    document.removeEventListener('touchend', onTouchEndEarly);
    document.removeEventListener('touchcancel', onTouchEndEarly);

    layerDrag.pending = false;
    layerDrag.element = null;
    layerDrag.stopId = null;
  }

  // ========== ACTIVATE DRAG ==========
  function activateDrag() {
    if (layerDrag.active || !layerDrag.element) return;

    // حذف listener های قبلی
    document.removeEventListener('touchmove', onTouchMoveCheck);
    document.removeEventListener('touchend', onTouchEndEarly);
    document.removeEventListener('touchcancel', onTouchEndEarly);

    layerDrag.pending = false;
    layerDrag.active = true;

    const stopItem = layerDrag.element;
    const rect = layerDrag.initialRect;

    // ✅ ایجاد clone
    layerDrag.clone = stopItem.cloneNode(true);
    layerDrag.clone.classList.add('drag-clone');
    layerDrag.clone.style.cssText = `
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.top}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      z-index: 10000;
      pointer-events: none;
      opacity: 0.95;
      box-shadow: 0 15px 50px rgba(0,0,0,0.5);
      transform: scale(1.03);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      border-radius: 8px;
      background: var(--TransParent-bg, rgba(30,30,30,0.95));
      backdrop-filter: blur(6px);
      border: 2px solid var(--border, #444);
    `;
    document.body.appendChild(layerDrag.clone);

    // ✅ ایجاد placeholder
    layerDrag.placeholder = document.createElement('div');
    layerDrag.placeholder.className = 'drag-placeholder';
    layerDrag.placeholder.style.cssText = `
      height: ${rect.height}px;
      margin: 4px 0;
      border: 2px dashed var(--border, #444);
      border-radius: 8px;
      background: var(--accent);
      opacity: 0.3;
      transition: height 0.2s ease;
    `;

    // مخفی کردن اصلی
    stopItem.classList.add('drag-original');
    stopItem.style.cssText = 'opacity:0; height:0; margin:0; padding:0; overflow:hidden;';
    stopItem.parentNode.insertBefore(layerDrag.placeholder, stopItem);

    // بلاک کردن اسکرول
    document.body.style.userSelect = 'none';
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    // ✅ حالا listener های drag اضافه کن
    document.addEventListener('touchmove', onDragMove, { passive: false });
    document.addEventListener('touchend', onDragEnd);
    document.addEventListener('touchcancel', onDragEnd);

    // فیدبک هپتیک
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }

  // ========== DRAG MOVE ==========
  function onDragMove(e) {
    if (!layerDrag.active || !layerDrag.clone) return;

    e.preventDefault();
    e.stopPropagation();

    const touch = e.touches[0];
    const newTop = touch.clientY - layerDrag.offsetY;
    layerDrag.clone.style.top = newTop + 'px';

    updatePlaceholderPosition(touch.clientY);
  }

  // ========== DRAG END ==========
  function onDragEnd() {
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('touchend', onDragEnd);
    document.removeEventListener('touchcancel', onDragEnd);

    if (!layerDrag.active) {
      cleanup();
      return;
    }

    // انیمیشن برگشت
    if (layerDrag.clone && layerDrag.placeholder) {
      const placeholderRect = layerDrag.placeholder.getBoundingClientRect();

      layerDrag.clone.style.transition = 'all 0.25s ease';
      layerDrag.clone.style.top = placeholderRect.top + 'px';
      layerDrag.clone.style.left = placeholderRect.left + 'px';
      layerDrag.clone.style.transform = 'scale(1)';
      layerDrag.clone.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';

      setTimeout(finalizeDrag, 250);
    } else {
      finalizeDrag();
    }
  }

  // ========== MOUSE HANDLERS ==========
  function onMouseDown(e) {
    if (e.button !== 0) return;
    
    const stopItem = e.target.closest(".stop-item");
    if (!stopItem) return;
    if (!isValidDragTarget(e.target)) return;

    e.preventDefault();

    const rect = stopItem.getBoundingClientRect();
    const list = document.getElementById("list");

    layerDrag.pending = true;
    layerDrag.stopId = stopItem.dataset.id;
    layerDrag.element = stopItem;
    layerDrag.startX = e.clientX;
    layerDrag.startY = e.clientY;
    layerDrag.offsetY = e.clientY - rect.top;
    layerDrag.initialRect = rect;
    layerDrag.listRect = list.getBoundingClientRect();

    layerDrag.delayTimer = setTimeout(() => {
      if (layerDrag.pending) {
        activateDragMouse();
      }
    }, DRAG_CONFIG.delay);

    document.addEventListener('mousemove', onMouseMoveCheck);
    document.addEventListener('mouseup', onMouseUpEarly);
  }

  function onMouseMoveCheck(e) {
    if (!layerDrag.pending) return;

    const dx = Math.abs(e.clientX - layerDrag.startX);
    const dy = Math.abs(e.clientY - layerDrag.startY);

    // اگر حرکت کرد، زودتر شروع کن
    if (dx > 5 || dy > 5) {
      clearTimeout(layerDrag.delayTimer);
      document.removeEventListener('mousemove', onMouseMoveCheck);
      document.removeEventListener('mouseup', onMouseUpEarly);
      activateDragMouse();
    }
  }

  function onMouseUpEarly() {
    clearTimeout(layerDrag.delayTimer);
    document.removeEventListener('mousemove', onMouseMoveCheck);
    document.removeEventListener('mouseup', onMouseUpEarly);
    layerDrag.pending = false;
  }

  function activateDragMouse() {
    document.removeEventListener('mousemove', onMouseMoveCheck);
    document.removeEventListener('mouseup', onMouseUpEarly);

    layerDrag.pending = false;
    layerDrag.active = true;

    const stopItem = layerDrag.element;
    const rect = layerDrag.initialRect;

    // Clone
    layerDrag.clone = stopItem.cloneNode(true);
    layerDrag.clone.classList.add('drag-clone');
    layerDrag.clone.style.cssText = `
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.top}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      z-index: 10000;
      pointer-events: none;
      opacity: 0.95;
      box-shadow: 0 15px 50px rgba(0,0,0,0.5);
      transform: scale(1.03);
      border-radius: 8px;
      background: var(--TransParent-bg, rgba(30,30,30,0.95));
      backdrop-filter: blur(6px);
      border: 2px solid var(--border, #444);
    `;
    document.body.appendChild(layerDrag.clone);

    // Placeholder
    layerDrag.placeholder = document.createElement('div');
    layerDrag.placeholder.className = 'drag-placeholder';
    layerDrag.placeholder.style.cssText = `
      height: ${rect.height}px;
      margin: 4px 0;
      border: 2px dashed var(--border, #444);
      border-radius: 8px;
      background: var(--accent);
      opacity: 0.3;
    `;

    stopItem.classList.add('drag-original');
    stopItem.style.cssText = 'opacity:0; height:0; margin:0; padding:0; overflow:hidden;';
    stopItem.parentNode.insertBefore(layerDrag.placeholder, stopItem);

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    document.addEventListener('mousemove', onMouseDragMove);
    document.addEventListener('mouseup', onMouseDragEnd);
  }

  function onMouseDragMove(e) {
    if (!layerDrag.active || !layerDrag.clone) return;

    const newTop = e.clientY - layerDrag.offsetY;
    layerDrag.clone.style.top = newTop + 'px';

    updatePlaceholderPosition(e.clientY);
  }

  function onMouseDragEnd() {
    document.removeEventListener('mousemove', onMouseDragMove);
    document.removeEventListener('mouseup', onMouseDragEnd);

    if (layerDrag.clone && layerDrag.placeholder) {
      const placeholderRect = layerDrag.placeholder.getBoundingClientRect();

      layerDrag.clone.style.transition = 'all 0.25s ease';
      layerDrag.clone.style.top = placeholderRect.top + 'px';
      layerDrag.clone.style.left = placeholderRect.left + 'px';
      layerDrag.clone.style.transform = 'scale(1)';

      setTimeout(finalizeDrag, 250);
    } else {
      finalizeDrag();
    }
  }

  // ========== SHARED FUNCTIONS ==========
  function isValidDragTarget(target) {
    if (target.closest(".control-btn, button, input, select")) return false;
    const handle = target.closest(".drag-handle");
    const preview = target.closest(".stop-preview");
    const info = target.closest(".stop-info");
    return handle || preview || info;
  }

  function updatePlaceholderPosition(clientY) {
    const list = document.getElementById("list");
    const items = [...list.querySelectorAll(".stop-item:not(.drag-original)")];

    let targetItem = null;
    let insertBefore = true;

    for (const item of items) {
      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (clientY < midY) {
        targetItem = item;
        insertBefore = true;
        break;
      } else {
        targetItem = item;
        insertBefore = false;
      }
    }

    if (targetItem && layerDrag.placeholder) {
      if (insertBefore) {
        if (layerDrag.placeholder.nextElementSibling !== targetItem) {
          list.insertBefore(layerDrag.placeholder, targetItem);
        }
      } else {
        const next = targetItem.nextElementSibling;
        if (next === layerDrag.placeholder) {
          // OK
        } else if (next === layerDrag.element) {
          list.insertBefore(layerDrag.placeholder, layerDrag.element);
        } else if (next) {
          list.insertBefore(layerDrag.placeholder, next);
        } else {
          list.appendChild(layerDrag.placeholder);
        }
      }
    }
  }

  function finalizeDrag() {
    const list = document.getElementById("list");
    const children = [...list.children];

    let newIndex = 0;
    for (const child of children) {
      if (child === layerDrag.placeholder) break;
      if (child.classList.contains("stop-item") && !child.classList.contains("drag-original")) {
        newIndex++;
      }
    }

    const oldIndex = state.stops.findIndex(s => s.id === layerDrag.stopId);

    if (oldIndex !== -1 && oldIndex !== newIndex) {
      const [removed] = state.stops.splice(oldIndex, 1);
      state.stops.splice(newIndex, 0, removed);
    }

    cleanup();
    refresh();
  }

  function cleanup() {
    if (layerDrag.clone?.parentNode) {
      layerDrag.clone.remove();
    }

    if (layerDrag.placeholder?.parentNode) {
      layerDrag.placeholder.remove();
    }

    if (layerDrag.element) {
      layerDrag.element.classList.remove('drag-original');
      layerDrag.element.style.cssText = '';
    }

    document.body.style.overflow = '';
    document.body.style.touchAction = '';
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    Object.assign(layerDrag, {
      active: false,
      pending: false,
      stopId: null,
      element: null,
      clone: null,
      placeholder: null,
      delayTimer: null,
      initialRect: null,
      listRect: null,
    });
  }

  window.initLayerDragDrop = initLayerDragDrop;
})();
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
        <div class="drag-handle" title="Drag to reorder">
          <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="2" cy="2" r="1.5"/>
            <circle cx="8" cy="2" r="1.5"/>
            <circle cx="2" cy="8" r="1.5"/>
            <circle cx="8" cy="8" r="1.5"/>
            <circle cx="2" cy="14" r="1.5"/>
            <circle cx="8" cy="14" r="1.5"/>
          </svg>
        </div>
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
      } · <span class="blend-tag">${s.blendMode || 'screen'}</span></div>
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

  const blendModes = [
    { value: 'normal', label: 'Normal' },
    { value: 'screen', label: 'Screen' },
    { value: 'multiply', label: 'Multiply' },
    { value: 'overlay', label: 'Overlay' },
    { value: 'darken', label: 'Darken' },
    { value: 'lighten', label: 'Lighten' },
    { value: 'color-dodge', label: 'Color Dodge' },
    { value: 'color-burn', label: 'Color Burn' },
    { value: 'hard-light', label: 'Hard Light' },
    { value: 'soft-light', label: 'Soft Light' },
    { value: 'difference', label: 'Difference' },
    { value: 'exclusion', label: 'Exclusion' },
    { value: 'hue', label: 'Hue' },
    { value: 'saturation', label: 'Saturation' },
    { value: 'color', label: 'Color' },
    { value: 'luminosity', label: 'Luminosity' },
  ];

  const blendOptions = blendModes.map(m => 
    `<option value="${m.value}" ${s.blendMode === m.value ? 'selected' : ''}>${m.label}</option>`
  ).join('');

  let h = `
    <div class="form-group">
      <div class="form-group-title">General</div>
      <div class="form-row">
        <label>Name</label>
        <input style="width:6rem;text-align:left" value="${s.name}" 
          onfocus="HF()" onblur="HB()"
          oninput="getStop('${s.id}').name=this.value;liveUpdate('${s.id}')">
      </div>
      <div class="form-row">
        <label>Blend</label>
        <select class="blend-select" onchange="History.saveState(); setStopBlendMode('${s.id}', this.value)">
          ${blendOptions}
        </select>
      </div>
      <div class="form-row">
        <label>X</label>
        <input type="number" class="num-input" min="0" max="100" value="${Math.round(s.x * 100)}" 
          onfocus="HF()" onblur="HB()"
          oninput="getStop('${s.id}').x=+this.value/100;liveUpdate('${s.id}')">
      </div>
      <div class="form-row">
        <label>Y</label>
        <input type="number" class="num-input" min="0" max="100" value="${Math.round(s.y * 100)}" 
          onfocus="HF()" onblur="HB()"
          oninput="getStop('${s.id}').y=+this.value/100;liveUpdate('${s.id}')"
          ${state.lockVertical ? "disabled" : ""}>
        ${state.lockVertical ? '<span style="font-size:9px;color:#666;"><img class="pos-lock" src="./icon/lock.svg" alt="lock"></span>' : ""}
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
          <input type="number" style="width:4rem;text-align:left" class="num-input" min="10" value="${Math.round(s.size)}" 
            onfocus="HF()" onblur="HB()"
            oninput="getStop('${s.id}').size=+this.value;liveUpdate('${s.id}')">
        </div>
        <div class="form-row">
          <label>Feather</label>
          <input type="number" class="num-input" min="1" max="100" value="${Math.round(s.feather)}" 
            onfocus="HF()" onblur="HB()"
            oninput="getStop('${s.id}').feather=+this.value;liveUpdate('${s.id}')">
        </div>
        <div class="form-row form-Opacity">
          <label>Opacity</label>
          <input type="number" class="num-input" id="opacity_${s.id}" min="0" max="100" value="${Math.round(s.opacity)}" 
            onfocus="HF()" onblur="HB()"
            oninput="updateStopOpacity('${s.id}', this.value)">
        </div>
      </div>
    `;
  }

  if (s.type === "linear") {
    h += `
      <div class="form-group">
        <div class="form-group-title">Angle</div>
        <div class="form-row" style="margin: auto; gap: 15px;">
          <div class="angle-picker" onmousedown="startAngleDrag(event, '${s.id}')" ontouchstart="startAngleDrag(event, '${s.id}')">
            <div class="angle-dial">
              <div class="angle-handle" id="angleHandle_${s.id}" style="transform: rotate(${s.angle}deg)">
                <div class="handle-dot"></div>
              </div>
              <div class="angle-center" id="angleCenter_${s.id}">${s.angle}°</div>
            </div>
          </div>
          <input type="number" id="angleNum_${s.id}" class="num-input" min="0" max="360" value="${s.angle}" 
            onfocus="HF()" onblur="HB()"
            oninput="updateAngleFromInput('${s.id}', this.value)" style="width:55px">
        </div>
      </div>
    `;
  }

  if (s.type === "conic") {
    h += `
      <div class="form-group">
        <div class="form-group-title">Angle</div>
        <div class="form-row" style="margin: auto; gap: 15px;">
          <div class="angle-picker" onmousedown="startConicAngleDrag(event, '${s.id}')" ontouchstart="startConicAngleDrag(event, '${s.id}')">
            <div class="angle-dial">
              <div class="angle-handle" id="conicAngleHandle_${s.id}" style="transform: rotate(${s.startAngle}deg)">
                <div class="handle-dot"></div>
              </div>
              <div class="angle-center" id="conicAngleCenter_${s.id}">${s.startAngle}°</div>
            </div>
          </div>
          <input type="number" id="conicAngleNum_${s.id}" class="num-input" min="0" max="360" value="${s.startAngle}" 
            onfocus="HF()" onblur="HB()"
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
  
        <div class="color-stop-list">
          ${s.stops.map((cs, i) => `
            <div class="color-stop-row stop-item"
     data-stop-id="${s.id}"
     data-color-index="${i}">

                 
                <span class="drag-handle">☰</span>
  
                <div class="color-swatch"
                     onclick="openStopColorPicker('${s.id}', true, ${i})">
                  <div class="color-swatch-inner"
                       style="background:${rgba(cs.color, cs.opacity / 100)}"></div>
                </div>
  
                <span class="cs-label">Stop ${i + 1}</span>
  

  
              <div class="color-stop-fields">
                <div class="field-group">
                  <label>Position</label>
                  <input type="number" class="num-input" min="0" max="100"
                    value="${cs.pos}"
                    onfocus="HF()" onblur="HB()"
                    oninput="getStop('${s.id}').stops[${i}].pos=+this.value;liveUpdate('${s.id}')">
                </div>
  
                <div class="field-group">
                  <label>Opacity</label>
                  <input type="number" class="num-input" min="0" max="100"
                    value="${cs.opacity}"
                    onfocus="HF()" onblur="HB()"
                    oninput="updateColorStopOpacity('${s.id}', ${i}, this.value)">
                </div>
              </div>
                              ${s.stops.length > 2
                  ? `<button class="control-btn"
                       onclick="delColorStop(getStop('${s.id}'),${i})">
                       <img src="./icon/close.svg">
                     </button>`
                  : ``}
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }
  

  el.innerHTML = h;
  initColorStopDrag(); 
}

// ================= COLOR STOP DRAG =================

// ================= COLOR STOP DRAG =================

(function () {
  // ========== STATE ==========
  const drag = {
    active: false,
    pending: false,
    stopId: null,
    fromIndex: null,
    el: null,
    clone: null,
    placeholder: null,
    startY: 0,
    offsetY: 0,
    delayTimer: null,
    rect: null,
  };

  const CONFIG = {
    delay: 300,
    scrollThreshold: 12,
  };

  // ========== INIT ==========
  function initColorStopDrag() {
    const list = document.querySelector(".color-stop-list");
    if (!list) return;

    // حذف listener های قبلی برای جلوگیری از تکرار
    list.removeEventListener("mousedown", onMouseDown);
    list.removeEventListener("touchstart", onTouchStart);
    
    list.addEventListener("mousedown", onMouseDown);
    list.addEventListener("touchstart", onTouchStart, { passive: false });
  }

  // ========== TOUCH ==========
  function onTouchStart(e) {
    if (drag.active || drag.pending) return;
    
    const row = e.target.closest(".color-stop-row.stop-item");
    if (!row || e.touches.length !== 1) return;
    if (!isValidTarget(e.target)) return;

    e.preventDefault();
    const touch = e.touches[0];
    const rect = row.getBoundingClientRect();

    drag.pending = true;
    drag.el = row;
    drag.stopId = row.dataset.stopId;
    drag.fromIndex = +row.dataset.colorIndex;
    drag.startY = touch.clientY;
    drag.offsetY = touch.clientY - rect.top;
    drag.rect = rect;

    drag.delayTimer = setTimeout(() => {
      if (drag.pending) activate();
    }, CONFIG.delay);

    document.addEventListener("touchmove", onTouchMoveCheck, { passive: false });
    document.addEventListener("touchend", cancelPending);
    document.addEventListener("touchcancel", cancelPending);
  }

  function onTouchMoveCheck(e) {
    if (!drag.pending) return;
    const dy = Math.abs(e.touches[0].clientY - drag.startY);
    if (dy > CONFIG.scrollThreshold) {
      cancelPending();
    }
  }

  // ========== MOUSE ==========
  function onMouseDown(e) {
    if (drag.active || drag.pending) return;
    if (e.button !== 0) return;
    
    const row = e.target.closest(".color-stop-row.stop-item");
    if (!row || !isValidTarget(e.target)) return;

    e.preventDefault();
    const rect = row.getBoundingClientRect();

    drag.pending = true;
    drag.el = row;
    drag.stopId = row.dataset.stopId;
    drag.fromIndex = +row.dataset.colorIndex;
    drag.startY = e.clientY;
    drag.offsetY = e.clientY - rect.top;
    drag.rect = rect;

    drag.delayTimer = setTimeout(() => {
      if (drag.pending) activate();
    }, CONFIG.delay);

    document.addEventListener("mousemove", onMouseMoveCheck);
    document.addEventListener("mouseup", cancelPending);
  }

  function onMouseMoveCheck(e) {
    if (!drag.pending) return;
    if (Math.abs(e.clientY - drag.startY) > 5) {
      clearTimeout(drag.delayTimer);
      activate();
    }
  }

  function cancelPending() {
    clearTimeout(drag.delayTimer);
    drag.pending = false;
    removePendingListeners();
  }

  function removePendingListeners() {
    document.removeEventListener("touchmove", onTouchMoveCheck);
    document.removeEventListener("touchend", cancelPending);
    document.removeEventListener("touchcancel", cancelPending);
    document.removeEventListener("mousemove", onMouseMoveCheck);
    document.removeEventListener("mouseup", cancelPending);
  }

  // ========== ACTIVATE ==========
  function activate() {
    if (drag.active) return;
    drag.pending = false;
    drag.active = true;

    // حذف listener های pending
    removePendingListeners();

    const { el, rect } = drag;

    // CLONE
    drag.clone = el.cloneNode(true);
    drag.clone.classList.add("drag-clone");
    drag.clone.style.cssText = `
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.top}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      z-index: 10000;
      pointer-events: none;
      opacity: 0.95;
      box-shadow: 0 15px 50px rgba(0,0,0,0.5);
      transform: scale(1.03);
      border-radius: 8px;
      background: var(--TransParent-bg, rgba(30,30,30,0.95));
      backdrop-filter: blur(6px);
      border: 2px solid var(--border, #444);
    `;
    document.body.appendChild(drag.clone);

    // PLACEHOLDER
    drag.placeholder = document.createElement("div");
    drag.placeholder.className = "color-stop-placeholder";
    drag.placeholder.style.height = el.offsetHeight + "px";

    // مخفی کردن آیتم اصلی
    el.classList.add("drag-original");
    el.style.cssText = "opacity:0 !important; height:0 !important; margin:0 !important; padding:0 !important; overflow:hidden !important; pointer-events:none !important;";
    
    // placeholder را قبل از آیتم اصلی قرار بده
    el.parentNode.insertBefore(drag.placeholder, el);

    document.body.style.userSelect = "none";
    document.body.style.overflow = "hidden";

    // اضافه کردن listener های drag
    document.addEventListener("touchmove", onDragMove, { passive: false });
    document.addEventListener("touchend", onDragEnd);
    document.addEventListener("touchcancel", onDragEnd);
    document.addEventListener("mousemove", onMouseDragMove);
    document.addEventListener("mouseup", onDragEnd);
  }

  // ========== MOVE ==========
  function onDragMove(e) {
    if (!drag.active || !drag.clone) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    const y = touch.clientY - drag.offsetY;
    drag.clone.style.top = y + "px";
    updatePlaceholder(touch.clientY);
  }

  function onMouseDragMove(e) {
    if (!drag.active || !drag.clone) return;
    
    const y = e.clientY - drag.offsetY;
    drag.clone.style.top = y + "px";
    updatePlaceholder(e.clientY);
  }

  function updatePlaceholder(clientY) {
    const list = drag.placeholder?.parentNode;
    if (!list) return;

    // فقط آیتم‌های قابل مشاهده (بدون drag-original)
    const items = [...list.querySelectorAll(".color-stop-row.stop-item:not(.drag-original)")];

    for (const item of items) {
      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      
      if (clientY < midY) {
        list.insertBefore(drag.placeholder, item);
        return;
      }
    }
    
    // اگر پایین‌تر از همه بود، به آخر اضافه کن
    // placeholder را بعد از آخرین آیتم قرار بده
    const lastItem = items[items.length - 1];
    if (lastItem && lastItem.nextSibling !== drag.placeholder) {
      list.insertBefore(drag.placeholder, lastItem.nextSibling);
    }
  }

  // ========== END ==========
  function onDragEnd() {
    if (!drag.active) {
      cancelPending();
      return;
    }
    finalize();
  }

  function finalize() {
    const list = drag.placeholder?.parentNode;
    
    if (list) {
      // محاسبه ایندکس جدید: شمارش موقعیت placeholder بین آیتم‌های قابل مشاهده
      const visibleItems = [...list.querySelectorAll(".color-stop-row.stop-item:not(.drag-original)")];
      let toIndex = 0;
      
      for (let i = 0; i < visibleItems.length; i++) {
        const item = visibleItems[i];
        // اگر placeholder قبل از این آیتم است
        if (drag.placeholder.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING) {
          toIndex = i;
          break;
        }
        toIndex = i + 1;
      }

      const stop = getStop(drag.stopId);
      if (stop && stop.stops && toIndex !== drag.fromIndex) {
        History.saveState();
        const [moved] = stop.stops.splice(drag.fromIndex, 1);
        stop.stops.splice(toIndex, 0, moved);
      }
    }

    cleanup();
    renderInspector();
    refresh();
  }

  function cleanup() {
    // حذف المان‌های موقت
    if (drag.clone) {
      drag.clone.remove();
    }
    if (drag.placeholder) {
      drag.placeholder.remove();
    }

    // برگرداندن آیتم اصلی
    if (drag.el) {
      drag.el.style.cssText = "";
      drag.el.classList.remove("drag-original");
    }

    // برگرداندن استایل body
    document.body.style.userSelect = "";
    document.body.style.overflow = "";

    // حذف همه listener ها
    removePendingListeners();
    document.removeEventListener("touchmove", onDragMove);
    document.removeEventListener("touchend", onDragEnd);
    document.removeEventListener("touchcancel", onDragEnd);
    document.removeEventListener("mousemove", onMouseDragMove);
    document.removeEventListener("mouseup", onDragEnd);

    // ریست کردن state
    Object.assign(drag, {
      active: false,
      pending: false,
      el: null,
      clone: null,
      placeholder: null,
      stopId: null,
      fromIndex: null,
      rect: null,
    });
  }

  function isValidTarget(target) {
    // فقط با drag-handle کار کند
    if (target.closest("input, button, .color-swatch")) return false;
    return !!target.closest(".drag-handle");
  }

  // Export
  window.initColorStopDrag = initColorStopDrag;
})();

// ========== تابع تنظیم Blend Mode ==========
function setStopBlendMode(stopId, mode) {
  const s = getStop(stopId);
  if (s) {
    s.blendMode = mode;
    liveUpdate(stopId);
  }
}
window.setStopBlendMode = setStopBlendMode;

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

  let gradientLines = [];
  
  if (!vis.length) {
    // ========== فقط پس‌زمینه ==========
    if (state.bgEnabled) {
      gradientLines.push(`background: ${bgColorFmt};`);
    } else {
      gradientLines.push(`background: transparent;`);
    }
  } else {
    // ========== پس‌زمینه + گرادینت‌ها ==========
    gradientLines.push(`position: relative;`);
    
    if (state.bgEnabled) {
      gradientLines.push(`background-color: ${bgColorFmt};`);
    }
    
    // Gradients
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

    gradientLines.push(`background-image:`);
    gradientLines.push(`  ${grads.join(",\n  ")};`);
    
    // ========== Blend Modes ==========
    // هر گرادینت blend mode خودش رو داره
    // آخرین مقدار مشخص می‌کنه آخرین لایه چطور با background-color ترکیب بشه
    const individualBlends = vis.map(s => s.blendMode || 'screen');
    
    // ✅ اگر bgBlendMode تنظیم شده، به آخر اضافه کن
    if (state.bgEnabled && state.bgBlendMode !== 'normal') {
      // روش 1: استفاده از mix-blend-mode برای کل element
      gradientLines.push(`background-blend-mode: ${individualBlends.join(', ')};`);
      gradientLines.push(`mix-blend-mode: ${state.bgBlendMode};`);
    } else {
      gradientLines.push(`background-blend-mode: ${individualBlends.join(', ')};`);
    }
  }

  // فیلتر
  const hasFilters = hasActiveFilters();
  if (hasFilters) {
    gradientLines.push(`filter: ${getFilterString()};`);
  }

  currentGradientCSS = gradientLines.join('\n');

  // ========== 2. Filter CSS ==========
  if (hasFilters) {
    currentFilterCSS = `filter: ${getFilterString()};`;
  } else {
    currentFilterCSS = "";
  }

  // ========== 3. Noise CSS ==========
  const hasNoise = noiseState.enabled && noiseState.opacity > 0;
  
  if (hasNoise) {
    currentNoiseCSS = `
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: ${(noiseState.opacity / 100).toFixed(2)};
  filter: url(#noiseFilter);
  mix-blend-mode: ${noiseState.blend};`;

currentSVGFilter = `
<svg width="0" height="0" style="position:absolute">
  <filter id="noiseFilter"
          x="0%" y="0%"
          width="100%" height="100%"
          filterUnits="objectBoundingBox">
    
    <feTurbulence type="fractalNoise"
                  baseFrequency="${noiseState.frequency}"
                  numOctaves="4"
                  stitchTiles="stitch"
                  result="noise"/>
    
    <feColorMatrix type="saturate"
                   values="0"
                   in="noise"
                   result="bwNoise"/>
    
    <feBlend in="SourceGraphic"
             in2="bwNoise"
             mode="${noiseState.blend}"/>
  </filter>
</svg>`;

  } else {
    currentNoiseCSS = "";
    currentSVGFilter = "";
  }

  const noiseBlock = document.getElementById('noiseOutputBlock');
  const svgBlock = document.getElementById('svgOutputBlock');
  
  if (noiseBlock) noiseBlock.style.display = hasNoise ? 'block' : 'none';
  if (svgBlock) svgBlock.style.display = hasNoise ? 'block' : 'none';

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
function copyCSS(btn) {
  let allCSS = currentGradientCSS || '';

  if (currentFilterCSS) {
    allCSS += '\n\n/* Filters */\n' + currentFilterCSS;
  }

  if (currentNoiseCSS) {
    allCSS += '\n\n/* Noise Overlay */\n' + currentNoiseCSS;
  }

  if (currentSVGFilter) {
    allCSS += '\n\n/* SVG Filter (add to HTML) */\n' + currentSVGFilter;
  }

  copyToClipboard(allCSS, btn);
}

function copyGradientCSS(btn) {
  copyToClipboard(currentGradientCSS, btn);
}

function copyNoiseCSS(btn) {
  copyToClipboard(currentNoiseCSS, btn);
}

function copySVGFilter(btn) {
  copyToClipboard(currentSVGFilter, btn);
}

function copyToClipboard(text, btn = null) {
  if (!text || !text.trim()) return;

  // Modern API (Android / Desktop / new iOS)
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(() => feedback(btn))
      .catch(() => legacyCopy(text, btn));
  } else {
    legacyCopy(text, btn);
  }
}

function legacyCopy(text, btn) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);

  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length); // iOS fix

  try {
    document.execCommand("copy");
    feedback(btn);
  } catch (err) {
    console.error("Copy failed", err);
  }

  document.body.removeChild(textarea);
}

const feedbackTimers = new WeakMap();

function feedback(btn) {
  if (!btn) return;

  // تایمر قبلی این دکمه را بکش
  if (feedbackTimers.has(btn)) {
    clearTimeout(feedbackTimers.get(btn));
    feedbackTimers.delete(btn);
  }

  const originalHTML = btn.dataset.originalHtml || btn.innerHTML;
  btn.dataset.originalHtml = originalHTML;

  btn.classList.add("copied");
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="14" height="14" fill="#4ade80">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
    </svg>
    <span>Copied!</span>
  `;

  const timer = setTimeout(() => {
    btn.classList.remove("copied");
    btn.innerHTML = originalHTML;
    feedbackTimers.delete(btn);
  }, 1200);

  feedbackTimers.set(btn, timer);
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

  const exportCanvas = document.createElement("canvas");
  const exportCtx = exportCanvas.getContext("2d", { willReadFrequently: true });

  exportCanvas.width = width;
  exportCanvas.height = height;

  const visibleStops = state.stops.filter((s) => s.visible);
  const reversedStops = [...visibleStops].reverse();

  // ========== 1. پس‌زمینه ==========
  if (state.bgEnabled) {
    exportCtx.fillStyle = rgba(state.bgColor, state.bgAlpha / 100);
    exportCtx.fillRect(0, 0, width, height);
  }

  // ========== 2. گرادینت‌ها با bgBlendMode ==========
  if (reversedStops.length > 0) {
    const needsBgBlend = state.bgEnabled && 
                         state.bgBlendMode && 
                         state.bgBlendMode !== 'normal';
    
    if (needsBgBlend) {
      // Canvas موقت
      const gradCanvas = document.createElement('canvas');
      gradCanvas.width = width;
      gradCanvas.height = height;
      const gradCtx = gradCanvas.getContext('2d');
      
      reversedStops.forEach((s) => {
        gradCtx.globalCompositeOperation = getCanvasBlendMode(s.blendMode);
        drawGradForExport(s, gradCtx, width, height);
      });
      gradCtx.globalCompositeOperation = 'source-over';
      
      // ✅ ترکیب با bgBlendMode
      exportCtx.globalCompositeOperation = getCanvasBlendMode(state.bgBlendMode);
      exportCtx.drawImage(gradCanvas, 0, 0);
      exportCtx.globalCompositeOperation = 'source-over';
      
    } else {
      reversedStops.forEach((s) => {
        exportCtx.globalCompositeOperation = getCanvasBlendMode(s.blendMode);
        drawGradForExport(s, exportCtx, width, height);
      });
      exportCtx.globalCompositeOperation = 'source-over';
    }
  }

  // ========== 3. فیلترها ==========
  if (hasActiveFilters()) {
    if (filterState.blur > 0) {
      const blurCanvas = document.createElement('canvas');
      blurCanvas.width = width;
      blurCanvas.height = height;
      const blurCtx = blurCanvas.getContext('2d');
      blurCtx.filter = `blur(${filterState.blur}px)`;
      blurCtx.drawImage(exportCanvas, 0, 0);
      
      exportCtx.clearRect(0, 0, width, height);
      exportCtx.drawImage(blurCanvas, 0, 0);
    }
    
    if (hasNonBlurFilters()) {
      const imageData = exportCtx.getImageData(0, 0, width, height);
      applyFiltersToImageData(imageData);
      exportCtx.putImageData(imageData, 0, 0);
    }
  }

// ========== 4. نویز ==========
if (noiseState.enabled && noiseState.opacity > 0) {
  const noiseCanvas = await getNoiseCanvas(
    width,
    height,
    noiseState.frequency
  );

  if (noiseCanvas instanceof HTMLCanvasElement) {
    exportCtx.save();
    exportCtx.globalCompositeOperation = noiseState.blend;
    exportCtx.globalAlpha = noiseState.opacity / 100;
    exportCtx.drawImage(noiseCanvas, 0, 0, width, height);
    exportCtx.restore();
  }
}



  // ========== 5. دانلود ==========
  const mime = format === "jpg" ? "image/jpeg" : "image/png";
  const filename = `gradient-${width}x${height}.${format}`;

  exportCanvas.toBlob(
    (blob) => {
      if (!blob) return;
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

// ========== EXPORT - FIXED VERSION ==========

// Remove all duplicate definitions and replace with this single version:

function drawGradForExport(s, ctx, width, height) {
  const cx = s.x * width;
  const cy = s.y * height;

  if (s.type === "radial") {
    const solidEnd = 1 - s.feather / 100;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, s.size);
    const col = rgba(s.color, s.opacity / 100);

    grad.addColorStop(0, col);
    if (solidEnd > 0 && solidEnd < 1) grad.addColorStop(solidEnd, col);
    grad.addColorStop(1, rgba(s.color, 0));

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, s.size, 0, Math.PI * 2);
    ctx.fill();
  } 
  else if (s.type === "linear") {
    const a = ((s.angle - 90) * Math.PI) / 180;
    const d = Math.hypot(width, height);
    const mx = width / 2, my = height / 2;
    const dx = (Math.cos(a) * d) / 2;
    const dy = (Math.sin(a) * d) / 2;

    const grad = ctx.createLinearGradient(mx - dx, my - dy, mx + dx, my + dy);
    
    // ✅ اصلاح شده
    const fixedStops = fixTransparentStops(s.stops);
    fixedStops.forEach((cs) => {
      grad.addColorStop(cs.pos / 100, rgba(cs.color, cs.opacity / 100));
    });

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  } 
  else if (s.type === "conic") {
    const start = ((s.startAngle - 90) * Math.PI) / 180;
    const grad = ctx.createConicGradient(start, cx, cy);
    
    // ✅ اصلاح شده
    const fixedStops = fixTransparentStops(s.stops);
    fixedStops.forEach((cs) => {
      grad.addColorStop(cs.pos / 100, rgba(cs.color, cs.opacity / 100));
    });

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }
}

// ========== EXPORT AS SVG - FIXED ==========
// ========== EXPORT AS SVG - PIXEL PERFECT ==========
async function exportAsSVG() {
  const width = state.canvasWidth;
  const height = state.canvasHeight;
  
  // ========== 1. ساخت Canvas موقت و رندر کامل ==========
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = width;
  exportCanvas.height = height;
  const exportCtx = exportCanvas.getContext('2d');
  
  // رندر کامل صحنه (بدون هندل‌ها)
  await renderSceneToContext(exportCtx, width, height);
  
  // ========== 2. تبدیل به Base64 ==========
  const imageData = exportCanvas.toDataURL('image/png');
  
  // ========== 3. ساخت SVG با تصویر embed شده ==========
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${width}" 
     height="${height}" 
     viewBox="0 0 ${width} ${height}">
  <title>Gradient Export</title>
  <desc>Generated by Gradient Editor</desc>
  <image width="${width}" height="${height}" xlink:href="${imageData}"/>
</svg>`;

  // ========== 4. دانلود ==========
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const filename = `gradient-${width}x${height}.svg`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ========== رندر یک گرادینت ==========
function renderGradient(s, ctx, width, height) {
  const cx = s.x * width;
  const cy = s.y * height;

  if (s.type === "radial") {
    const solidEnd = 1 - (s.feather || 60) / 100;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, s.size);
    const color = rgba(s.color, s.opacity / 100);

    grad.addColorStop(0, color);
    if (solidEnd > 0.01 && solidEnd < 0.99) {
      grad.addColorStop(solidEnd, color);
    }
    grad.addColorStop(1, rgba(s.color, 0));

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, s.size, 0, Math.PI * 2);
    ctx.fill();
  } 
  else if (s.type === "linear") {
    const angleRad = ((s.angle - 90) * Math.PI) / 180;
    const diagonal = Math.hypot(width, height);
    const mx = width / 2;
    const my = height / 2;
    const dx = (Math.cos(angleRad) * diagonal) / 2;
    const dy = (Math.sin(angleRad) * diagonal) / 2;
    
    const grad = ctx.createLinearGradient(mx - dx, my - dy, mx + dx, my + dy);

    const fixedStops = fixTransparentStops(s.stops);
    fixedStops.forEach((cs) => {
      grad.addColorStop(
        clamp(cs.pos / 100, 0, 1),
        rgba(cs.color, cs.opacity / 100)
      );
    });

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  } 
  else if (s.type === "conic") {
    const startAngle = ((s.startAngle - 90) * Math.PI) / 180;
    const grad = ctx.createConicGradient(startAngle, cx, cy);

    const fixedStops = fixTransparentStops(s.stops);
    fixedStops.forEach((cs) => {
      grad.addColorStop(
        clamp(cs.pos / 100, 0, 1),
        rgba(cs.color, cs.opacity / 100)
      );
    });

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }
}

// ========== اطمینان از وجود تابع ==========
function getCanvasBlendMode(cssBlendMode) {
  if (!cssBlendMode || cssBlendMode === 'normal') {
    return 'source-over';
  }
  return cssBlendMode;
}

// ========== EXPORT AS VECTOR SVG ==========
function exportAsVectorSVG() {
  const width = state.canvasWidth;
  const height = state.canvasHeight;
  const visibleStops = state.stops.filter((s) => s.visible);
  
  // ✅ ترتیب معکوس - مثل Canvas
  const reversedStops = [...visibleStops].reverse();

  let defs = "";
  let content = "";

  // ========== 1. تعریف گرادینت‌ها ==========
  reversedStops.forEach((s, i) => {
    const id = `grad${i}`;

    if (s.type === "radial") {
      const cx = (s.x * width).toFixed(2);
      const cy = (s.y * height).toFixed(2);
      const rgb = hexToRgb(s.color);
      const opacity = (s.opacity / 100).toFixed(3);
      const solidEnd = Math.max(0, Math.min(1, 1 - (s.feather || 60) / 100));

      defs += `
    <radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${s.size}">
      <stop offset="0%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="${opacity}"/>`;
      if (solidEnd > 0.01 && solidEnd < 0.99) {
        defs += `
      <stop offset="${(solidEnd * 100).toFixed(1)}%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="${opacity}"/>`;
      }
      defs += `
      <stop offset="100%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="0"/>
    </radialGradient>`;
    }
    else if (s.type === "linear") {
      const angleRad = ((s.angle - 90) * Math.PI) / 180;
      const x1 = (50 - Math.cos(angleRad) * 50).toFixed(2);
      const y1 = (50 - Math.sin(angleRad) * 50).toFixed(2);
      const x2 = (50 + Math.cos(angleRad) * 50).toFixed(2);
      const y2 = (50 + Math.sin(angleRad) * 50).toFixed(2);

      defs += `
    <linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">`;
      
      const fixedStops = fixTransparentStops(s.stops);
      fixedStops.forEach((cs) => {
        const c = hexToRgb(cs.color);
        defs += `
      <stop offset="${cs.pos}%" stop-color="rgb(${c.r},${c.g},${c.b})" stop-opacity="${(cs.opacity / 100).toFixed(3)}"/>`;
      });
      defs += `
    </linearGradient>`;
    }
  });

  // ========== 2. Noise Filter ==========
  if (noiseState.enabled && noiseState.opacity > 0) {
    defs += `
    <filter id="noise" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="${noiseState.frequency}" numOctaves="4" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>`;
  }

  // ========== 3. پس‌زمینه ==========
  if (state.bgEnabled) {
    const bg = hexToRgb(state.bgColor);
    content += `  <rect id="bg" width="100%" height="100%" fill="rgb(${bg.r},${bg.g},${bg.b})" fill-opacity="${(state.bgAlpha / 100).toFixed(3)}"/>\n`;
  }

  // ========== 4. گرادینت‌ها ==========
  const hasBgBlend = state.bgEnabled && state.bgBlendMode && state.bgBlendMode !== 'normal';
  
  if (hasBgBlend) {
    content += `  <g style="mix-blend-mode:${state.bgBlendMode}">\n`;
  }
  
  reversedStops.forEach((s, i) => {
    const id = `grad${i}`;
    const blend = s.blendMode || 'screen';
    const indent = hasBgBlend ? '    ' : '  ';
    
    if (s.type === "radial") {
      content += `${indent}<circle cx="${(s.x * width).toFixed(2)}" cy="${(s.y * height).toFixed(2)}" r="${s.size}" fill="url(#${id})" style="mix-blend-mode:${blend}"/>\n`;
    }
    else if (s.type === "linear") {
      content += `${indent}<rect width="100%" height="100%" fill="url(#${id})" style="mix-blend-mode:${blend}"/>\n`;
    }
    else if (s.type === "conic") {
      const x = (s.x * 100).toFixed(2);
      const y = (s.y * 100).toFixed(2);
      const fixedStops = fixTransparentStops(s.stops);
      const stopsCSS = fixedStops.map(cs => {
        const c = hexToRgb(cs.color);
        return `rgba(${c.r},${c.g},${c.b},${(cs.opacity/100).toFixed(3)}) ${cs.pos}%`;
      }).join(',');
      
      content += `${indent}<foreignObject width="100%" height="100%">
${indent}  <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;background:conic-gradient(from ${s.startAngle}deg at ${x}% ${y}%,${stopsCSS});mix-blend-mode:${blend}"></div>
${indent}</foreignObject>\n`;
    }
  });
  
  if (hasBgBlend) {
    content += `  </g>\n`;
  }

  // ========== 5. نویز ==========
  if (noiseState.enabled && noiseState.opacity > 0) {
    content += `  <rect width="100%" height="100%" fill="white" filter="url(#noise)" opacity="${(noiseState.opacity / 100).toFixed(3)}" style="mix-blend-mode:${noiseState.blend}"/>\n`;
  }

  // ========== 6. اخطار فیلتر ==========
  let filterNote = "";
  if (hasActiveFilters()) {
    filterNote = `
  <!-- ⚠️ CSS Filters applied in editor: ${getFilterString()} -->
  <!-- For accurate results, use PNG/JPG export or apply CSS filter to this SVG -->`;
  }

  // ========== 7. SVG نهایی ==========
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     xmlns:xhtml="http://www.w3.org/1999/xhtml"
     width="${width}" height="${height}" 
     viewBox="0 0 ${width} ${height}">${filterNote}
  <defs>${defs}
  </defs>
${content}</svg>`;

  // Download
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gradient-${width}x${height}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// ========== FIX: generateSVGFilterFromCSS ==========
function generateSVGFilterFromCSS() {
  if (!hasActiveFilters()) return '';
  
  let filterContent = '';
  let lastResult = 'SourceGraphic';
  let resultIndex = 0;
  
  // 1. Brightness
  if (filterState.brightness !== 100) {
    const brightness = filterState.brightness / 100;
    filterContent += `
      <feComponentTransfer in="${lastResult}" result="brightness${resultIndex}">
        <feFuncR type="linear" slope="${brightness.toFixed(4)}" intercept="0"/>
        <feFuncG type="linear" slope="${brightness.toFixed(4)}" intercept="0"/>
        <feFuncB type="linear" slope="${brightness.toFixed(4)}" intercept="0"/>
      </feComponentTransfer>`;
    lastResult = `brightness${resultIndex}`;
    resultIndex++;
  }
  
  // 2. Contrast
  if (filterState.contrast !== 100) {
    const contrast = filterState.contrast / 100;
    const intercept = (0.5 - 0.5 * contrast).toFixed(4);
    filterContent += `
      <feComponentTransfer in="${lastResult}" result="contrast${resultIndex}">
        <feFuncR type="linear" slope="${contrast.toFixed(4)}" intercept="${intercept}"/>
        <feFuncG type="linear" slope="${contrast.toFixed(4)}" intercept="${intercept}"/>
        <feFuncB type="linear" slope="${contrast.toFixed(4)}" intercept="${intercept}"/>
      </feComponentTransfer>`;
    lastResult = `contrast${resultIndex}`;
    resultIndex++;
  }
  
  // 3. Saturate
  if (filterState.saturate !== 100) {
    filterContent += `
      <feColorMatrix type="saturate" values="${(filterState.saturate / 100).toFixed(3)}" in="${lastResult}" result="sat${resultIndex}"/>`;
    lastResult = `sat${resultIndex}`;
    resultIndex++;
  }
  
  // 4. Hue-rotate
  if (filterState.hue !== 0) {
    filterContent += `
      <feColorMatrix type="hueRotate" values="${filterState.hue}" in="${lastResult}" result="hue${resultIndex}"/>`;
    lastResult = `hue${resultIndex}`;
    resultIndex++;
  }
  
  // 5. Grayscale
  if (filterState.grayscale > 0) {
    const g = 1 - filterState.grayscale / 100;
    const matrix = [
      (0.2126 + 0.7874 * g).toFixed(4), (0.7152 - 0.7152 * g).toFixed(4), (0.0722 - 0.0722 * g).toFixed(4), 0, 0,
      (0.2126 - 0.2126 * g).toFixed(4), (0.7152 + 0.2848 * g).toFixed(4), (0.0722 - 0.0722 * g).toFixed(4), 0, 0,
      (0.2126 - 0.2126 * g).toFixed(4), (0.7152 - 0.7152 * g).toFixed(4), (0.0722 + 0.9278 * g).toFixed(4), 0, 0,
      0, 0, 0, 1, 0
    ].join(' ');
    
    filterContent += `
      <feColorMatrix type="matrix" values="${matrix}" in="${lastResult}" result="gray${resultIndex}"/>`;
    lastResult = `gray${resultIndex}`;
    resultIndex++;
  }
  
  // 6. Sepia
  if (filterState.sepia > 0) {
    const s = 1 - filterState.sepia / 100;
    const matrix = [
      (0.393 + 0.607 * s).toFixed(4), (0.769 - 0.769 * s).toFixed(4), (0.189 - 0.189 * s).toFixed(4), 0, 0,
      (0.349 - 0.349 * s).toFixed(4), (0.686 + 0.314 * s).toFixed(4), (0.168 - 0.168 * s).toFixed(4), 0, 0,
      (0.272 - 0.272 * s).toFixed(4), (0.534 - 0.534 * s).toFixed(4), (0.131 + 0.869 * s).toFixed(4), 0, 0,
      0, 0, 0, 1, 0
    ].join(' ');
    
    filterContent += `
      <feColorMatrix type="matrix" values="${matrix}" in="${lastResult}" result="sepia${resultIndex}"/>`;
    lastResult = `sepia${resultIndex}`;
    resultIndex++;
  }
  
  // 7. Invert
  if (filterState.invert > 0) {
    const i = filterState.invert / 100;
    filterContent += `
      <feComponentTransfer in="${lastResult}" result="inv${resultIndex}">
        <feFuncR type="table" tableValues="${(1-i).toFixed(3)} ${i.toFixed(3)}"/>
        <feFuncG type="table" tableValues="${(1-i).toFixed(3)} ${i.toFixed(3)}"/>
        <feFuncB type="table" tableValues="${(1-i).toFixed(3)} ${i.toFixed(3)}"/>
      </feComponentTransfer>`;
    lastResult = `inv${resultIndex}`;
    resultIndex++;
  }
  
  // 8. Blur
  if (filterState.blur > 0) {
    filterContent += `
      <feGaussianBlur stdDeviation="${filterState.blur}" in="${lastResult}" result="blur${resultIndex}"/>`;
    lastResult = `blur${resultIndex}`;
    resultIndex++;
  }
  
  // Filter region extension for blur
  const pad = filterState.blur > 0 ? Math.ceil(filterState.blur * 3 / 100 * 100) + 10 : 0;
  
  return `
    <filter id="cssFilter" x="-${pad}%" y="-${pad}%" width="${100 + pad * 2}%" height="${100 + pad * 2}%">${filterContent}
    </filter>`;
}

// ========== HELPER: Generate SVG Filter from CSS ==========
function generateSVGFilterFromCSS() {
  if (!hasActiveFilters()) return '';
  
  let filterContent = '';
  let lastResult = 'SourceGraphic';
  let resultIndex = 0;
  
  // ========== ترتیب صحیح - مطابق CSS ==========
  
  // 1. Brightness
  if (filterState.brightness !== 100) {
    const brightness = filterState.brightness / 100;
    filterContent += `
      <feComponentTransfer in="${lastResult}" result="brightness${resultIndex}">
        <feFuncR type="linear" slope="${brightness.toFixed(4)}" intercept="0"/>
        <feFuncG type="linear" slope="${brightness.toFixed(4)}" intercept="0"/>
        <feFuncB type="linear" slope="${brightness.toFixed(4)}" intercept="0"/>
      </feComponentTransfer>`;
    lastResult = `brightness${resultIndex}`;
    resultIndex++;
  }
  
  // 2. Contrast
  if (filterState.contrast !== 100) {
    const contrast = filterState.contrast / 100;
    const intercept = (-(0.5 * contrast) + 0.5);
    filterContent += `
      <feComponentTransfer in="${lastResult}" result="contrast${resultIndex}">
        <feFuncR type="linear" slope="${contrast.toFixed(4)}" intercept="${intercept.toFixed(4)}"/>
        <feFuncG type="linear" slope="${contrast.toFixed(4)}" intercept="${intercept.toFixed(4)}"/>
        <feFuncB type="linear" slope="${contrast.toFixed(4)}" intercept="${intercept.toFixed(4)}"/>
      </feComponentTransfer>`;
    lastResult = `contrast${resultIndex}`;
    resultIndex++;
  }
  
  // 3. Saturate
  if (filterState.saturate !== 100) {
    filterContent += `
      <feColorMatrix type="saturate" values="${(filterState.saturate / 100).toFixed(3)}" in="${lastResult}" result="sat${resultIndex}"/>`;
    lastResult = `sat${resultIndex}`;
    resultIndex++;
  }
  
  // 4. Hue-rotate
  if (filterState.hue !== 0) {
    filterContent += `
      <feColorMatrix type="hueRotate" values="${filterState.hue}" in="${lastResult}" result="hue${resultIndex}"/>`;
    lastResult = `hue${resultIndex}`;
    resultIndex++;
  }
  
  // 5. Grayscale
  if (filterState.grayscale > 0) {
    const g = 1 - filterState.grayscale / 100;
    const matrix = [
      0.2126 + 0.7874 * g, 0.7152 - 0.7152 * g, 0.0722 - 0.0722 * g, 0, 0,
      0.2126 - 0.2126 * g, 0.7152 + 0.2848 * g, 0.0722 - 0.0722 * g, 0, 0,
      0.2126 - 0.2126 * g, 0.7152 - 0.7152 * g, 0.0722 + 0.9278 * g, 0, 0,
      0, 0, 0, 1, 0
    ].map(v => v.toFixed(4)).join(' ');
    
    filterContent += `
      <feColorMatrix type="matrix" values="${matrix}" in="${lastResult}" result="gray${resultIndex}"/>`;
    lastResult = `gray${resultIndex}`;
    resultIndex++;
  }
  
  // 6. Sepia
  if (filterState.sepia > 0) {
    const s = 1 - filterState.sepia / 100;
    const matrix = [
      0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s, 0, 0,
      0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s, 0, 0,
      0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s, 0, 0,
      0, 0, 0, 1, 0
    ].map(v => v.toFixed(4)).join(' ');
    
    filterContent += `
      <feColorMatrix type="matrix" values="${matrix}" in="${lastResult}" result="sepia${resultIndex}"/>`;
    lastResult = `sepia${resultIndex}`;
    resultIndex++;
  }
  
  // 7. Invert (قبل از blur)
  if (filterState.invert > 0) {
    const i = filterState.invert / 100;
    filterContent += `
      <feComponentTransfer in="${lastResult}" result="inv${resultIndex}">
        <feFuncR type="table" tableValues="${(1-i).toFixed(3)} ${i.toFixed(3)}"/>
        <feFuncG type="table" tableValues="${(1-i).toFixed(3)} ${i.toFixed(3)}"/>
        <feFuncB type="table" tableValues="${(1-i).toFixed(3)} ${i.toFixed(3)}"/>
      </feComponentTransfer>`;
    lastResult = `inv${resultIndex}`;
    resultIndex++;
  }
  
  // 8. Blur (آخر - چون سنگینه)
  if (filterState.blur > 0) {
    filterContent += `
      <feGaussianBlur stdDeviation="${filterState.blur}" in="${lastResult}" result="blur${resultIndex}"/>`;
    lastResult = `blur${resultIndex}`;
    resultIndex++;
  }
  
  // Extend filter region for blur
  const blurPadding = filterState.blur > 0 ? Math.ceil(filterState.blur * 3) : 0;
  const padPercent = blurPadding > 0 ? (blurPadding / 100 * 100 + 10) : 0;
  
  return `
    <filter id="cssFilter" x="-${padPercent}%" y="-${padPercent}%" width="${100 + padPercent * 2}%" height="${100 + padPercent * 2}%">${filterContent}
    </filter>`;
}

// Make sure hasNonBlurFilters exists
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

// ========== GLOBALS ==========
window.setNoiseOpacity = setNoiseOpacity;
window.setNoiseFrequency = setNoiseFrequency;
window.setNoiseBlend = setNoiseBlend;
window.toggleNoise = toggleNoise;
window.copyCSS = copyCSS;
window.copyGradientCSS = copyGradientCSS;
window.copyNoiseCSS = copyNoiseCSS;
window.copySVGFilter = copySVGFilter;
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
  History.saveState();  // ✅ اضافه شد
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
      if (e.target.closest('#canvas, .panel, .picker-modal')) {
        e.preventDefault();
      }
    }
    lastTouchEnd = now;
  }, { passive: false });

  // ========== pinch zoom ==========
  document.addEventListener("touchmove", (e) => {
    if (e.touches.length > 1) {
      if (!e.target.closest('.canvas-wrap')) {
        e.preventDefault();
      }
    }
  }, { passive: false });

  // ========== gesture ==========
  document.addEventListener("gesturestart", (e) => {
    e.preventDefault();
  }, { passive: false });

}

// ========== INITIALIZATION ==========
async function init() {
  initMobile();
  initPickerEvents();
  initDimensionEvents();
  initNoiseEvents();
  initFilterEvents();
  initBackgroundEvents();
  initZoom();
  initPan();

  resize();
  updateZoomUI();
  updateAllDimensionUI();
  updateNoiseUI();
  updateFilterUI();
  updateBgUI();
  initLayerDragDrop();

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

  const clampValue = (v, min, max) => Math.min(max, Math.max(min, v));

  window.__isNumberScrubbing = false;

  document.addEventListener("pointerdown", (e) => {
    const input = e.target.closest('input[type="number"]');
    if (!input) return;

    const now = Date.now();

    // Double-tap to focus (mobile)
    if (e.pointerType === "touch" && now - lastTapTime < DOUBLE_TAP_DELAY) {
      input.focus();
      input.style.cursor = "text";
      lastTapTime = 0;
      return;
    }

    lastTapTime = now;

    // اگر input فوکوس داره، اجازه تایپ بده
    if (input === document.activeElement) return;

    e.preventDefault();
    input.setPointerCapture(e.pointerId);

    activeInput = input;
    startX = e.clientX;
    startValue = parseFloat(input.value) || 0;

    window.__isNumberScrubbing = true;
    document.body.style.cursor = "ew-resize";
    
    // ✅ FIX: شروع History tracking
    if (typeof History !== 'undefined' && History.onDragStart) {
      History.onDragStart();
    }
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

    value = clampValue(value, min, max);
    value = Math.round(value / step) * step;

    activeInput.value = value;
    activeInput.dispatchEvent(new Event("input", { bubbles: true }));
  });

  const end = (e) => {
    if (!activeInput) return;
    
    // ✅ FIX: پایان History tracking
    if (typeof History !== 'undefined' && History.onDragEnd) {
      History.onDragEnd();
    }
    
    try {
      activeInput.releasePointerCapture(e.pointerId);
    } catch {}
    
    activeInput = null;
    document.body.style.cursor = "";
    window.__isNumberScrubbing = false;
  };

  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);

  // Double-click to focus (desktop)
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
