/** Splits only complete leading YAML frontmatter; incomplete documents remain untouched. */
export function splitMarkdownFrontmatter(content: string): { yaml: string | null; markdown: string } {
  const opening = /^(?:\uFEFF)?---[\t ]*\r?\n/.exec(content);
  if (opening === null) return { yaml: null, markdown: content };
  const remainder = content.slice(opening[0].length);
  const closing = /^(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/m.exec(remainder);
  if (closing === null) return { yaml: null, markdown: content };
  return {
    yaml: remainder.slice(0, closing.index),
    markdown: remainder.slice(closing.index + closing[0].length)
  };
}
