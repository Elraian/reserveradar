const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Parse RT määrus XML → array of { nr, title, text } per paragraph. */
export function parseParagraphs(xml) {
  const out = [];
  for (const p of xml.matchAll(/<paragrahv\b[^>]*>([\s\S]*?)<\/paragrahv>/g)) {
    const block = p[1];
    const nr = strip(block.match(/<paragrahvNr\b[^>]*>([\s\S]*?)<\/paragrahvNr>/)?.[1] ?? "?");
    const title = strip(block.match(/<paragrahvPealkiri\b[^>]*>([\s\S]*?)<\/paragrahvPealkiri>/)?.[1] ?? "");
    const text = strip(
      block
        .replace(/<paragrahvNr\b[\s\S]*?<\/paragrahvNr>/, "")
        .replace(/<paragrahvPealkiri\b[\s\S]*?<\/paragrahvPealkiri>/, "")
    );
    out.push({ nr, title, text });
  }
  return out;
}