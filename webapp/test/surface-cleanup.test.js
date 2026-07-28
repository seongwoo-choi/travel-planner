import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function readWebapp(relativePath) {
  return fs.readFile(new URL(relativePath, import.meta.url), "utf8");
}

async function textFilesUnder(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return textFilesUnder(filePath);
      return /\.(?:css|html|js|json|svg|webmanifest)$/i.test(entry.name) ? [filePath] : [];
    })
  );
  return files.flat();
}

async function productionWebappFiles() {
  return [
    ...(await textFilesUnder(path.join(repoRoot, "public"))),
    ...(await textFilesUnder(path.join(repoRoot, "src"))),
    path.join(repoRoot, "server.js"),
    path.join(repoRoot, "package.json"),
    path.join(repoRoot, ".env.example"),
  ];
}

test("no ios:, ops:, or quality: npm scripts remain", async () => {
  const pkg = JSON.parse(await readWebapp("../package.json"));
  const offenders = Object.keys(pkg.scripts).filter((name) => /^(ios|ops|quality):/.test(name));

  assert.deepEqual(offenders, []);
});

test("package description describes grounded Discord/web planning", async () => {
  const pkg = JSON.parse(await readWebapp("../package.json"));

  assert.doesNotMatch(pkg.description, /LLM|iOS|PWA/i);
  assert.match(pkg.description, /grounded/i);
});

test("remaining npm scripts do not reference removed script names", async () => {
  const pkg = JSON.parse(await readWebapp("../package.json"));
  const offenders = Object.entries(pkg.scripts)
    .filter(([, command]) => /npm run (ios|ops|quality):/.test(command))
    .map(([name]) => name);

  assert.deepEqual(offenders, []);
});

test("no source or public file is named ios-* or ops-*", async () => {
  const offenders = (await productionWebappFiles())
    .map((file) => path.relative(repoRoot, file))
    .filter((file) => /(^|\/)(ios|ops)-[^/]*$/.test(file));

  assert.deepEqual(offenders, []);
});

test("quality-todo modules are removed", async () => {
  const offenders = (await productionWebappFiles())
    .map((file) => path.relative(repoRoot, file))
    .filter((file) => /(^|\/)quality-todo(-core)?\.js$/.test(file));

  assert.deepEqual(offenders, []);
});

test("removed public assets are absent", async () => {
  const removed = [
    "pwa.js",
    "install.html",
    "service-worker.js",
    "health.json",
    "manifest.webmanifest",
    "ios-launch-proof.schema.json",
    "apple-touch-icon.png",
    "icon-192.png",
    "icon-512.png",
  ];
  const present = [];
  for (const name of removed) {
    try {
      await fs.access(new URL(`../public/${name}`, import.meta.url));
      present.push(name);
    } catch {
      // absent as required
    }
  }

  assert.deepEqual(present, []);
});

test("production webapp files contain no removed mobile shell or ops script surface", async () => {
  const removedSurface = /\b(?:iphone|ios|pwa)\b|service[- ]?worker|serviceWorker|manifest\.webmanifest|apple-touch-icon|offline[- ](?:shell|snapshot)|health-metadata-check|health:metadata|\/iphone(?:env)?\b|npm run (?:ops|quality):/i;
  const offenders = [];

  for (const filePath of await productionWebappFiles()) {
    const source = await fs.readFile(filePath, "utf8");
    if (removedSurface.test(source)) offenders.push(path.relative(repoRoot, filePath));
  }

  assert.deepEqual(offenders, []);
});

test("ordinary web UI files are kept", async () => {
  const kept = ["index.html", "plan.html", "app.js", "plan.js", "auth.js", "style.css", "icon.svg"];
  for (const name of kept) {
    await fs.access(new URL(`../public/${name}`, import.meta.url));
  }
});

