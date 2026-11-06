import {
  CalculationMethod,
  Coordinates,
  HighLatitudeRule,
  Madhab,
  PolarCircleResolution,
  PrayerTimes,
  Qibla,
  SunnahTimes,
} from "../vendor/adhan.esm.js";
import { FEATURED_IDS, PLACES } from "./places.js";

const STORAGE_KEY = "vakitler.v1";
const KAABA = { lat: 21.422487, lon: 39.826206 };
const ORDER = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
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
const PALETTES = {
  fajr: { scheme: "dark", bg0: "#1c2230", bg1: "#4a3a3a", bg2: "#8a6248", accent: "#f0c7a0", accentInk: "#2a2118", accentSoft: "rgba(240,199,160,.16)", ink: "#f8f2ea", muted: "#d2c4b8", faint: "rgba(248,242,234,.46)", line: "rgba(248,242,234,.14)", chip: "rgba(255,255,255,.06)", nav: "rgba(22,20,24,.82)" },
  sunrise: { scheme: "dark", bg0: "#2a211c", bg1: "#7a4632", bg2: "#e0a06a", accent: "#ffd7a8", accentInk: "#2a2118", accentSoft: "rgba(255,215,168,.16)", ink: "#fff6ea", muted: "#f0d7c4", faint: "rgba(255,246,234,.5)", line: "rgba(255,246,234,.16)", chip: "rgba(255,255,255,.06)", nav: "rgba(32,22,18,.82)" },
  dhuhr: { scheme: "light", bg0: "#e7e2d6", bg1: "#c5d0c6", bg2: "#f3ecdf", accent: "#0e5b50", accentInk: "#f4efe4", accentSoft: "rgba(14,91,80,.12)", ink: "#1b1914", muted: "#5c574e", faint: "rgba(27,25,20,.45)", line: "rgba(27,25,20,.12)", chip: "rgba(255,255,255,.46)", nav: "rgba(231,226,214,.9)" },
  asr: { scheme: "light", bg0: "#f0e2c8", bg1: "#e7c49a", bg2: "#f6edd9", accent: "#8a3e1d", accentInk: "#fff6ea", accentSoft: "rgba(138,62,29,.12)", ink: "#2a1c12", muted: "#6f5644", faint: "rgba(42,28,18,.48)", line: "rgba(42,28,18,.12)", chip: "rgba(255,252,245,.5)", nav: "rgba(240,226,200,.9)" },
  maghrib: { scheme: "dark", bg0: "#241820", bg1: "#7a3040", bg2: "#c4623a", accent: "#ffc7a3", accentInk: "#2a1612", accentSoft: "rgba(255,199,163,.16)", ink: "#fff3ea", muted: "#e4c8bc", faint: "rgba(255,243,234,.5)", line: "rgba(255,243,234,.14)", chip: "rgba(255,255,255,.06)", nav: "rgba(28,16,22,.82)" },
  isha: { scheme: "dark", bg0: "#0e1420", bg1: "#1a2740", bg2: "#243656", accent: "#e4c27a", accentInk: "#2a2118", accentSoft: "rgba(228,194,122,.16)", ink: "#f4efe4", muted: "#b7c0d0", faint: "rgba(244,239,228,.72)", line: "rgba(244,239,228,.12)", chip: "rgba(255,255,255,.06)", nav: "rgba(10,14,22,.84)" },
  plain: { scheme: "light", bg0: "#f6f3ec", bg1: "#f6f3ec", bg2: "#f6f3ec", accent: "#0c3d34", accentInk: "#ffffff", accentSoft: "rgba(12,61,52,.14)", ink: "#141414", muted: "#2c2c2c", faint: "#3f3f3f", line: "rgba(20,20,20,.18)", chip: "#ffffff", nav: "#fffdf8" },
};

const byId = new Map(PLACES.map((place) => [place.id, place]));
const calcCache = new Map();
const $ = (id) => document.getElementById(id);

const state = loadState();
let heading = null;
let compassListening = false;
let gotHeading = false;
let toastTimer = 0;
let notified = new Set(readNotified());

init();

