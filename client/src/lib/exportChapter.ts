export interface ExportableChapter { title: string; content_md: string }

/** Nom de fichier sûr : sans accents ni caractères spéciaux, 60 caractères maximum. */
export function fileSlug(title: string): string {
    const slug = title
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
        .slice(0, 60).replace(/-+$/, "");
    return slug || "chapitre";
}

/**
 * Markdown d'un chapitre, au format que l'import sait relire : le titre du chapitre en titre H1, puis son contenu.
 * Si le contenu commence déjà par ce même titre, on ne le répète pas.
 */
export function chapterToMarkdown(chapter: ExportableChapter): string {
    const title = chapter.title.trim() || "Sans titre";
    const body = chapter.content_md.replace(/\r\n/g, "\n").replace(/^(?:[ \t]*\n)+/, "");
    const first = /^#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\n|$)/.exec(body)?.[1]?.trim().toLowerCase();
    const md = first === title.toLowerCase() ? body : `# ${title}\n\n${body}`;
    return `${md.replace(/\s+$/, "")}\n`;
}

/** Télécharge le chapitre en fichier .md. */
export function downloadChapter(chapter: ExportableChapter): void {
    const blob = new Blob([chapterToMarkdown(chapter)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileSlug(chapter.title)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}