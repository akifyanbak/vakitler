import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(process.argv[2] || path.join(here, ".."));
const parent = path.resolve(process.argv[3] || source);
const dest = path.join(parent, "dev");

function excluded(file) {
  const rel = path.relative(source, file);
  if (!rel || rel.startsWith("..")) return false;
  const top = rel.split(path.sep)[0];
  return top === ".git" || top === ".github" || top === "dev";
}

const stage = fs.mkdtempSync(path.join(os.tmpdir(), "vakitler-dev-"));
fs.cpSync(source, stage, {
  recursive: true,
  filter: (file) => !excluded(file),
});
process.argv[2] = stage;
await import(pathToFileURL(path.join(here, "stamp-preprod.mjs")).href);
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(stage, dest, { recursive: true });
fs.rmSync(stage, { recursive: true, force: true });
