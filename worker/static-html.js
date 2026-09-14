const pages = typeof __STATIC_HTML_PAGES__ === "undefined" ? {} : __STATIC_HTML_PAGES__;

export const STATIC_HTML = Object.freeze(pages);

export function embeddedHtmlResponse(request) {
  if (!request || !["GET", "HEAD"].includes(request.method)) return null;
  const html = STATIC_HTML[new URL(request.url).pathname];
  if (typeof html !== "string") return null;
  return new Response(request.method === "HEAD" ? null : html, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    },
  });
}
