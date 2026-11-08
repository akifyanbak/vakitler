import {
  Coordinates,
  HighLatitudeRule,
  PolarCircleResolution,
  PrayerTimes,
  Qibla,
  SunnahTimes,
} from "../vendor/adhan.esm.js";
import { isJafariMadhab, methodNote, normalizeStoredMadhab, prayerParameters } from "./mezhep.js";
import { FEATURED_IDS, PLACES } from "./places.js";
import { pickVesvese } from "./vesvese.js";

const STORAGE_KEY = "vakitler.v1";
const PREPROD = location.pathname.includes("/dev/");
const VESVESE_HOME_KEY = PREPROD ? "vakitler.dev.vesveseHome" : "vakitler.vesveseHome";
const VESVESE_HOME_DELAY = 10 * 60 * 1000;
const KAABA = { lat: 21.422487, lon: 39.826206 };
const ORDER = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
const PRAYER_KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const NAMES = {
  fajr: "İmsak",
  sunrise: "Güneş",
  dhuhr: "Öğle",
  asr: "İkindi",
  maghrib: "Akşam",
  isha: "Yatsı",
};
const METHODS = [
  ["Turkey", "Diyanet (Türkiye)", "İmsak 18°, yatsı 17°. Türkiye için Diyanet’e yakın bir hesaptır; resmi çizelgeden birkaç dakika sapabilir."],
  ["MuslimWorldLeague", "Müslüman Dünya Birliği", "İmsak 18°, yatsı 17°."],
  ["Egyptian", "Mısır", "İmsak 19,5°, yatsı 17,5°."],
  ["Karachi", "Karaçi", "İmsak 18°, yatsı 18°."],
  ["UmmAlQura", "Ümmü’l-Kurâ (Mekke)", "İmsak 18,5°. Yatsı, akşamdan 90 dakika sonra."],
  ["NorthAmerica", "Kuzey Amerika (ISNA)", "İmsak 15°, yatsı 15°."],
  ["Kuwait", "Kuveyt", "İmsak 18°, yatsı 17,5°."],
  ["Qatar", "Katar", "İmsak 18°. Yatsı, akşamdan 90 dakika sonra."],
  ["Dubai", "Dubai", "İmsak ve yatsı 18,2°."],
  ["Singapore", "Singapur", "İmsak 20°, yatsı 18°."],
  ["Tehran", "Tahran", "İmsak 17,7°, akşam 4,5°, yatsı 14°."],
  ["MoonsightingCommittee", "Moonsighting Committee", "İmsak ve yatsı 18°. Yüksek enlemlerde mevsim düzeltmesi uygular."],
];
const THEME_COLOR = { light: "#f6f3ec", dark: "#141614" };

const byId = new Map(PLACES.map((place) => [place.id, place]));
const calcCache = new Map();
const $ = (id) => document.getElementById(id);

const state = loadState();
let heading = null;
let compassListening = false;
let gotHeading = false;
let toastTimer = 0;
let notified = new Set(readNotified());
let remindTimer = 0;
let vesveseSample = null;
let homeVesveseId = "";
let homeVesveseSample = null;
let homeVesvesePreview = false;

init();

function init() {
  fillMethods();
  syncForm();
  bind();
  if ("share" in navigator) $("share-button").hidden = false;
  refreshInstallButton();
  if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
    $("compass-permit").hidden = false;
  }
  ensureSelection();
  render();
  queueMicrotask(() => {
    if (state.place && needsPlaceLabel(state.place)) void resolvePlaceLabel(state.place);
  });
  updateOnline();
  registerServiceWorker();
  setInterval(updateLive, 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    updateLive();
    armReminder();
  });
  armReminder();
}

function freshAdjustments() {
  return { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
}

function loadState() {
  const base = {
    place: null,
    recents: [],
    method: "Turkey",
    madhab: "Hanafi",
    highLatitude: HighLatitudeRule.MiddleOfTheNight,
    theme: "light",
    remind: "off",
    vesvese: false,
    adjustments: freshAdjustments(),
    selected: null,
    month: null,
    pinned: false,
    view: "today",
  };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw || typeof raw !== "object") return base;
    const method = METHODS.some(([id]) => id === raw.method) ? raw.method : base.method;
    const madhab = normalizeStoredMadhab(raw);
    const highLatitude = Object.values(HighLatitudeRule).includes(raw.highLatitude) ? raw.highLatitude : base.highLatitude;
    const theme = raw.theme === "dark" || raw.theme === "night"
      ? "dark"
      : raw.theme === "system"
        ? "system"
        : "light";
    const remind = ["off", "0", "10", "15"].includes(raw.remind) ? raw.remind : base.remind;
    const adjustments = freshAdjustments();
    for (const key of Object.keys(adjustments)) {
      const n = Number.parseInt(raw.adjustments?.[key], 10);
      adjustments[key] = Number.isFinite(n) ? Math.max(-30, Math.min(30, n)) : 0;
    }
    return {
      ...base,
      place: validPlace(raw.place) ? raw.place : null,
      recents: Array.isArray(raw.recents) ? raw.recents.filter(validPlace).slice(0, 6) : [],
      method,
      madhab,
      highLatitude,
      theme,
      remind,
      vesvese: raw.vesvese === true,
      adjustments,
    };
  } catch {
    return base;
  }
}

function validPlace(place) {
  return Boolean(
    place &&
      typeof place.name === "string" &&
      typeof place.region === "string" &&
      Number.isFinite(place.lat) &&
      Number.isFinite(place.lon) &&
      place.lat >= -90 &&
      place.lat <= 90 &&
      place.lon >= -180 &&
      place.lon <= 180 &&
      validTz(place.tz),
  );
}

