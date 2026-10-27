import { readFileSync, writeFileSync } from "node:fs";

const token = process.env.STATS_TOKEN;
if (!token) throw new Error("STATS_TOKEN is not set; refusing to publish public-only stats");

const api = async (path) => {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
};

const repos = (await api("/user/repos?affiliation=owner&per_page=100")).filter((r) => !r.fork);
const totals = {};
for (const r of repos) {
  for (const [lang, bytes] of Object.entries(await api(`/repos/${r.full_name}/languages`))) {
    totals[lang] = (totals[lang] ?? 0) + bytes;
  }
}

const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
const total = sorted.reduce((n, [, b]) => n + b, 0);
const top = sorted.slice(0, 5);
const other = total - top.reduce((n, [, b]) => n + b, 0);
const rows = other > 0 ? [...top, ["Other", other]] : top;

const bar = (pct) => "█".repeat(Math.round(pct / 2)).padEnd(50, "░");
const lines = rows.map(([lang, bytes]) => {
  const pct = (bytes / total) * 100;
  return `| ${lang} | ${Math.round(pct)}% | \`${bar(pct)}\` |`;
});

const priv = repos.filter((r) => r.private).length;
const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const block = [
  `Across all ${repos.length} of my repositories (${repos.length - priv} public, ${priv} private), by lines of code on GitHub:`,
  "",
  "| Language | Share | |",
  "| --- | ---: | --- |",
  ...lines,
  "",
  `<sub>Updated automatically on ${date}. Private repositories are included, which the usual stats cards can't do.</sub>`,
].join("\n");

const readme = readFileSync("README.md", "utf8");
const next = readme.replace(
  /(<!--LANGS:START-->)[\s\S]*(<!--LANGS:END-->)/,
  `$1\n${block}\n$2`,
);
if (next === readme && !readme.includes("<!--LANGS:START-->")) throw new Error("markers missing in README.md");
writeFileSync("README.md", next);
