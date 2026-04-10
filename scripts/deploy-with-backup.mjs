/**
 * Сборка → Firebase Hosting → коммит в Git (при отсутствии изменений — пустой коммит) → тег → push.
 * Откат: git checkout deploy-<метка> или список тегов: git tag -l "deploy-*"
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: "inherit", cwd: root, shell: true, ...opts });
}

function runOut(cmd) {
  return execSync(cmd, { encoding: "utf8", cwd: root, shell: true }).trim();
}

process.chdir(root);

console.log("\n▶ npm run build\n");
run("npm run build");

const firebasercPath = path.join(root, ".firebaserc");
if (!fs.existsSync(firebasercPath)) {
  console.error("Нет .firebaserc — укажите проект Firebase.");
  process.exit(1);
}
const firebaserc = JSON.parse(fs.readFileSync(firebasercPath, "utf8"));
const projectId = firebaserc.projects?.default;
if (!projectId) {
  console.error("В .firebaserc не задан projects.default");
  process.exit(1);
}

console.log("\n▶ Firebase Hosting deploy\n");
run(`npx --yes firebase-tools@latest deploy --only hosting --project ${projectId}`);

const now = new Date();
const iso = now.toISOString();
const y = now.getFullYear();
const mo = String(now.getMonth() + 1).padStart(2, "0");
const d = String(now.getDate()).padStart(2, "0");
const h = String(now.getHours()).padStart(2, "0");
const mi = String(now.getMinutes()).padStart(2, "0");
const s = String(now.getSeconds()).padStart(2, "0");
const ms = String(now.getMilliseconds()).padStart(3, "0");
const tag = `deploy-${y}${mo}${d}-${h}${mi}${s}-${ms}`;

let inGit = true;
try {
  runOut("git rev-parse --git-dir");
} catch {
  inGit = false;
}

if (!inGit) {
  console.log("\n⚠ Git-репозиторий не найден — деплой выполнен, тег и push пропущены.\n");
  process.exit(0);
}

console.log("\n▶ Git: сохранение точки отката\n");

run("git add -A");

let hasStaged = false;
try {
  const staged = runOut("git diff --cached --name-only");
  hasStaged = staged.length > 0;
} catch {
  /* ignore */
}

if (hasStaged) {
  run(`git commit -m "chore(deploy): ${iso}"`);
} else {
  run(`git commit --allow-empty -m "chore(deploy): ${iso} (только деплой, файлы не менялись)"`);
}

run(`git tag -a "${tag}" -m "Firebase deploy ${iso}"`);

const branch = runOut("git rev-parse --abbrev-ref HEAD");
if (branch === "HEAD") {
  console.error("В detached HEAD — выполните push вручную.");
  process.exit(1);
}

console.log(`\n▶ git push origin ${branch} && git push origin ${tag}\n`);
run(`git push origin ${branch}`);
run(`git push origin "${tag}"`);

console.log(`\n✓ Готово. Тег отката: ${tag}`);
console.log(`  Пример: git checkout ${tag}\n`);
