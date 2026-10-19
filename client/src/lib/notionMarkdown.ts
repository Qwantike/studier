// Conversion d'un export Markdown de Notion en Markdown propre pour l'éditeur.

export interface ParsedNotionPage {
  title: string;
  content: string;
  /** Images locales non importées (l'export Notion les place dans un dossier à part). */
  imagesSkipped: number;
  /** Liens relatifs vers d'autres pages de l'export, remplacés par leur texte. */
  linksFlattened: number;
}

const NOTION_ID_SUFFIX = /\s+[0-9a-f]{32}$/i; // « Ma page 3a1b…f9.md »
const EXTERNAL_URL = /^(https?:|mailto:|tel:|data:|#)/i;

/** « Algorithmes de tri 3a1b…f9.md » -> « Algorithmes de tri ». */
export function titleFromFilename(filename: string): string {
  return filename.replace(/\.md$/i, "").replace(NOTION_ID_SUFFIX, "").trim() || "Page importée";
}

// Applique fn uniquement hors des blocs de code (``` ou ~~~) pour ne jamais modifier le code de l'utilisateur.
function outsideCode(text: string, fn: (segment: string) => string): string {
  const out: string[] = [];
  let buffer: string[] = [];
  let fence: string | null = null;
  const flush = () => { if (buffer.length) out.push(fn(buffer.join("\n"))); buffer = []; };

  for (const line of text.split("\n")) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1]?.[0];
    if (fence === null) {
      if (marker) { flush(); fence = marker; out.push(line); } else buffer.push(line);
    } else {
      out.push(line);
      if (marker === fence) fence = null;
    }
  }
  flush();
  return out.join("\n");
}

const basename = (url: string) => {
  const last = url.split("/").pop() ?? url;
  try { return decodeURIComponent(last); } catch { return last; }
};

export function parseNotionMarkdown(raw: string, filename: string): ParsedNotionPage {
  let text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

  // Le premier titre de niveau 1 devient le titre du chapitre (affiché à part dans la page) : on le retire du corps.
  let title = titleFromFilename(filename);
  const h1 = text.match(/^\s*#[ \t]+(.+?)[ \t]*(?:\n|$)/);
  if (h1?.[1]) { title = h1[1].trim(); text = text.slice(h1[0].length); }

  let imagesSkipped = 0;
  let linksFlattened = 0;

  text = outsideCode(text, (s) => s
    // Lignes vides explicites des exports récents.
    .replace(/^[ \t]*<empty-block\s*\/>[ \t]*$/gm, "")
    // Callout <aside> -> citation.
    .replace(/<aside>\s*([\s\S]*?)\s*<\/aside>/g, (_m, inner: string) =>
      inner.split("\n").map((l) => (l.trim() ? `> ${l}` : ">")).join("\n"))
    // Bloc dépliable <details> -> titre en gras suivi du contenu.
    .replace(/<summary>\s*([\s\S]*?)\s*<\/summary>/g, "**$1**\n")
    .replace(/<\/?details>/g, "")
    // Images locales : le fichier n'est pas dans l'export .md, on garde une trace lisible.
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, alt: string, url: string) => {
      if (EXTERNAL_URL.test(url)) return match;
      imagesSkipped++;
      return `*[Image non importée : ${alt.trim() || basename(url)}]*`;
    })
    // Liens relatifs vers d'autres pages : ils ne mèneraient nulle part, on garde le texte.
    .replace(/(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, label: string, url: string) => {
      if (EXTERNAL_URL.test(url)) return match;
      linksFlattened++;
      return label;
    })
    .replace(/\n{3,}/g, "\n\n"));

  text = text.trim();
  return { title, content: text ? `${text}\n` : "", imagesSkipped, linksFlattened };
}