function validTz(timeZone) {
  try {
    new Intl.DateTimeFormat("tr-TR", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function save() {
  const payload = {
    place: state.place,
    recents: state.recents,
    method: state.method,
    madhab: state.madhab,
    highLatitude: state.highLatitude,
    theme: state.theme,
    remind: state.remind,
    vesvese: state.vesvese,
    adjustments: state.adjustments,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    toast("Ayarlar kaydedilemedi");
  }
}

function fillMethods() {
  const select = $("method-select");
  for (const [id, label] of METHODS) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label;
    select.append(option);
  }
}

function syncForm() {
  $("method-select").value = state.method;
  $("madhab-select").value = state.madhab;
  $("latitude-select").value = state.highLatitude;
  $("remind-select").value = state.remind;
  $("vesvese-select").value = state.vesvese ? "on" : "off";
  syncMethodControl();
  renderVesveseSample();
  for (const input of document.querySelectorAll("[data-adj]")) {
    input.value = String(state.adjustments[input.dataset.adj] ?? 0);
  }
  $("remind-note").textContent = remindNote();
}

function bind() {
  document.querySelectorAll(".tabs button").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  $("place-button").addEventListener("click", openPlaceDialog);
  $("welcome-search").addEventListener("click", openPlaceDialog);
  document.querySelectorAll("[data-open-place]").forEach((button) => {
    button.addEventListener("click", openPlaceDialog);
  });
  $("welcome-geo").addEventListener("click", useGeo);
  $("geo-button").addEventListener("click", useGeo);
  $("place-close").addEventListener("click", () => $("place-dialog").close());
  $("place-dialog").addEventListener("click", (event) => {
    if (event.target === $("place-dialog")) $("place-dialog").close();
  });
  $("place-search").addEventListener("input", schedulePlaceSearch);
  $("coord-form").addEventListener("submit", onCoordSubmit);
  $("prev-day").addEventListener("click", () => shiftDay(-1));
  $("next-day").addEventListener("click", () => shiftDay(1));
  $("back-today").addEventListener("click", () => {
    state.pinned = false;
    ensureSelection();
    render();
  });
  $("prev-month").addEventListener("click", () => shiftMonth(-1));
  $("next-month").addEventListener("click", () => shiftMonth(1));
  $("copy-button").addEventListener("click", copyTimes);
  $("share-button").addEventListener("click", shareTimes);
  $("share-app").addEventListener("click", shareApp);
  $("method-select").addEventListener("change", () => {
    state.method = $("method-select").value;
    syncMethodControl();
    save();
    render();
  });
  $("madhab-select").addEventListener("change", () => {
    state.madhab = $("madhab-select").value;
    syncMethodControl();
    save();
    render();
  });
  $("latitude-select").addEventListener("change", () => {
    state.highLatitude = $("latitude-select").value;
    save();
    render();
  });
  $("theme-toggle").addEventListener("click", () => {
    setTheme(resolvedTheme() === "dark" ? "light" : "dark");
  });
  document.querySelectorAll("button[data-theme]").forEach((button) => {
    button.addEventListener("click", () => setTheme(button.dataset.theme));
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.theme === "system") applyPalette();
  });
  $("remind-select").addEventListener("change", onRemindChange);
  $("vesvese-select").addEventListener("change", onVesveseChange);
  $("vesvese-next").addEventListener("click", () => renderVesveseSample(true));
  $("vesvese-try").addEventListener("click", tryHomeVesvese);
  $("vesvese-besmele").addEventListener("click", dismissHomeVesvese);
  document.querySelectorAll("[data-adj]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.adj;
      let n = Number.parseInt(input.value, 10);
      if (!Number.isFinite(n)) n = 0;
      n = Math.max(-30, Math.min(30, n));
      input.value = String(n);
      state.adjustments[key] = n;
      save();
      render();
    });
    input.addEventListener("wheel", () => input.blur(), { passive: true });
  });
  $("reset-button").addEventListener("click", () => {
    if (!window.confirm("Konum ve ayarlar silinsin mi?")) return;
    localStorage.removeItem(STORAGE_KEY);
    const fresh = loadState();
    Object.assign(state, fresh);
    syncForm();
    ensureSelection();
    render();
    toast("Ayarlar sıfırlandı");
  });
  $("compass-permit").addEventListener("click", enableCompass);
  $("install-button").addEventListener("click", installApp);
  $("install-close").addEventListener("click", () => $("install-dialog").close());
  $("install-later").addEventListener("click", () => $("install-dialog").close());
  $("install-done").addEventListener("click", () => {
    if ($("install-done").dataset.mark === "1") markInstalled();
    if ($("install-dialog").open) $("install-dialog").close();
  });
  $("install-native").addEventListener("click", () => installApp());
  $("install-dialog").addEventListener("click", (event) => {
    if (event.target === $("install-dialog")) $("install-dialog").close();
  });
  $("notify-close").addEventListener("click", () => finishNotifyAsk(false));
  $("notify-later").addEventListener("click", () => finishNotifyAsk(false));
  $("notify-again").addEventListener("click", async () => {
    if (await askNotificationPermission()) {
      finishNotifyAsk(true);
      return;
    }
    $("notify-copy").textContent = notifyRetryCopy();
  });
  $("notify-dialog").addEventListener("close", () => {
    if (!notifyRetry) return;
    const resolve = notifyRetry;
    notifyRetry = null;
    resolve(false);
  });
  $("notify-dialog").addEventListener("click", (event) => {
    if (event.target === $("notify-dialog")) finishNotifyAsk(false);
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    window.__vakitlerInstall = event;
    refreshInstallButton();
  });
  window.addEventListener("appinstalled", () => {
    markInstalled();
  });
  window.matchMedia("(display-mode: standalone)").addEventListener("change", refreshInstallButton);
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);
  document.addEventListener("keydown", (event) => {
    if (event.target.closest("input, select, textarea")) return;
    if (state.view !== "today" || !state.place) return;
    if (event.key === "ArrowLeft") shiftDay(-1);
    if (event.key === "ArrowRight") shiftDay(1);
  });
}

function isJafari() {
  return isJafariMadhab(state.madhab);
}

function syncMethodControl() {
  const jafari = isJafari();
  $("method-select").disabled = jafari;
  $("method-hint").textContent = jafari
    ? "Caferî kendi açılarını kullanır. Başka bir mezhebe geçince seçtiğin hesap yöntemi geri gelir."
    : methodHint(state.method);
  const hint = $("madhab-hint");
  hint.hidden = !jafari;
  hint.textContent = jafari
    ? "İmsak 16°, akşam güneş 4° batınca, yatsı 14°. İkindi erken hesaplanır."
    : "";
}

function methodHint(id) {
  return METHODS.find(([key]) => key === id)?.[2] || "";
}

function methodLabel(id) {
  return METHODS.find(([key]) => key === id)?.[1] || id;
}

