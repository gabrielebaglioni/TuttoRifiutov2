export function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function escapeText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function replaceContentAttribute(tag, value) {
  return tag.replace(/(\bcontent\s*=\s*)(["'])[^"']*\2/i, (_match, prefix, quote) => `${prefix}${quote}${escapeAttribute(value)}${quote}`);
}

function replaceHrefAttribute(tag, value) {
  return tag.replace(/(\bhref\s*=\s*)(["'])[^"']*\2/i, (_match, prefix, quote) => `${prefix}${quote}${escapeAttribute(value)}${quote}`);
}

function hasNamedAttribute(tag, attribute, value) {
  const pattern = new RegExp(`\\b${attribute}\\s*=\\s*(["'])${value.replace(/[:]/g, "\\:")}\\1`, "i");
  return pattern.test(tag);
}

function replaceMeta(html, names, value) {
  if (typeof value !== "string") return html;
  return html.replace(/<meta\b[^>]*>/gi, (tag) => (
    names.some(({ attribute, name }) => hasNamedAttribute(tag, attribute, name))
      ? replaceContentAttribute(tag, value)
      : tag
  ));
}

export function rewriteMetadata(html, metadata = {}) {
  if (typeof html !== "string" || !metadata || typeof metadata !== "object") return html;
  let next = html;
  if (typeof metadata.title === "string") {
    const title = escapeText(metadata.title);
    next = next.replace(/<title>[^<]*<\/title>/i, () => `<title>${title}</title>`);
    next = replaceMeta(next, [{ attribute: "property", name: "og:title" }, { attribute: "name", name: "twitter:title" }], metadata.title);
  }
  next = replaceMeta(next, [{ attribute: "name", name: "description" }, { attribute: "property", name: "og:description" }, { attribute: "name", name: "twitter:description" }], metadata.description);
  next = replaceMeta(next, [{ attribute: "property", name: "og:url" }], metadata.url ?? metadata.canonical);
  next = replaceMeta(next, [{ attribute: "property", name: "og:image:alt" }], metadata.imageAlt);
  next = replaceMeta(next, [{ attribute: "property", name: "og:site_name" }], metadata.siteName);
  next = replaceMeta(next, [{ attribute: "name", name: "author" }], metadata.author);
  if (typeof metadata.canonical === "string") {
    next = next.replace(/<link\b[^>]*>/gi, (tag) => (
      hasNamedAttribute(tag, "rel", "canonical") ? replaceHrefAttribute(tag, metadata.canonical) : tag
    ));
  }
  return next;
}