function init() {
  fillMethods();
  syncForm();
  bind();
  if ("share" in navigator) $("share-button").hidden = false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (ios && !standalone) $("ios-note").hidden = false;
  if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
    $("compass-permit").hidden = false;
  }
  ensureSelection();
  render();
  updateOnline();
  registerServiceWorker();
  setInterval(updateLive, 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) updateLive();
  });
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
    theme: "auto",
    remind: "off",
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
    const madhab = raw.madhab === "Shafi" || raw.madhab === "Hanafi" ? raw.madhab : base.madhab;
    const highLatitude = Object.values(HighLatitudeRule).includes(raw.highLatitude) ? raw.highLatitude : base.highLatitude;
    const theme = ["auto", "night", "day"].includes(raw.theme) ? raw.theme : base.theme;
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
  $("theme-select").value = state.theme;
  $("remind-select").value = state.remind;
  $("method-hint").textContent = methodHint(state.method);
  for (const input of document.querySelectorAll("[data-adj]")) {
    input.value = String(state.adjustments[input.dataset.adj] ?? 0);
  }
  $("remind-note").textContent = state.remind === "off"
    ? "Hatırlatma, bu sekme açıkken çalışır."
    : "İzin verildiyse hatırlatma bu sekme açıkken gelir.";
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
  $("place-search").addEventListener("input", renderPlaceResults);
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
  $("method-select").addEventListener("change", () => {
    state.method = $("method-select").value;
    $("method-hint").textContent = methodHint(state.method);
    save();
    render();
  });
  $("madhab-select").addEventListener("change", () => {
    state.madhab = $("madhab-select").value;
    save();
    render();
  });
  $("latitude-select").addEventListener("change", () => {
    state.highLatitude = $("latitude-select").value;
    save();
    render();
  });
  $("theme-select").addEventListener("change", () => {
    state.theme = $("theme-select").value;
    save();
    render();
  });
  $("remind-select").addEventListener("change", onRemindChange);
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
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    window.__vakitlerInstall = event;
    $("install-button").hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    $("install-button").hidden = true;
  });
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);
  document.addEventListener("keydown", (event) => {
    if (event.target.closest("input, select, textarea")) return;
    if (state.view !== "today" || !state.place) return;
    if (event.key === "ArrowLeft") shiftDay(-1);
    if (event.key === "ArrowRight") shiftDay(1);
  });
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