function showView(name) {
  state.view = name;
  for (const view of ["today", "month", "qibla", "settings"]) {
    $("view-" + view).hidden = view !== name;
    const button = document.querySelector(`.tabs button[data-view="${view}"]`);
    if (view === name) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  if (name === "qibla") watchCompass();
}

const HOME_KEY = "vakitler.home";

function isIos() {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function client() {
  const ua = navigator.userAgent;
  const ios = isIos();
  const android = /android/i.test(ua);
  let browser = "other";
  if (/Instagram/i.test(ua)) browser = "instagram";
  else if (/FBAN|FBAV/i.test(ua)) browser = "facebook";
  else if (/WhatsApp/i.test(ua)) browser = "whatsapp";
  else if (/; wv\)|WebView/i.test(ua)) browser = "webview";
  else if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) || /GSA\//i.test(ua)) {
    if (/CriOS/i.test(ua)) browser = "chrome";
    else if (/FxiOS/i.test(ua)) browser = "firefox";
    else if (/EdgiOS/i.test(ua)) browser = "edge";
    else if (/OPiOS/i.test(ua)) browser = "opera";
    else browser = "google";
  } else if (/SamsungBrowser/i.test(ua)) browser = "samsung";
  else if (/EdgA\/|Edg\//i.test(ua)) browser = "edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "opera";
  else if (/Firefox\//i.test(ua)) browser = "firefox";
  else if (/Chrome\//i.test(ua)) browser = "chrome";
  else if (/Safari/i.test(ua)) browser = "safari";
  const platform = ios ? "ios" : android ? "android" : "desktop";
  return { platform, browser };
}

function installGuide() {
  const { platform, browser } = client();
  const native = Boolean(window.__vakitlerInstall);
  const inApp = ["instagram", "facebook", "whatsapp", "webview", "google"].includes(browser);
  if (platform === "ios" && browser === "safari") {
    return {
      label: "Ana ekrana ekle",
      title: "Ana ekrana ekle",
      steps: [
        "Safari’deki **paylaş** düğmesine bas. Kare içinde yukarı ok.",
        "Listeden **Ana Ekrana Ekle** satırını seç. Telefon İngilizceyse **Add to Home Screen** yazar.",
        "**Ekle**’ye bas. Vakitler ikonu ana ekrana gelir.",
      ],
      done: "Ekledim",
      marksInstalled: true,
    };
  }
  if (platform === "ios" && ["chrome", "edge", "firefox", "opera"].includes(browser)) {
    const name = { chrome: "Chrome", edge: "Edge", firefox: "Firefox", opera: "Opera" }[browser];
    const share = browser === "chrome"
      ? "Chrome’da adres çubuğunun sağındaki **paylaş** düğmesine bas. Kare içinde yukarı ok."
      : `${name} içindeki **paylaş** düğmesine bas. Kare içinde yukarı ok.`;
    return {
      label: "Ana ekrana ekle",
      title: "Ana ekrana ekle",
      steps: [
        share,
        "Listeden **Ana Ekrana Ekle** satırını seç. Telefon İngilizceyse **Add to Home Screen** yazar.",
        "**Ekle**’ye bas. Vakitler ikonu ana ekrana gelir.",
      ],
      done: "Ekledim",
      marksInstalled: true,
    };
  }
  if (platform === "ios") {
    const name = {
      google: "Google",
      instagram: "Instagram",
      facebook: "Facebook",
      whatsapp: "WhatsApp",
    }[browser] || "Bu uygulama";
    return {
      label: "Tarayıcıda aç",
      title: "Önce tarayıcıda aç",
      steps: [
        `${name} içinden ana ekrana eklenemez.`,
        "Menüden **Safari’de Aç** veya **Chrome’da Aç** de.",
        "Açılınca **paylaş** düğmesine bas, **Ana Ekrana Ekle**’yi seç.",
      ],
      done: "Anladım",
      marksInstalled: false,
    };
  }
  if (inApp) {
    return {
      label: "Chrome’da aç",
      title: "Önce Chrome’a geç",
      steps: [
        "Bu sayfa başka bir uygulamanın içinde açıldı.",
        "Menüden **Chrome’da aç** de.",
        "Chrome’da **Uygulamayı yükle** veya **Ana ekrana ekle**’yi seç.",
      ],
      done: "Anladım",
      marksInstalled: false,
    };
  }
  if (native) {
    const host = browser === "samsung" ? "Samsung Internet" : browser === "edge" ? "Edge" : browser === "opera" ? "Opera" : "Chrome";
    const label = {
      edge: "Edge’e yükle",
      samsung: "Samsung’a yükle",
      opera: "Opera’ya yükle",
      chrome: "Chrome’a yükle",
    }[browser] || "Uygulamayı yükle";
    return {
      label,
      title: `${host} ile yükle`,
      native: true,
      steps: [`${host} kendi yükleme penceresini açar. **Yükle**’ye bas.`],
      done: "Ekledim",
      marksInstalled: true,
    };
  }
  if (platform === "android" && browser === "firefox") {
    return {
      label: "Firefox’a ekle",
      title: "Firefox’a ekle",
      steps: [
        "Sağ üstteki **üç nokta**ya bas.",
        "**Yükle** veya **Ana ekrana ekle** satırını seç.",
        "Onayla. Vakitler ikonu ana ekrana gelir.",
      ],
      done: "Ekledim",
      marksInstalled: true,
    };
  }
  if (platform === "android" && browser === "samsung") {
    return {
      label: "Samsung’a ekle",
      title: "Ana ekrana ekle",
      steps: [
        "Alt menüdeki **üç çizgi**ye bas.",
        "**Sayfa ekle**, sonra **Ana ekran**’ı seç.",
        "**Ekle**’ye bas.",
      ],
      done: "Ekledim",
      marksInstalled: true,
    };
  }
  if (platform === "android") {
    return {
      label: "Ana ekrana ekle",
      title: "Ana ekrana ekle",
      steps: [
        "Tarayıcı menüsündeki **üç nokta**ya bas.",
        "**Ana ekrana ekle** veya **Uygulamayı yükle** satırını seç.",
        "**Ekle**’ye bas.",
      ],
      done: "Ekledim",
      marksInstalled: true,
    };
  }
  if (platform === "desktop" && browser === "safari") {
    return {
      label: "Dock’a ekle",
      title: "Dock’a ekle",
      steps: [
        "Safari’de **paylaş** düğmesine bas.",
        "**Dock’a Ekle**’yi seç.",
        "**Ekle**’ye bas. Vakitler Dock’ta uygulama gibi açılır.",
      ],
      done: "Ekledim",
      marksInstalled: true,
    };
  }
  return null;
}

function fillInstallSteps(steps) {
  const list = $("install-steps");
  list.replaceChildren();
  for (const step of steps) {
    const item = document.createElement("li");
    const parts = step.split(/\*\*(.+?)\*\*/);
    parts.forEach((part, index) => {
      if (!part) return;
      if (index % 2 === 1) {
        const strong = document.createElement("strong");
        strong.textContent = part;
        item.append(strong);
      } else {
        item.append(part);
      }
    });
    list.append(item);
  }
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.matchMedia("(display-mode: fullscreen)").matches
    || navigator.standalone === true;
}

function markInstalled() {
  try {
    localStorage.setItem(HOME_KEY, "1");
  } catch {
    /* depolama kapalı */
  }
  window.__vakitlerInstall = null;
  refreshInstallButton();
}

function homeFlag() {
  try {
    return localStorage.getItem(HOME_KEY) === "1";
  } catch {
    return false;
  }
}

function refreshInstallButton() {
  if (isStandalone()) {
    try {
      localStorage.setItem(HOME_KEY, "1");
    } catch {
      /* depolama kapalı */
    }
  }
  const guide = installGuide();
  const offer = !isStandalone() && !homeFlag() && Boolean(guide);
  const button = $("install-button");
  button.hidden = !offer;
  if (guide) button.textContent = guide.label;
  document.documentElement.dataset.standalone = isStandalone() ? "true" : "false";
}

async function installApp() {
  const guide = installGuide();
  if (!guide) return;
  const prompt = window.__vakitlerInstall;
  if (guide.native && prompt) {
    try {
      prompt.prompt();
      const choice = await prompt.userChoice;
      window.__vakitlerInstall = null;
      if (choice.outcome === "accepted") markInstalled();
      else refreshInstallButton();
      return;
    } catch {
      window.__vakitlerInstall = null;
    }
  }
  $("install-title").textContent = guide.title;
  fillInstallSteps(guide.steps);
  const done = $("install-done");
  done.textContent = guide.done;
  done.dataset.mark = guide.marksInstalled ? "1" : "0";
  $("install-native").hidden = !guide.native;
  $("install-later").hidden = !guide.marksInstalled;
  $("install-steps").hidden = false;
  done.hidden = false;
  if (!$("install-dialog").open) $("install-dialog").showModal();
}

function openPlaceDialog() {
  const dialog = $("place-dialog");
  if (!$("tz-input").value) {
    $("tz-input").value = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Istanbul";
  }
  $("geo-status").textContent = "";
  renderPlaceResults();
  dialog.showModal();
  $("place-search").focus();
}

let placeSearchSeq = 0;
let placeSearchTimer = 0;

function schedulePlaceSearch() {
  window.clearTimeout(placeSearchTimer);
  const query = $("place-search").value.trim();
  if (fold(query).length < 2) {
    renderPlaceResults();
    return;
  }
  placeSearchTimer = window.setTimeout(() => {
    renderPlaceResults();
  }, 280);
}

function renderPlaceResults() {
  const query = $("place-search").value.trim();
  const root = $("place-results");
  root.replaceChildren();
  if (!query) {
    if (state.recents.length) addPlaceGroup(root, "Son kullanılan", state.recents);
    addPlaceGroup(root, "Sık kullanılan", FEATURED_IDS.map((id) => byId.get(id)).filter(Boolean));
    return;
  }
  const local = searchPlaces(query);
  const folded = fold(query);
  if (folded.length < 2) {
    if (local.length) addPlaceGroup(root, "Kayıtlı yerler", local);
    else {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Dünya genelinde aramak için en az 2 harf yazın.";
      root.append(empty);
    }
    return;
  }
  const pending = document.createElement("p");
  pending.className = "hint";
  pending.textContent = "Dünya şehirleri aranıyor…";
  root.append(pending);
  if (local.length) addPlaceGroup(root, "Kayıtlı yerler", local);
  const seq = ++placeSearchSeq;
  void finishPlaceSearch(query, local, seq);
}

async function finishPlaceSearch(query, local, seq) {
  let remote = [];
  let failed = false;
  try {
    remote = await searchRemotePlaces(query);
  } catch {
    failed = true;
  }
  if (seq !== placeSearchSeq) return;
  const root = $("place-results");
  root.replaceChildren();
  const remoteOnly = remote.filter((place) => !local.some((item) => placesSimilar(item, place)));
  if (!local.length && !remoteOnly.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = failed
      ? "Dünya şehirleri alınamadı. Biraz sonra yeniden deneyin veya koordinat girin."
      : "Sonuç yok. Farklı bir yazım veya koordinat deneyin.";
    root.append(empty);
    return;
  }
  if (remoteOnly.length) addPlaceGroup(root, "Dünya şehirleri", remoteOnly);
  else if (failed) {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = "Dünya şehirleri alınamadı. Kayıtlı yerler gösteriliyor.";
    root.append(note);
  }
  if (local.length) addPlaceGroup(root, "Kayıtlı yerler", local);
}

function addPlaceGroup(root, title, places) {
  const heading = document.createElement("h3");
  heading.textContent = title;
  root.append(heading);
  for (const place of places) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "result";
    const name = document.createElement("span");
    name.textContent = place.name;
    const region = document.createElement("small");
    region.textContent = place.region;
    button.append(name, region);
    button.addEventListener("click", () => choosePlace(place));
    root.append(button);
  }
}

function searchPlaces(query) {
  const folded = fold(query);
  const scored = [];
  for (const place of PLACES) {
    const name = fold(place.name);
    const region = fold(place.region);
    let score = 0;
    if (name.startsWith(folded)) score = 100;
    else if (name.includes(folded)) score = 70;
    else if (`${name} ${region}`.includes(folded)) score = 40;
    else continue;
    if (place.region === "Türkiye") score += 2;
    scored.push({ place, score });
  }
  scored.sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name, "tr"));
  return scored.slice(0, 40).map((item) => item.place);
}

