import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");

let buildHash = "";
try {
  buildHash = execSync("git rev-parse --short HEAD").toString().trim();
} catch {
  buildHash = Date.now().toString();
}

const packageJsonPath = path.join(root, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

const versionInfo = {
  version: packageJson.version ?? "1.0.0",
  buildHash,
  buildDate: new Date().toISOString(),
};

const publicDir = path.join(root, "public");
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

const versionPath = path.join(publicDir, "version.json");
fs.writeFileSync(versionPath, JSON.stringify(versionInfo, null, 2));
console.log("version.json создан:", versionInfo);

