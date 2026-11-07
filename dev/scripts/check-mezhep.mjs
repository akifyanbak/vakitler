import fs from "node:fs";
import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from "../vendor/adhan.esm.js";
import {
  MADHAB_OPTIONS,
  isJafariMadhab,
  methodNote,
  normalizeStoredMadhab,
  prayerParameters,
} from "../js/mezhep.js";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const failures = [];

function check(id, ok) {
  if (ok) console.log(`ok  ${id}`);
  else {
    failures.push(id);
    console.error(`FAIL ${id}`);
  }
}

const select = html.slice(html.indexOf('id="madhab-select"'), html.indexOf('id="madhab-hint"'));
for (const [value, label] of MADHAB_OPTIONS) {
  check(`option ${value}`, select.includes(`value="${value}"`) && select.includes(label));
}
check("H1 same box", select.includes("Hanefî, ikindi geç") && select.includes("Şâfiî, ikindi erken") && select.includes("Caferî, akşam geç"));
check("H2 default hanefi", app.includes('madhab: "Hanafi"'));
check("C2 no jafari method row", !/\[\s*"Jafari"/.test(app));
check("H6 today uses compute", /function renderToday\(\)[\s\S]*?compute\(state\.place/.test(app));
check("H6 month uses compute", /function renderMonth\(\)[\s\S]*?compute\(state\.place/.test(app));
check("H6 reminder uses compute", /function remindMoments\(\)[\s\S]*?compute\(state\.place/.test(app));
check("C5 method waits", app.includes('$("method-select").disabled = jafari'));
check("C8 footnote helper", app.includes("methodNote(state.madhab, methodLabel(state.method))"));
check("cached module", sw.includes("./js/mezhep.js"));

check("H8 empty storage", normalizeStoredMadhab(null) === "Hanafi");
check("H8 invalid storage", normalizeStoredMadhab({ madhab: "nope" }) === "Hanafi");
check("S6 stored shafi", normalizeStoredMadhab({ madhab: "Shafi" }) === "Shafi");
check("C7 legacy method", normalizeStoredMadhab({ method: "Jafari", madhab: "Hanafi" }) === "Jafari");
check("C7 stored jafari", normalizeStoredMadhab({ madhab: "Jafari", method: "Turkey" }) === "Jafari");

const fatih = new Coordinates(41.0204, 28.9491);
const day = new Date(2026, 10, 7, 12, 0, 0);

function times(madhab, method, maghribAdjust = 0) {
  const params = prayerParameters(madhab, method);
  params.adjustments.maghrib = maghribAdjust;
  return new PrayerTimes(fatih, day, params);
}

const hanefi = times("Hanafi", "Turkey");
const shafi = times("Shafi", "Turkey");
const caferi = times("Jafari", "Turkey");
const tehran = times("Shafi", "Tehran");
const shifted = times("Jafari", "Turkey", 3);
const shared = ["fajr", "sunrise", "dhuhr", "maghrib", "isha"];

check("H3 asr later than shafi", hanefi.asr > shafi.asr);
check("S2 asr earlier than hanefi", shafi.asr < hanefi.asr);
check("H4 S3 shared prayers", shared.every((name) => hanefi[name].getTime() === shafi[name].getTime()));
check("H3 shadow two", prayerParameters("Hanafi", "Turkey").madhab === Madhab.Hanafi);
check("S2 shadow one", prayerParameters("Shafi", "Turkey").madhab === Madhab.Shafi);
check("C3 shadow one", prayerParameters("Jafari", "Turkey").madhab === Madhab.Shafi);

const jafariParams = prayerParameters("Jafari", "Turkey");
check("C3 fajr 16", jafariParams.fajrAngle === 16);
check("C3 isha 14", jafariParams.ishaAngle === 14);
check("C3 maghrib 4", jafariParams.maghribAngle === 4);
check("C3 ignores method angles", prayerParameters("Jafari", "NorthAmerica").fajrAngle === 16);
check("C4 maghrib after sunset", caferi.maghrib > caferi.sunset);
check("C3 asr earlier than hanefi", caferi.asr < hanefi.asr);
check("C3 times differ from diyanet", ["fajr", "maghrib", "isha"].every((name) => caferi[name].getTime() !== hanefi[name].getTime()));
check("C2 not tehran", caferi.maghrib.getTime() !== tehran.maghrib.getTime());
check("C2 tehran angles stay", CalculationMethod.Tehran().fajrAngle === 17.7 && CalculationMethod.Tehran().maghribAngle === 4.5);
check("C10 adjustment", shifted.maghrib.getTime() - caferi.maghrib.getTime() === 3 * 60 * 1000);
check("C1 is jafari", isJafariMadhab("Jafari") && !isJafariMadhab("Hanafi") && !isJafariMadhab("Shafi"));
check("H7 note", methodNote("Hanafi", "Diyanet (Türkiye)") === "Diyanet (Türkiye) · Hanefî. İlçe merkezi veya seçtiğiniz koordinata göredir.");
check("S5 note", methodNote("Shafi", "Diyanet (Türkiye)") === "Diyanet (Türkiye) · Şâfiî. İlçe merkezi veya seçtiğiniz koordinata göredir.");
check("C8 note", methodNote("Jafari", "Diyanet (Türkiye)") === "Caferî · akşam geç, ikindi erken. İlçe merkezi veya seçtiğiniz koordinata göredir.");
check("C8 note hides diyanet", !methodNote("Jafari", "Diyanet (Türkiye)").includes("Diyanet"));

if (failures.length) {
  console.error(`\n${failures.length} ölçüt tutmadı: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nMezhep ölçütleri tuttu.");