const remotePlaceCache = new Map();

function remotePlaceRegion(item) {
  if (item.admin1 && item.country && item.admin1 !== item.country) return `${item.admin1}, ${item.country}`;
  return item.country || item.admin1 || "";
}

function placeFromGeocode(item) {
  const region = remotePlaceRegion(item);
  return {
    id: `geoname-${item.id}`,
    name: item.name,
    region,
    lat: item.latitude,
    lon: item.longitude,
    tz: item.timezone || "UTC",
    population: Number(item.population) || 0,
  };
}

function preferCities(places) {
  const cities = places.filter((place) => place.population >= 1000);
  return (cities.length ? cities : places).slice(0, 25);
}

function placesSimilar(a, b) {
  if (a.id === b.id) return true;
  return haversine(a.lat, a.lon, b.lat, b.lon) < 25;
}

async function searchRemotePlaces(query) {
  const key = fold(query);
  if (key.length < 2) return [];
  if (remotePlaceCache.has(key)) return remotePlaceCache.get(key);
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query.trim());
  url.searchParams.set("count", "50");
  url.searchParams.set("language", "tr");
  url.searchParams.set("format", "json");
  const response = await fetch(url);
  if (!response.ok) throw new Error("geocode");
  const data = await response.json();
  const places = preferCities((data.results || []).map(placeFromGeocode).filter(validPlace));
  remotePlaceCache.set(key, places);
  return places;
}

function fold(value) {
  return value
    .toLocaleLowerCase("tr")
    .replace(/i̇/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

let locating = false;
let locatingToken = 0;
const geocodeCache = new Map();

function coordRegion(value) {
  return typeof value === "string" && /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(value);
}

function isCustomCoordsPlace(place) {
  return Boolean(place?.id?.startsWith("gps-") || place?.id?.startsWith("coord-"));
}

function needsPlaceLabel(place) {
  if (!isCustomCoordsPlace(place)) return false;
  if (place.name === "Bulunduğum yer" || place.name === "Koordinat" || place.name === "Konum belirleniyor…") return true;
  return coordRegion(place.region);
}

function placeDisplayName(place) {
  if (!place) return "Şehir seç";
  if (!place.region || coordRegion(place.region) || place.region === place.name) return place.name;
  if (place.id?.startsWith("tr-")) return place.name;
  return `${place.name}, ${place.region}`;
}

function applyResolvedLabel(place, label) {
  const next = {
    ...place,
    name: label.name,
    region: label.region || "",
    tz: label.tz && validTz(label.tz) ? label.tz : place.tz,
  };
  if (!state.place || state.place.id !== place.id) return;
  state.place = next;
  state.recents = state.recents.map((item) => (item.id === place.id ? next : item));
  save();
  render();
}

async function lookupPlaceLabel(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  const label = (await labelFromBigData(lat, lon)) || (await labelFromNominatim(lat, lon));
  if (!label) return null;
  if (!label.tz) label.tz = await timezoneNear(lat, lon, label.name);
  geocodeCache.set(key, label);
  return label;
}

async function labelFromBigData(lat, lon) {
  try {
    const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("localityLanguage", "tr");
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const name = data.city || data.locality || data.principalSubdivision || "";
    if (!name) return null;
    return { name, region: data.countryName || "", tz: "" };
  } catch {
    return null;
  }
}

async function labelFromNominatim(lat, lon) {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("accept-language", "tr");
    url.searchParams.set("zoom", "10");
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const data = await response.json();
    const address = data.address || {};
    const name = address.city || address.town || address.village || address.municipality || data.name || "";
    if (!name) return null;
    return { name, region: address.country || "", tz: "" };
  } catch {
    return null;
  }
}

async function timezoneNear(lat, lon, name) {
  try {
    const nearby = await searchRemotePlaces(name);
    const match = nearby
      .map((item) => ({ item, km: haversine(lat, lon, item.lat, item.lon) }))
      .sort((a, b) => a.km - b.km)
      .find((entry) => entry.km <= 80 && validTz(entry.item.tz));
    return match ? match.item.tz : "";
  } catch {
    return "";
  }
}

async function resolvePlaceLabel(place, token) {
  if (!needsPlaceLabel(place)) return;
  const label = await lookupPlaceLabel(place.lat, place.lon);
  if (token !== undefined && token !== locatingToken) return;
  if (!label) {
    if (state.place?.id !== place.id) return;
    if (place.id.startsWith("gps-")) {
      applyResolvedLabel(place, { name: "Bulunduğum yer", region: "" });
    } else if (place.id.startsWith("coord-")) {
      applyResolvedLabel(place, {
        name: "Koordinat",
        region: `${place.lat.toFixed(2)}, ${place.lon.toFixed(2)}`,
      });
    }
    return;
  }
  applyResolvedLabel(place, label);
}

function setGeoStatus(message) {
  $("geo-status").textContent = message;
  const welcome = $("welcome-geo-status");
  if (welcome) welcome.textContent = message;
}

function setGeoBusy(busy) {
  for (const id of ["welcome-geo", "geo-button"]) {
    const button = $(id);
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? "Konum alınıyor…" : button.dataset.label;
  }
}

function geoMessage(error) {
  if (error.code === 1) return "Konum izni verilmedi. Şehir arayabilirsiniz.";
  if (error.code === 3) return "Konum gecikti. Şehir arayabilirsiniz.";
  return "Konum alınamadı. Şehir arayabilirsiniz.";
}

async function finishGeo(token, position) {
  if (token !== locatingToken) return;
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  const near = nearestPlace(lat, lon);
  if (near && near.km <= 25) {
    locating = false;
    setGeoBusy(false);
    setGeoStatus("");
    choosePlace(near.place);
    return;
  }
  setGeoStatus("Şehir bulunuyor…");
  const label = await lookupPlaceLabel(lat, lon);
  if (token !== locatingToken) return;
  locating = false;
  setGeoBusy(false);
  setGeoStatus("");
  const tz = label?.tz && validTz(label.tz)
    ? label.tz
    : Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Istanbul";
  choosePlace({
    id: `gps-${lat.toFixed(3)}-${lon.toFixed(3)}`,
    name: label?.name || "Bulunduğum yer",
    region: label?.region || "",
    lat,
    lon,
    tz,
  });
}

function failGeo(token, error) {
  if (token !== locatingToken) return;
  locating = false;
  setGeoBusy(false);
  setGeoStatus(geoMessage(error));
}

function useGeo() {
  if (locating) return;
  if (!navigator.geolocation) {
    setGeoStatus("Bu tarayıcı konum vermiyor.");
    return;
  }
  locating = true;
  const token = ++locatingToken;
  setGeoBusy(true);
  setGeoStatus("");
  const precise = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
  navigator.geolocation.getCurrentPosition(
    (rough) => {
      if (token !== locatingToken) return;
      const accuracy = rough.coords.accuracy;
      if (Number.isFinite(accuracy) && accuracy <= 3000) {
        finishGeo(token, rough);
        return;
      }
      setGeoStatus("Konum netleşiyor…");
      navigator.geolocation.getCurrentPosition(
        (better) => finishGeo(token, better),
        () => finishGeo(token, rough),
        precise,
      );
    },
    (error) => {
      if (token !== locatingToken) return;
      if (error.code === 1) {
        failGeo(token, error);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => finishGeo(token, position),
        (err) => failGeo(token, err),
        precise,
      );
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 },
  );
}

function nearestPlace(lat, lon) {
  let best = null;
  let bestKm = Infinity;
  for (const place of PLACES) {
    const km = haversine(lat, lon, place.lat, place.lon);
    if (km < bestKm) {
      bestKm = km;
      best = place;
    }
  }
  return best ? { place: best, km: bestKm } : null;
}

function onCoordSubmit(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const lat = Number(String(data.get("lat")).replace(",", "."));
  const lon = Number(String(data.get("lon")).replace(",", "."));
  const tz = String(data.get("tz") || "").trim();
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    $("geo-status").textContent = "Enlem veya boylam geçersiz.";
    return;
  }
  if (!validTz(tz)) {
    $("geo-status").textContent = "Saat dilimi tanınmadı. Örnek: Europe/Istanbul";
    return;
  }
  const place = {
    id: `coord-${lat.toFixed(3)}-${lon.toFixed(3)}`,
    name: "Konum belirleniyor…",
    region: "",
    lat,
    lon,
    tz,
  };
  choosePlace(place);
  if (needsPlaceLabel(place)) void resolvePlaceLabel(place);
}

