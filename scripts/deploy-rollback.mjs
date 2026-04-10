/**
 * Интерактивный откат к сохранённой точке деплоя (тег deploy-*).
 * Запуск: npm run откат
 */
import { execSync } from "node:child_process";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

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

function run(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: root, shell: true });
}

function isDirty() {
  try {
    const s = runOut("git status --porcelain");
    return s.length > 0;
  } catch {
    return true;
  }
}

function getDeployTags() {
  const raw = runOutMulti('git tag -l "deploy-*"');
  const list = raw
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean);
  return list.sort().reverse();
}

function tagMeta(tag) {
  try {
    const line = runOut(`git log -1 --format="%ci - %s" "${tag}"`);
    return line || tag;
  } catch {
    return tag;
  }
}

async function main() {
  process.chdir(root);

  try {
    runOut("git rev-parse --git-dir");
  } catch {
    console.error("Это не Git-репозиторий.");
    process.exit(1);
  }

  const tags = getDeployTags();
  if (tags.length === 0) {
    console.log(
      "Нет тегов deploy-*.\nСначала выполните деплой с сохранением: npm run \"спаси и сохрани\"\n(или npm run deploy)."
    );
    process.exit(0);
  }

  const branch = runOut("git rev-parse --abbrev-ref HEAD");
  console.log("\n─── Точки отката (деплои, от новых к старым) ───\n");
  tags.forEach((t, i) => {
    console.log(`  ${i + 1}) ${t}`);
    console.log(`     ${tagMeta(t)}\n`);
  });
  console.log("  0) Отмена\n");

  const rl = readline.createInterface({ input, output });

  let selected = "";
  while (true) {
    const choice = (await rl.question("Введите номер точки отката: ")).trim();
    if (choice === "0") {
      console.log("Отмена.");
      rl.close();
      process.exit(0);
    }
    const n = Number.parseInt(choice, 10);
    if (Number.isFinite(n) && n >= 1 && n <= tags.length) {
      selected = tags[n - 1];
      break;
    }
    console.log(`Нужно число от 1 до ${tags.length} или 0 для отмены.`);
  }

  if (isDirty()) {
    console.log(
      "\n⚠ В рабочей папке есть несохранённые изменения. Они будут потеряны при откате.\n"
    );
    const ok = (await rl.question('Продолжить? Введите "да" или "нет": ')).trim().toLowerCase();
    if (ok !== "да" && ok !== "yes" && ok !== "y") {
      console.log("Отмена.");
      rl.close();
      process.exit(0);
    }
  }

  console.log(
    `\nБудет выполнено: git reset --hard "${selected}"\n` +
      `Текущая ветка: ${branch}\n` +
      "После отката код совпадёт с выбранной точкой деплоя.\n" +
      "Сайт на Firebase при этом не меняется — чтобы опубликовать откат, снова выполните npm run \"спаси и сохрани\".\n"
  );
  const confirm = (await rl.question('Подтвердить откат? Введите "да" или "нет": '))
    .trim()
    .toLowerCase();
  rl.close();

  if (confirm !== "да" && confirm !== "yes" && confirm !== "y") {
    console.log("Отмена.");
    process.exit(0);
  }

  console.log("\n▶ git reset --hard\n");
  run(`git reset --hard "${selected}"`);

  console.log(`\n✓ Откат выполнен к: ${selected}`);
  console.log("  Дальше (по желанию):");
  console.log(`    git push --force-with-lease origin ${branch}`);
  console.log("  — только если нужно перезаписать историю на GitHub (осторожно при совместной работе).\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