async function installApp() {
  const prompt = window.__vakitlerInstall;
  if (!prompt) return;
  prompt.prompt();
  await prompt.userChoice;
  window.__vakitlerInstall = null;
  $("install-button").hidden = true;
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

function renderPlaceResults() {
  const query = $("place-search").value.trim();
  const root = $("place-results");
  root.replaceChildren();
  if (!query) {
    if (state.recents.length) addPlaceGroup(root, "Son kullanılan", state.recents);
    addPlaceGroup(root, "Sık kullanılan", FEATURED_IDS.map((id) => byId.get(id)).filter(Boolean));
    return;
  }
  const found = searchPlaces(query);
  if (!found.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Sonuç yok. İlçe adı veya koordinat deneyin.";
    root.append(empty);
    return;
  }
  addPlaceGroup(root, "Sonuçlar", found);
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

function useGeo() {
  const status = $("geo-status");
  if (!navigator.geolocation) {
    status.textContent = "Bu tarayıcı konum vermiyor.";
    return;
  }
  status.textContent = "Konum alınıyor…";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      const near = nearestPlace(lat, lon);
      let name = "Bulunduğum yer";
      let region = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
      if (near && near.km < 8) {
        name = near.place.name;
        region = near.place.region;
      } else if (near && near.km < 35) {
        name = `${near.place.name} çevresi`;
        region = near.place.region;
      }
      choosePlace({
        id: `gps-${lat.toFixed(3)}-${lon.toFixed(3)}`,
        name,
        region,
        lat,
        lon,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Istanbul",
      });
      status.textContent = "";
    },
    (error) => {
      status.textContent = error.code === 1
        ? "Konum izni verilmedi. Şehir arayabilirsiniz."
        : "Konum alınamadı. Şehir arayabilirsiniz.";
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
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
  choosePlace({
    id: `coord-${lat.toFixed(3)}-${lon.toFixed(3)}`,
    name: "Koordinat",
    region: `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
    lat,
    lon,
    tz,
  });
}

function choosePlace(place) {
  state.place = place;
  state.pinned = false;
  state.recents = [place, ...state.recents.filter((item) => item.id !== place.id)].slice(0, 6);
  ensureSelection();
  save();
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
  applyPalette(activePalette());
  $("place-name").textContent = state.place ? state.place.name : "Şehir seç";
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
  const madhab = state.madhab === "Hanafi" ? "Hanefî" : "Şâfiî";
  $("method-note").textContent = `${methodLabel(state.method)} · ${madhab}. İlçe merkezi veya seçtiğiniz koordinata göredir.`;
  renderHero();
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
  const palette = paletteName();
  if (palette !== state.appliedPalette) {
    applyPalette(activePalette());
    renderToday();
    renderMonth();
  } else {
    renderHero();
  }
  checkReminders();
}

function paletteName() {
  if (state.theme === "night") return "night";
  return "plain";
}

function activePalette() {
  if (state.theme === "night") return PALETTES.isha;
  return PALETTES.plain;
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

function applyPalette(palette) {
  state.appliedPalette = paletteName();
  const root = document.documentElement;
  root.style.colorScheme = palette.scheme;
  const map = {
    "--bg0": palette.bg0,
    "--bg1": palette.bg1,
    "--bg2": palette.bg2,
    "--accent": palette.accent,
    "--accent-ink": palette.accentInk,
    "--accent-soft": palette.accentSoft,
    "--ink": palette.ink,
    "--muted": palette.muted,
    "--faint": palette.faint,
    "--line": palette.line,
    "--chip": palette.chip,
    "--nav": palette.nav,
  };
  for (const [key, value] of Object.entries(map)) root.style.setProperty(key, value);
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.setAttribute("content", palette.bg0);
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
    const params = CalculationMethod[state.method]();
    params.madhab = state.madhab === "Hanafi" ? Madhab.Hanafi : Madhab.Shafi;
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

async function onRemindChange() {
  const value = $("remind-select").value;
  if (value !== "off") {
    const allowed = await ensureNotify();
    if (!allowed) {
      $("remind-select").value = "off";
      state.remind = "off";
      $("remind-note").textContent = "Bildirim izni yok. Hatırlatma ancak izin verilirse çalışır.";
      save();
      return;
    }
    $("remind-note").textContent = "İzin verildi. Hatırlatma bu sekme açıkken gelir.";
  } else {
    $("remind-note").textContent = "Hatırlatma kapalı.";
  }
  state.remind = value;
  save();
}

async function ensureNotify() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

function checkReminders() {
  if (state.remind === "off" || !state.place || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const today = cityToday(state.place.tz);
  const pack = compute(state.place, today);
  if (!pack) return;
  const lead = Number(state.remind) * 60 * 1000;
  const now = Date.now();
  for (const key of ["fajr", "dhuhr", "asr", "maghrib", "isha"]) {
    const when = pack.times[key].getTime() - lead;
    const id = `${today.y}-${today.m}-${today.d}-${key}-${state.remind}`;
    if (now >= when && now < when + 90000 && !notified.has(id)) {
      notified.add(id);
      sessionStorage.setItem("vakitler.notified", JSON.stringify([...notified]));
      const mins = Number(state.remind);
      const title = mins === 0 ? `${NAMES[key]} vakti` : `${NAMES[key]} için ${mins} dk`;
      const body = `${state.place.name} · ${formatClock(pack.times[key], state.place.tz)}`;
      try {
        new Notification(title, {
          body,
          lang: "tr",
          icon: new URL("../icons/icon-192.png", import.meta.url).href,
        });
      } catch {
        /* bildirim oluşturulamadı */
      }
    }
  }
}

function readNotified() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem("vakitler.notified") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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
    navigator.serviceWorker.register(new URL("sw.js", appBase())).catch(() => {});
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register);
}