function choosePlace(place) {
  state.place = place;
  state.pinned = false;
  state.recents = [place, ...state.recents.filter((item) => item.id !== place.id)].slice(0, 6);
  save();
  ensureSelection();
  if ($("place-dialog").open) $("place-dialog").close();
  render();
}

function ensureSelection() {
  if (!state.place) return;
  const today = cityToday(state.place.tz);
  if (!state.pinned || !state.selected) state.selected = today;
  if (!state.month) state.month = { y: state.selected.y, m: state.selected.m };
}

function shiftDay(amount) {
  if (!state.place) return;
  state.pinned = true;
  state.selected = addDays(state.selected, amount);
  state.month = { y: state.selected.y, m: state.selected.m };
  if (sameDay(state.selected, cityToday(state.place.tz))) state.pinned = false;
  render();
}

function shiftMonth(amount) {
  const cursor = new Date(Date.UTC(state.month.y, state.month.m - 1 + amount, 1));
  state.month = { y: cursor.getUTCFullYear(), m: cursor.getUTCMonth() + 1 };
  renderMonth();
}

function render() {
  ensureSelection();
  applyPalette();
  $("place-name").textContent = placeDisplayName(state.place);
  document.querySelector(".place-action").textContent = state.place ? "Değiştir" : "Seç";
  document.querySelectorAll("[data-need-place]").forEach((element) => {
    element.hidden = Boolean(state.place);
  });
  document.querySelectorAll("[data-has-place]").forEach((element) => {
    element.hidden = !state.place;
  });
  renderHeader();
  renderToday();
  renderMonth();
  renderQibla();
  showView(state.view);
  armReminder();
}

function renderHeader() {
  const dateLine = $("date-line");
  const hijriLine = $("hijri-line");
  if (!state.place || !state.selected) {
    dateLine.textContent = "Bir konum seçin";
    hijriLine.textContent = "";
    return;
  }
  dateLine.textContent = formatLong(state.selected);
  hijriLine.textContent = hijriLabel(state.selected);
}

function renderToday() {
  if (!state.place) return;
  const today = cityToday(state.place.tz);
  const isToday = sameDay(state.selected, today);
  $("day-label").textContent = isToday ? "Bugün" : formatLong(state.selected);
  $("back-today").hidden = isToday;
  const pack = compute(state.place, state.selected);
  fillTimes($("time-list"), pack, state.place, state.selected, today);
  const sunnah = $("sunnah");
  if (pack?.sunnah && isValidDate(pack.sunnah.middleOfTheNight) && isValidDate(pack.sunnah.lastThirdOfTheNight)) {
    sunnah.hidden = false;
    $("sunnah-mid").textContent = formatClock(pack.sunnah.middleOfTheNight, state.place.tz);
    $("sunnah-mid").dateTime = pack.sunnah.middleOfTheNight.toISOString();
    $("sunnah-last").textContent = formatClock(pack.sunnah.lastThirdOfTheNight, state.place.tz);
    $("sunnah-last").dateTime = pack.sunnah.lastThirdOfTheNight.toISOString();
  } else {
    sunnah.hidden = true;
  }
  $("method-note").textContent = methodNote(state.madhab, methodLabel(state.method));
  renderHero();
  renderHomeVesvese();
}

function renderHero() {
  if (!state.place || !state.selected) return;
  const today = cityToday(state.place.tz);
  const isToday = sameDay(state.selected, today);
  const upcoming = nextEvent();
  const kicker = $("hero-kicker");
  const name = $("hero-name");
  const time = $("hero-time");
  const sub = $("hero-sub");
  const progress = $("progress");
  const chip = $("live-chip");
  if (!isToday) {
    kicker.textContent = "Seçilen gün";
    name.textContent = weekday(state.selected);
    time.textContent = dayMonth(state.selected);
    time.classList.add("is-word");
    sub.textContent = hijriLabel(state.selected);
    progress.hidden = true;
    if (upcoming?.next) {
      chip.hidden = false;
      chip.textContent = `Sıradaki · ${NAMES[upcoming.next.key]} ${formatClock(upcoming.next.date, state.place.tz)} · ${formatRemain(upcoming.next.date.getTime() - Date.now())}`;
    }
    document.title = `${dayMonth(state.selected)} · Vakitler`;
    return;
  }
  time.classList.remove("is-word");
  chip.hidden = true;
  if (!upcoming?.next) {
    kicker.textContent = "Vakit";
    name.textContent = "—";
    time.textContent = "—";
    sub.textContent = "Bu tarih için vakit hesaplanamadı.";
    progress.hidden = true;
    return;
  }
  const next = upcoming.next;
  kicker.textContent = next.key === "sunrise" ? "Güneş doğuşu" : "Sıradaki vakit";
  name.textContent = NAMES[next.key];
  time.textContent = formatClock(next.date, state.place.tz);
  sub.textContent = formatRemain(next.date.getTime() - Date.now());
  if (upcoming.prev) {
    const span = next.date.getTime() - upcoming.prev.date.getTime();
    const pct = span > 0 ? ((Date.now() - upcoming.prev.date.getTime()) / span) * 100 : 0;
    const clamped = Math.max(0, Math.min(100, pct));
    progress.hidden = false;
    $("progress-fill").style.width = `${clamped}%`;
    progress.setAttribute("aria-valuenow", String(Math.round(clamped)));
  } else {
    progress.hidden = true;
  }
  const title = `${NAMES[next.key]} ${formatClock(next.date, state.place.tz)} · Vakitler`;
  if (document.title !== title) document.title = title;
}