test("server source exposes no iOS, install, or quality-evidence routes", async () => {
  const source = await readWebapp("../server.js");

  assert.doesNotMatch(source, /\/api\/ios-/);
  assert.doesNotMatch(source, /\/ios-install/);
  assert.doesNotMatch(source, /\/api\/plans\/quality-/);
  assert.doesNotMatch(source, /\/api\/operator-status/);
  assert.doesNotMatch(source, /\/api\/install-/);
  assert.doesNotMatch(source, /["'](\/install|\/i|\/iphone)["']/);
});

test("server source keeps health, status, plan CRUD and backup routes", async () => {
  const source = await readWebapp("../server.js");

  for (const route of [
    '"/api/health"',
    '"/api/health.txt"',
    '"/api/status"',
    '"/api/plans"',
    '"/api/plans/:id"',
    '"/api/plans/:id/refine"',
    '"/api/backup"',
  ]) {
    assert.ok(source.includes(route), `expected ${route} to remain in server.js`);
  }
});

test("server and discord bot import no removed modules", async () => {
  const [server, bot] = await Promise.all([readWebapp("../server.js"), readWebapp("../src/discord-bot.js")]);

  for (const source of [server, bot]) {
    assert.doesNotMatch(source, /from "\.\/(src\/)?ios-/);
    assert.doesNotMatch(source, /from "\.\/(src\/)?ops-/);
    assert.doesNotMatch(source, /from "\.\/(src\/)?quality-todo/);
  }
});

test("discord bot keeps grounded commands and drops ops evidence commands", async () => {
  const bot = await readWebapp("../src/discord-bot.js");

  for (const command of ["plan", "quick", "check", "replace", "move", "replan", "refresh"]) {
    assert.match(bot, new RegExp(`"${command}"`), `expected /${command} to remain`);
  }
  for (const command of ["qualitytodo", "qualityurgent", "qualitystatus", "opsreadiness", "handoff", "incident"]) {
    assert.doesNotMatch(bot, new RegExp(`"${command}"`), `expected /${command} to be removed`);
  }
});

test("discord access recovery buttons dispatch to live handlers", async () => {
  const bot = await readWebapp("../src/discord-bot.js");

  for (const [customId, handler] of [
    ["access-env", "handleAccessEnv"],
    ["access-whoami", "handleWhoami"],
    ["access-policy", "handlePolicy"],
    ["access-recover", "handleRecover"],
  ]) {
    assert.match(
      bot,
      new RegExp(`customId === "${customId}"[\\s\\S]{0,100}await ${handler}\\(interaction\\)`),
      `expected ${customId} to dispatch to ${handler}`
    );
  }
});

test("remaining HTML references no removed assets or iOS install surfaces", async () => {
  for (const page of ["index.html", "plan.html"]) {
    const html = await readWebapp(`../public/${page}`);

    assert.doesNotMatch(html, /manifest\.webmanifest/, page);
    assert.doesNotMatch(html, /apple-touch-icon/, page);
    assert.doesNotMatch(html, /apple-mobile-web-app/, page);
    assert.doesNotMatch(html, /icon-(192|512)\.png/, page);
    assert.doesNotMatch(html, /pwa\.js/, page);
    assert.doesNotMatch(html, /service-worker/, page);
    assert.doesNotMatch(html, /install\.html/, page);
    assert.doesNotMatch(html, /ios-install/, page);
  }
});

test("client scripts reference no removed endpoints or service worker", async () => {
  for (const script of ["app.js", "plan.js", "auth.js"]) {
    const source = await readWebapp(`../public/${script}`);

    assert.doesNotMatch(source, /serviceWorker/, script);
    assert.doesNotMatch(source, /\/api\/plans\/quality-/, script);
    assert.doesNotMatch(source, /\/api\/ios-/, script);
    assert.doesNotMatch(source, /\/api\/install-/, script);
    assert.doesNotMatch(source, /\/api\/operator-status/, script);
    assert.doesNotMatch(source, /install\.html/, script);
  }
});

test("home UI contains no callbacks from the removed quality TODO workflow", async () => {
  const [app, index] = await Promise.all([
    readWebapp("../public/app.js"),
    readWebapp("../public/index.html"),
  ]);

  assert.doesNotMatch(app, /buildPlanQualityTodo(?:Text|Preview)/);
  assert.doesNotMatch(index, /TODO/);
});

test("README documents the retained surface only", async () => {
  const readme = await fs.readFile(new URL("../../README.md", import.meta.url), "utf8");

  assert.ok(readme.split("\n").length < 400, "README must stay under 400 lines");
  assert.doesNotMatch(readme, /ios:install|ops:evidence|ops:readiness|quality:gates|quality:todo/);
  assert.doesNotMatch(readme, /manifest\.webmanifest|service-worker|apple-touch-icon/);
  assert.doesNotMatch(readme, /\/api\/plans\/quality-|\/api\/ios-|\/api\/operator-status/);
  assert.match(readme, /X-Travel-Access-Key: <your-access-key>/);
  assert.doesNotMatch(readme, /Authorization: Bearer/);
  for (const kept of ["npm run storage:migrate:sqlite", "bench:planner", "dogfood:phu-quoc", "/api/health", "/api/plans"]) {
    assert.ok(readme.includes(kept), `expected README to retain ${kept}`);
  }
});
