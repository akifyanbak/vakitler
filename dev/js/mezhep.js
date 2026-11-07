import { CalculationMethod, CalculationParameters, Madhab } from "../vendor/adhan.esm.js";

export const MADHAB_OPTIONS = [
  ["Hanafi", "Hanefî, ikindi geç"],
  ["Shafi", "Şâfiî, ikindi erken"],
  ["Jafari", "Caferî, akşam geç"],
];

export function isJafariMadhab(madhab) {
  return madhab === "Jafari";
}

export function normalizeStoredMadhab(raw) {
  let madhab = raw?.madhab === "Shafi" || raw?.madhab === "Hanafi" || raw?.madhab === "Jafari"
    ? raw.madhab
    : "Hanafi";
  if (raw?.method === "Jafari") madhab = "Jafari";
  return madhab;
}

export function prayerParameters(madhab, method) {
  const params = isJafariMadhab(madhab)
    ? new CalculationParameters("Jafari", 16, 14, 0, 4)
    : CalculationMethod[method]();
  params.madhab = madhab === "Hanafi" ? Madhab.Hanafi : Madhab.Shafi;
  return params;
}

export function methodNote(madhab, calculationLabel) {
  if (isJafariMadhab(madhab)) {
    return "Caferî · akşam geç, ikindi erken. İlçe merkezi veya seçtiğiniz koordinata göredir.";
  }
  const name = madhab === "Hanafi" ? "Hanefî" : "Şâfiî";
  return `${calculationLabel} · ${name}. İlçe merkezi veya seçtiğiniz koordinata göredir.`;
}