function renderMonth() {
  if (!state.place || !state.month || !state.selected) return;
  const labelDate = new Date(Date.UTC(state.month.y, state.month.m - 1, 1, 12));
  $("month-label").textContent = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(labelDate);
  const grid = $("month-grid");
  grid.replaceChildren();
  const first = new Date(Date.UTC(state.month.y, state.month.m - 1, 1));
  const startPad = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(state.month.y, state.month.m, 0)).getUTCDate();
  const today = cityToday(state.place.tz);
  for (let i = 0; i < startPad; i += 1) {
    const pad = document.createElement("span");
    pad.className = "pad";
    grid.append(pad);
  }
  for (let day = 1; day <= days; day += 1) {
    const parts = { y: state.month.y, m: state.month.m, d: day };
    const button = document.createElement("button");
    button.type = "button";
    const stamp = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
    if (stamp.getUTCDay() === 5) button.classList.add("is-friday");
    if (sameDay(parts, today)) button.classList.add("is-today");
    if (sameDay(parts, state.selected)) button.classList.add("is-selected");
    const number = document.createElement("span");
    number.textContent = String(day);
    const small = document.createElement("small");
    small.textContent = hijri(parts)?.day || "";
    button.append(number, small);
    button.setAttribute("aria-label", `${formatLong(parts)}, ${hijriLabel(parts)}`);
    button.addEventListener("click", () => {
      state.selected = parts;
      state.pinned = !sameDay(parts, cityToday(state.place.tz));
      render();
    });
    grid.append(button);
  }
  $("month-caption").textContent = formatLong(state.selected);
  fillTimes($("month-times"), compute(state.place, state.selected), state.place, state.selected, today);
}

function renderQibla() {
  if (!state.place) return;
  const place = state.place;
  const bearing = Qibla(new Coordinates(place.lat, place.lon));
  $("compass").style.setProperty("--qibla", `${bearing.toFixed(2)}deg`);
  $("qibla-deg").textContent = `${Math.round(bearing)}°`;
  $("qibla-place").textContent = place.region ? `${place.name}, ${place.region}` : place.name;
  const km = haversine(place.lat, place.lon, KAABA.lat, KAABA.lon);
  $("qibla-distance").textContent = `Kâbe’ye ${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(km)} km`;
}

function fillTimes(list, pack, place, selected, today) {
  list.replaceChildren();
  if (!pack) {
    const item = document.createElement("li");
    item.textContent = "Bu tarih için vakit hesaplanamadı.";
    list.append(item);
    return;
  }
  const now = new Date();
  const isToday = sameDay(selected, today);
  const dayStamp = Date.UTC(selected.y, selected.m - 1, selected.d);
  const todayStamp = Date.UTC(today.y, today.m - 1, today.d);
  let nextKey = null;
  let currentKey = null;
  if (isToday) {
    for (const key of ORDER) {
      if (now >= pack.times[key]) currentKey = key;
      else if (!nextKey) nextKey = key;
    }
  }
  for (const key of ORDER) {
    const item = document.createElement("li");
    if (!isToday) item.className = dayStamp < todayStamp ? "past" : "later";
    else if (key === currentKey) item.className = "current";
    else if (pack.times[key] <= now) item.className = "past";
    else if (key === nextKey) item.className = "next";
    if (key === currentKey) item.setAttribute("aria-current", "true");
    const mark = document.createElement("span");
    mark.className = "mark";
    const label = document.createElement("span");
    label.className = "pname";
    label.textContent = NAMES[key];
    const clock = document.createElement("time");
    clock.dateTime = pack.times[key].toISOString();
    clock.textContent = formatClock(pack.times[key], place.tz);
    item.append(mark, label, clock);
    list.append(item);
  }
}

function updateLive() {
  if (!state.place) return;
  const today = cityToday(state.place.tz);
  if (!state.pinned && !sameDay(state.selected, today)) {
    state.selected = today;
    state.month = { y: today.y, m: today.m };
    render();
    return;
  }
  if (resolvedTheme() !== state.appliedPalette) applyPalette();
  renderHero();
  renderHomeVesvese();
  checkReminders();
}

