import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function markdownToHtml(markdown, title = "Travel Plan") {
  const body = [];
  let listOpen = false;
  const closeList = () => {
    if (listOpen) body.push("</ul>");
    listOpen = false;
  };
  for (const rawLine of String(markdown).split("\n")) {
    const line = rawLine.trimEnd();
    if (line.startsWith("### ")) {
      closeList();
      body.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      closeList();
      body.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      closeList();
      body.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    } else if (line.startsWith("- ")) {
      if (!listOpen) body.push("<ul>");
      listOpen = true;
      body.push(`<li>${escapeHtml(line.slice(2))}</li>`);
    } else if (!line.trim()) {
      closeList();
    } else {
      closeList();
      body.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  closeList();
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
@page { size: A4; margin: 16mm; }
:root { color-scheme: light; font-family: "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; color: #172033; background: #f3f5f8; }
body { max-width: 920px; margin: 0 auto; padding: 32px; line-height: 1.65; }
h1 { margin: 0 0 24px; color: #0c4a6e; }
h2 { margin-top: 30px; padding-bottom: 8px; border-bottom: 2px solid #bae6fd; color: #075985; }
h3 { margin: 20px 0 10px; padding: 12px 16px; border-radius: 10px; background: #e0f2fe; break-after: avoid; }
ul { margin: 8px 0 16px; padding: 14px 18px 14px 36px; border: 1px solid #dbe4ee; border-radius: 10px; background: white; }
li + li { margin-top: 6px; }
p { white-space: pre-wrap; }
@media print { body { padding: 0; } h2, h3 { break-after: avoid; } ul { break-inside: avoid; } }
</style>
</head>
<body>
${body.join("\n")}
</body>
</html>
`;
}

async function atomicWrite(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, content);
  await rename(temporary, filePath);
}

async function findChrome(explicit) {
  const candidates = [
    explicit,
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known executable.
    }
  }
  throw new Error("Chrome executable not found; set CHROME_BIN to export PDF");
}

export async function exportReport({ markdownPath, outputDir, title, htmlOnly = false, chromeBin }) {
  const markdown = await readFile(markdownPath, "utf8");
  const markdownOutput = path.join(outputDir, "travel_plan.md");
  const htmlOutput = path.join(outputDir, "travel_plan.html");
  const pdfOutput = path.join(outputDir, "travel_plan.pdf");
  await atomicWrite(markdownOutput, markdown);
  await atomicWrite(htmlOutput, markdownToHtml(markdown, title));
  if (!htmlOnly) {
    const chrome = await findChrome(chromeBin);
    await execFileAsync(chrome, [
      "--headless",
      "--disable-gpu",
      "--no-pdf-header-footer",
      `--print-to-pdf=${pdfOutput}`,
      pathToFileURL(htmlOutput).href,
    ]);
    const header = await readFile(pdfOutput);
    if (header.length < 1000 || header.subarray(0, 4).toString() !== "%PDF") {
      throw new Error("PDF export did not produce a valid PDF file");
    }
  }
  return { markdownOutput, htmlOutput, ...(htmlOnly ? {} : { pdfOutput }) };
}
