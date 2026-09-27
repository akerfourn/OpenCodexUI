import { useTranslation } from "react-i18next";

/** Leaves local images as navigable links until source-aware binary reads are available. */
export function MarkdownPreviewImage({ src, alt, title }: { src?: string; alt?: string; title?: string }) {
  const { t } = useTranslation();
  if (src !== undefined && /^https?:\/\//i.test(src)) {
    return <img src={src} alt={alt ?? ""} title={title} loading="lazy" referrerPolicy="no-referrer" />;
  }
  return <a href={src} title={title} data-markdown-image="true">
    {t("files.previewImageLink", { name: alt || src || "image" })}
  </a>;
}