function resolvedTheme() {
  if (state.theme === "dark") return "dark";
  if (state.theme === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function setTheme(theme) {
  state.theme = theme;
  save();
  applyPalette();
}

function syncThemeControls() {
  const dark = resolvedTheme() === "dark";
  const toggle = $("theme-toggle");
  toggle.textContent = dark ? "Aydınlık" : "Karanlık";
  toggle.setAttribute("aria-pressed", dark ? "true" : "false");
  toggle.setAttribute("aria-label", dark ? "Aydınlık temaya geç" : "Karanlık temaya geç");
  for (const button of document.querySelectorAll("button[data-theme]")) {
    button.setAttribute("aria-checked", button.dataset.theme === state.theme ? "true" : "false");
  }
}

function currentPrayerKey() {
  if (!state.place) {
    const hour = new Date().getHours();
    if (hour < 5) return "fajr";
    if (hour < 8) return "sunrise";
    if (hour < 12) return "dhuhr";
    if (hour < 16) return "asr";
    if (hour < 19) return "maghrib";
    return "isha";
  }
  const pack = compute(state.place, cityToday(state.place.tz));
  if (!pack) return "isha";
  const now = new Date();
  let key = "fajr";
  for (const name of ORDER) {
    if (now >= pack.times[name]) key = name;
  }
  return key;
}

function applyPalette() {
  const name = resolvedTheme();
  state.appliedPalette = name;
  const root = document.documentElement;
  root.dataset.theme = name;
  root.style.colorScheme = name;
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.setAttribute("content", THEME_COLOR[name]);
  syncThemeControls();
}

function compute(place, parts) {
  const key = [
    place.lat,
    place.lon,
    state.method,
    state.madhab,
    state.highLatitude,
    parts.y,
    parts.m,
    parts.d,
    state.adjustments.fajr,
    state.adjustments.sunrise,
    state.adjustments.dhuhr,
    state.adjustments.asr,
    state.adjustments.maghrib,
    state.adjustments.isha,
  ].join("|");
  if (calcCache.has(key)) return calcCache.get(key);
  let pack = null;
  try {
    const params = prayerParameters(state.madhab, state.method);
    params.highLatitudeRule = state.highLatitude;
    params.polarCircleResolution = PolarCircleResolution.AqrabBalad;
    for (const name of Object.keys(state.adjustments)) {
      params.adjustments[name] = state.adjustments[name];
    }
    const date = new Date(parts.y, parts.m - 1, parts.d, 12, 0, 0);
    const times = new PrayerTimes(new Coordinates(place.lat, place.lon), date, params);
    const ready = ORDER.every((name) => isValidDate(times[name]));
    if (!ready) pack = null;
    else {
      let sunnah = null;
      try {
        sunnah = new SunnahTimes(times);
      } catch {
        sunnah = null;
      }
      pack = { times, sunnah };
    }
  } catch {
    pack = null;
  }
  calcCache.set(key, pack);
  if (calcCache.size > 500) calcCache.clear();
  return pack;
}

function nextEvent() {
  const today = cityToday(state.place.tz);
  const events = [];
  for (const parts of [addDays(today, -1), today, addDays(today, 1)]) {
    const pack = compute(state.place, parts);
    if (!pack) continue;
    for (const key of ORDER) events.push({ key, date: pack.times[key] });
  }
  events.sort((a, b) => a.date - b.date);
  const now = Date.now();
  let prev = null;
  for (const event of events) {
    if (event.date.getTime() > now) return { next: event, prev };
    prev = event;
  }
  return { next: null, prev };
}

function shareText() {
  const pack = compute(state.place, state.selected);
  if (!pack) return "";
  const lines = [`${state.place.name} · ${formatLong(state.selected)}`];
  for (const key of ORDER) {
    lines.push(`${NAMES[key]}  ${formatClock(pack.times[key], state.place.tz)}`);
  }
  return lines.join("\n");
}

async function copyTimes() {
  const text = shareText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast("Vakitler kopyalandı");
  } catch {
    toast("Kopyalanamadı");
  }
}

async function shareTimes() {
  const text = shareText();
  if (!text || !navigator.share) return;
  try {
    await navigator.share({ title: "Vakitler", text });
  } catch {
    /* paylaşım iptal */
  }
}

async function shareApp() {
  const url = appBase().href;
  const text = "Reklamsız namaz vakitleri. Büyük yazıyla, ana ekrana eklenince uygulama gibi açılır.";
  if (navigator.share) {
    try {
      await navigator.share({ title: "Vakitler", text, url });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast("Bağlantı kopyalandı");
  } catch {
    toast(url);
  }
}

async function onRemindChange() {
  const value = $("remind-select").value;
  if (value !== "off") {
    if (isIos() && !isStandalone()) {
      $("remind-select").value = "off";
      state.remind = "off";
      $("remind-note").textContent = iosNotifyNote();
      save();
      armReminder();
      return;
    }
    const allowed = await ensureNotify();
    if (!allowed) {
      $("remind-select").value = "off";
      state.remind = "off";
      $("remind-note").textContent = notifyDeniedNote();
      save();
      armReminder();
      return;
    }
  }
  state.remind = value;
  $("remind-note").textContent = remindNote();
  save();
  checkReminders();
  armReminder();
}

function iosNotifyNote() {
  return "iPhone sekmede izin sormaz. Ana ekrandaki Vakitler ikonunu aç, oradan Hatırlatma’yı seç.";
}

function notifyDeniedNote() {
  if (!("Notification" in window)) return "Bu tarayıcı bildirim gönderemiyor.";
  if (isIos() && !isStandalone()) return iosNotifyNote();
  return "Bildirim izni kapalı. Ayarlar → Bildirimler → Vakitler bölümünden aç.";
}

function remindNote() {
  if (state.remind === "off") return "Kapalı. Vakit girince haber vermek için aç.";
  if (!("Notification" in window)) return "Bu tarayıcı bildirim gönderemiyor.";
  if (Notification.permission === "denied") return notifyDeniedNote();
  if (isIos() && !isStandalone()) return iosNotifyNote();
  if (state.remind === "0") return "Vakit girince o vakti bildirir. Uygulama açıkken çalışır.";
  return "Vakit gelmeden önce bildirir. Uygulama açıkken çalışır.";
}

let notifyRetry = null;
let stopNotifyWatch = () => {};

async function ensureNotify() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (await askNotificationPermission()) return true;
  if (notifyRetry) return false;
  $("notify-copy").textContent = notifyRetryCopy();
  const dialog = $("notify-dialog");
  const result = new Promise((resolve) => {
    notifyRetry = resolve;
  });
  if (!dialog.open) dialog.showModal();
  const stop = await watchNotifyGrant();
  if (!notifyRetry) {
    stop();
    return result;
  }
  stopNotifyWatch = stop;
  return result;
}

async function askNotificationPermission() {
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

function notifyRetryCopy() {
  if (!("Notification" in window)) return "Bu tarayıcı bildirim gönderemiyor.";
  if (Notification.permission === "denied") {
    if (isIos()) return "iPhone bu siteye bildirimi kapattı. Ayarlar → Bildirimler → Vakitler yolundan izin ver, sonra Tekrar sor’a bas.";
    return "Tarayıcı bu siteye bildirimi kapattı. Adres çubuğundaki kilit simgesinden Bildirimlere izin ver, sonra Tekrar sor’a bas.";
  }
  return "Bildirim sorusu kapanmış. Tekrar soralım mı?";
}

async function watchNotifyGrant() {
  if (!navigator.permissions?.query) return () => {};
  try {
    const status = await navigator.permissions.query({ name: "notifications" });
    const onChange = () => {
      if (status.state === "granted") finishNotifyAsk(true);
    };
    status.addEventListener("change", onChange);
    return () => status.removeEventListener("change", onChange);
  } catch {
    return () => {};
  }
}

function finishNotifyAsk(result) {
  stopNotifyWatch();
  stopNotifyWatch = () => {};
  const resolve = notifyRetry;
  notifyRetry = null;
  const dialog = $("notify-dialog");
  if (dialog?.open) dialog.close();
  resolve?.(result);
}

const NOTIFIED_KEY = "vakitler.notified";

function vesveseFaceUrl(face) {
  return new URL(`../icons/vesvese/${face}.jpg`, import.meta.url).href;
}

function homeVesveseTarget(now = Date.now()) {
  if (!state.vesvese || !state.place) return null;
  const today = cityToday(state.place.tz);
  if (!sameDay(state.selected, today)) return null;
  const candidates = [];
  const yesterday = addDays(today, -1);
  const packs = [
    [yesterday, compute(state.place, yesterday)],
    [today, compute(state.place, today)],
  ];
  for (const [day, pack] of packs) {
    if (!pack) continue;
    for (const key of PRAYER_KEYS) {
      const at = pack.times[key];
      if (!isValidDate(at) || at.getTime() > now) continue;
      candidates.push({ day, key, at: at.getTime() });
    }
  }
  const active = candidates.sort((a, b) => a.at - b.at).at(-1);
  if (!active || now - active.at < VESVESE_HOME_DELAY) return null;
  const id = `${active.day.y}-${active.day.m}-${active.day.d}-${active.key}`;
  let dismissed = "";
  try {
    dismissed = localStorage.getItem(VESVESE_HOME_KEY) || "";
  } catch {
    dismissed = "";
  }
  if (dismissed === id) return null;
  return { id, key: active.key };
}

function paintHomeVesvese(card, sample) {
  const face = $("vesvese-home-face");
  face.src = vesveseFaceUrl(sample.face);
  face.alt = "Kurnaz gülen şeytan";
  $("vesvese-home-title").textContent = sample.title;
  $("vesvese-home-line").textContent = sample.body;
  card.hidden = false;
}

function renderHomeVesvese() {
  const card = $("vesvese-home");
  if (!card || card.classList.contains("is-leaving")) return;
  if (homeVesvesePreview && homeVesveseSample) {
    paintHomeVesvese(card, homeVesveseSample);
    return;
  }
  const target = homeVesveseTarget();
  if (!target) {
    card.hidden = true;
    return;
  }
  if (homeVesveseId !== target.id || !homeVesveseSample) {
    homeVesveseId = target.id;
    homeVesveseSample = pickVesvese();
  }
  paintHomeVesvese(card, homeVesveseSample);
}

function tryHomeVesvese() {
  if (!PREPROD || !state.vesvese) return;
  if (!state.place) {
    toast("Önce bir şehir seç");
    return;
  }
  if (!vesveseSample) vesveseSample = pickVesvese();
  const card = $("vesvese-home");
  card?.classList.remove("is-leaving");
  homeVesveseSample = vesveseSample;
  homeVesveseId = "preview";
  homeVesvesePreview = true;
  const today = cityToday(state.place.tz);
  if (!sameDay(state.selected, today)) {
    state.selected = today;
    state.month = { y: today.y, m: today.m };
    state.pinned = false;
  }
  showView("today");
  renderToday();
  $("vesvese-home")?.scrollIntoView({ block: "center", behavior: "smooth" });
}

function dismissHomeVesvese() {
  const card = $("vesvese-home");
  homeVesvesePreview = false;
  const target = homeVesveseTarget();
  if (target) {
    try {
      localStorage.setItem(VESVESE_HOME_KEY, target.id);
    } catch {
      /* depolama kapalı */
    }
  }
  if (!card || card.hidden || card.classList.contains("is-leaving")) return;
  card.classList.add("is-leaving");
  const finish = () => {
    card.hidden = true;
    card.classList.remove("is-leaving");
  };
  card.addEventListener("transitionend", finish, { once: true });
  window.setTimeout(finish, 500);
}

function vesveseNote() {
  if (!state.vesvese) return "Kapalı. Açınca, vakit girdikten 10 dakika sonra Bugün ekranında durur.";
  return "Açık. Vakit girdikten 10 dakika sonra Bugün ekranında durur. Besmeleyle kapanır.";
}

function renderVesveseSample(next = false) {
  if (next || !vesveseSample) vesveseSample = pickVesvese();
  const visible = state.vesvese;
  $("vesvese-card").hidden = !visible;
  $("vesvese-actions").hidden = !visible;
  $("vesvese-try").hidden = !PREPROD;
  $("vesvese-note").textContent = vesveseNote();
  if (!visible) return;
  const face = $("vesvese-face");
  face.src = vesveseFaceUrl(vesveseSample.face);
  face.alt = "Kurnaz gülen şeytan";
  $("vesvese-title").textContent = vesveseSample.title;
  $("vesvese-line").textContent = vesveseSample.body;
}

function onVesveseChange() {
  state.vesvese = $("vesvese-select").value === "on";
  save();
  renderVesveseSample();
  renderHomeVesvese();
}

function notificationsWanted() {
  return state.remind !== "off";
}

function momentGrace() {
  return Number(state.remind) === 0 ? 5 * 60 * 1000 : 2 * 60 * 1000;
}

function checkReminders() {
  if (!notificationsWanted() || !state.place || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const now = Date.now();
  for (const moment of remindMoments()) {
    if (notified.has(moment.id)) continue;
    if (now < moment.when || now >= moment.when + momentGrace()) continue;
    notified.add(moment.id);
    persistNotified();
    void showReminder(moment);
  }
}

function remindMoments() {
  if (!state.place || !notificationsWanted()) return [];
  const today = cityToday(state.place.tz);
  const moments = [];
  const lead = Number(state.remind) * 60 * 1000;
  for (const day of [today, addDays(today, 1)]) {
    const pack = compute(state.place, day);
    if (!pack) continue;
    for (const key of PRAYER_KEYS) {
      const at = pack.times[key];
      if (!isValidDate(at)) continue;
      moments.push({
        key,
        when: at.getTime() - lead,
        id: `${day.y}-${day.m}-${day.d}-${key}-${state.remind}`,
        clock: formatClock(at, state.place.tz),
      });
    }
  }
  moments.sort((a, b) => a.when - b.when);
  return moments;
}

function armReminder() {
  window.clearTimeout(remindTimer);
  if (!notificationsWanted() || !state.place || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const now = Date.now();
  const upcoming = remindMoments().find((moment) => !notified.has(moment.id) && now < moment.when + momentGrace());
  if (!upcoming) return;
  const delay = Math.max(0, upcoming.when - now);
  remindTimer = window.setTimeout(() => {
    checkReminders();
    armReminder();
  }, Math.min(delay, 30 * 60 * 1000));
}

async function showReminder(moment) {
  const entered = Number(state.remind) === 0;
  const title = entered ? `${NAMES[moment.key]} vakti girdi` : `${NAMES[moment.key]} vaktine ${state.remind} dakika`;
  const body = `${state.place.name} · ${moment.clock}`;
  const icon = new URL("../icons/icon-192.png", import.meta.url).href;
  const options = { body, lang: "tr", icon, tag: moment.id, renotify: true };
  try {
    const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (registration?.showNotification) {
      await registration.showNotification(title, options);
      return;
    }
  } catch {
    /* sayfa bildirimine düş */
  }
  try {
    new Notification(title, options);
  } catch {
    /* bildirim oluşturulamadı */
  }
}

function readNotified() {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || sessionStorage.getItem(NOTIFIED_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function persistNotified() {
  const keep = [...notified].slice(-40);
  notified = new Set(keep);
  try {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(keep));
  } catch {
    /* depolama kapalı */
  }
}

function watchCompass() {
  if (compassListening) return;
  if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
    return;
  }
  enableCompass();
}

async function enableCompass() {
  if (compassListening) return;
  try {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result !== "granted") {
        $("compass-note").textContent = "Pusula izni verilmedi. Ok, kuzeye göre kıble açısını gösterir.";
        return;
      }
    }
  } catch {
    $("compass-note").textContent = "Pusula açılamadı.";
    return;
  }
  if (!compassListening) {
    window.addEventListener("deviceorientationabsolute", onOrient, true);
    window.addEventListener("deviceorientation", onOrient, true);
    compassListening = true;
  }
  gotHeading = false;
  window.setTimeout(() => {
    if (!gotHeading) {
      $("compass-note").textContent = "Pusula algılanamadı. Kadran kuzeye göre sabit; ok kıble açısını gösterir.";
    }
  }, 1600);
}

function onOrient(event) {
  let next = null;
  if (typeof event.webkitCompassHeading === "number" && event.webkitCompassHeading >= 0) {
    next = event.webkitCompassHeading;
  } else if (event.absolute && typeof event.alpha === "number") {
    next = (360 - event.alpha) % 360;
  }
  if (next == null || Number.isNaN(next)) return;
  gotHeading = true;
  heading = smoothAngle(heading, next);
  $("compass").style.setProperty("--heading", `${heading.toFixed(2)}deg`);
  $("compass-note").textContent = "Telefonu düz tutun. Ok yukarı bakınca kıbleye dönüksünüz.";
}

function smoothAngle(previous, next) {
  if (previous == null) return next;
  const delta = ((next - previous + 540) % 360) - 180;
  return (previous + delta * 0.18 + 360) % 360;
}

function updateOnline() {
  $("offline-flag").hidden = navigator.onLine;
}

function toast(message) {
  const node = $("toast");
  node.textContent = message;
  node.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    node.hidden = true;
  }, 2200);
}

