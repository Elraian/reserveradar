import { readFileSync } from "node:fs";
import { parseParagraphs } from "./parse-eeskiri-core.mjs";

// CLI demo: only when run directly (node scripts/parse-eeskiri.mjs <file>).
const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("parse-eeskiri.mjs");
if (invokedDirectly) {
  const xml = readFileSync(process.argv[2] ?? "data/vahtrepa.xml", "utf8");
  const paras = parseParagraphs(xml);
  for (const p of paras.slice(0, 10)) {
    console.log(`\n§${p.nr} ${p.title}\n  ${p.text.slice(0, 240)}${p.text.length > 240 ? "…" : ""}`);
  }
  console.log(`\nTotal paragraphs: ${paras.length}`);
}
