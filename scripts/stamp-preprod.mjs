import fs from "node:fs";

const dir = process.argv[2];
if (!dir) {
  console.error("Kullanım: node scripts/stamp-preprod.mjs <klasör>");
  process.exit(1);
}

const manifestPath = `${dir}/manifest.json`;
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.name = "Vakitler deneme";
manifest.short_name = "Deneme";
manifest.description = "Vakitler deneme sürümü. Yayındaki site değildir.";
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const htmlPath = `${dir}/index.html`;
let html = fs.readFileSync(htmlPath, "utf8");
html = html.replace("<title>Vakitler</title>", "<title>Vakitler deneme</title>");
html = html.replace(
  '<meta name="apple-mobile-web-app-title" content="Vakitler" />',
  '<meta name="apple-mobile-web-app-title" content="Vakitler deneme" />',
);
fs.writeFileSync(htmlPath, html);
console.log(`Deneme damgası yazıldı: ${dir}`);
