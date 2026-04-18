/**
 * Сборка → Firebase Hosting → коммит в Git с датой/временем и описанием diff → тег → push.
 * История: git log --grep=^deploy: или git tag -n9 deploy-
 * Откат: git checkout <тег> — в сообщении тега и коммита указаны дата и изменения.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

function runOutMulti(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", cwd: root, shell: true });
  } catch {
    return "";
  }
}

function formatLocalDateTime(d) {
  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
  const tz = Intl.DateTimeFormat("ru-RU", { timeZoneName: "short" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value;
  return { date, time, line: `${date}, ${time}${tz ? ` (${tz})` : ""}` };
}

function buildDeployMessage({ now, iso, hasStagedChanges }) {
  const { line: localLine } = formatLocalDateTime(now);
  const title = `deploy: ${localLine.replace(/\s+/g, " ").trim()}`;

  const nameStatus = runOutMulti("git diff --cached --name-status").trim();
  const stat = runOutMulti("git diff --cached --stat").trim();
  const shortstat = runOutMulti("git diff --cached --shortstat").trim();

  const lines = [
    title,
    "",
    "─── Сохранение деплоя в GitHub ───",
    "",
    `Дата и время сохранения (локально): ${localLine}`,
    `Дата и время (UTC, ISO): ${iso}`,
    "",
    "Действие: сборка (npm run build), публикация на Firebase Hosting и выкат Firestore (правила и индексы).",
    "",
  ];

  if (hasStagedChanges && nameStatus) {
    lines.push("Изменённые файлы (статус):");
    lines.push(nameStatus);
    lines.push("");
  }

  if (hasStagedChanges && stat) {
    lines.push("Детализация (git diff --cached --stat):");
    lines.push(stat);
    lines.push("");
  }

  if (hasStagedChanges && shortstat) {
    lines.push(`Итого: ${shortstat}`);
    lines.push("");
  }

  if (!hasStagedChanges) {
    lines.push(
      "Изменений в отслеживаемых файлах нет — это повторный деплой той же версии исходников",
      "(пустой коммит только для отметки момента публикации на хостинге и Firestore).",
      ""
    );
  }

  lines.push(`Тег для отката создаётся автоматически после этого коммита.`);

  return { title, full: lines.join("\n") };
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

console.log("\n▶ Firebase: Hosting + Firestore (rules, indexes)\n");
run(
  `npx --yes firebase-tools@latest deploy --only hosting,firestore:rules,firestore:indexes --project ${projectId}`
);

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

console.log("\n▶ Git: сохранение в GitHub с датой, временем и описанием изменений\n");

run("git add -A");

let hasStaged = false;
try {
  const staged = runOut("git diff --cached --name-only");
  hasStaged = staged.length > 0;
} catch {
  /* ignore */
}

const { full: commitBody } = buildDeployMessage({
  now,
  iso,
  hasStagedChanges: hasStaged,
});

const msgPath = path.join(os.tmpdir(), `startavto-deploy-msg-${Date.now()}.txt`);
fs.writeFileSync(msgPath, commitBody, "utf8");

try {
  if (hasStaged) {
    run(`git commit -F "${msgPath.replace(/\\/g, "/")}"`);
  } else {
    run(`git commit --allow-empty -F "${msgPath.replace(/\\/g, "/")}"`);
  }

  run(`git tag -a "${tag}" -F "${msgPath.replace(/\\/g, "/")}"`);
} finally {
  try {
    fs.unlinkSync(msgPath);
  } catch {
    /* ignore */
  }
}

const branch = runOut("git rev-parse --abbrev-ref HEAD");
if (branch === "HEAD") {
  console.error("В detached HEAD — выполните push вручную.");
  process.exit(1);
}

console.log(`\n▶ git push origin ${branch} && git push origin ${tag}\n`);
run(`git push origin ${branch}`);
run(`git push origin "${tag}"`);

console.log(`\n✓ Готово. Тег: ${tag}`);
console.log("  Просмотр, что сохранено: git show " + tag);
console.log("  История деплоев: git log --oneline --grep=\"^deploy:\" -20\n");
