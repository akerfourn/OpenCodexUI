/** Explicit sizes avoid browser section nesting shrinking H1 below lower-level headings. */
export const markdownHeadingStyles = {
  "& h1, & h2, & h3, & h4, & h5, & h6": {
    fontWeight: 700, lineHeight: 1.3, mt: "1.25em", mb: "0.5em"
  },
  "& h1": { fontSize: "2em" },
  "& h2": { fontSize: "1.5em" },
  "& h3": { fontSize: "1.25em" },
  "& h4": { fontSize: "1.125em" },
  "& h5": { fontSize: "1em" },
  "& h6": { fontSize: "0.875em" }
} as const;