function cityToday(timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
}

function addDays(parts, amount) {
  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + amount, 12));
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

function sameDay(a, b) {
  return Boolean(a && b && a.y === b.y && a.m === b.m && a.d === b.d);
}

function formatClock(date, timeZone) {
  if (!isValidDate(date)) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatLong(parts) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(utcNoon(parts));
}

function weekday(parts) {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", weekday: "long" }).format(utcNoon(parts));
}

function dayMonth(parts) {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", day: "numeric", month: "long" }).format(utcNoon(parts));
}

function hijriLabel(parts) {
  const bits = hijri(parts);
  if (!bits) return "";
  return `${bits.day} ${bits.month} ${bits.year}`;
}

function hijri(parts) {
  try {
    const formatted = new Intl.DateTimeFormat("tr-TR-u-ca-islamic-umalqura", {
      timeZone: "UTC",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).formatToParts(utcNoon(parts));
    const map = Object.fromEntries(formatted.map((part) => [part.type, part.value]));
    if (!map.day || !map.month || !map.year) return null;
    return map;
  } catch {
    return null;
  }
}

function utcNoon(parts) {
  return new Date(Date.UTC(parts.y, parts.m - 1, parts.d, 12));
}

function formatRemain(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours} sa ${String(minutes).padStart(2, "0")} dk kaldı`;
  if (minutes > 0) return `${minutes} dk ${String(seconds).padStart(2, "0")} sn kaldı`;
  return `${seconds} sn kaldı`;
}

function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

function haversine(lat1, lon1, lat2, lon2) {
  const radius = 6371;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(a)));
}

function appBase() {
  const url = new URL(window.location.href);
  if (url.pathname.endsWith("/index.html")) url.pathname = url.pathname.slice(0, -"index.html".length);
  else if (!url.pathname.endsWith("/")) url.pathname += "/";
  url.search = "";
  url.hash = "";
  return url;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    window.location.reload();
  });
  const register = () => {
    navigator.serviceWorker.register(new URL("sw.js", appBase()), { updateViaCache: "none" }).catch(() => {});
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register);
}
