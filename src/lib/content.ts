import sanitizeHtml from "sanitize-html";

const textEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  laquo: "«",
  lt: "<",
  nbsp: " ",
  quot: '"',
  raquo: "»",
};

const unsupportedWidgetShortcodeNames = [
  "archetype_gallery",
  "bg_banner",
  "bg_heroes",
  "bg_strategies",
  "game_offer",
  "hs_deck-small",
  "hs_matchups",
  "nbm_box",
  "nbm_boxes_row",
  "voting",
];

const unsupportedWidgetShortcodes = unsupportedWidgetShortcodeNames.join("|");

function removeShortcodeBlocks(value: string, shortcode: string): string {
  const escapedShortcode = shortcode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tags = value.matchAll(new RegExp(`\\[(\\/?)${escapedShortcode}\\b[^\\]]*\\]`, "gi"));
  let output = "";
  let cursor = 0;
  let depth = 0;

  for (const tag of tags) {
    const index = tag.index;
    if (depth === 0) output += value.slice(cursor, index);
    if (tag[1]) {
      if (depth > 0) depth -= 1;
    } else {
      depth += 1;
    }
    cursor = index + tag[0].length;
  }

  if (depth === 0) output += value.slice(cursor);
  return output;
}

function removePrivateShortcodeBlocks(value: string): string {
  return removeShortcodeBlocks(value, "panelVIP");
}

function removePairedWidgetBlocks(value: string): string {
  return unsupportedWidgetShortcodeNames.reduce((output, shortcode) => {
    const escapedShortcode = shortcode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hasClosingTag = new RegExp(`\\[\\/${escapedShortcode}\\s*\\]`, "i").test(output);
    return hasClosingTag ? removeShortcodeBlocks(output, shortcode) : output;
  }, value);
}

export function normalizeWordPressShortcodes(value: string): string {
  const withoutPrivateContent = removePrivateShortcodeBlocks(value);
  const withoutPairedWidgets = removePairedWidgetBlocks(withoutPrivateContent);
  const widgetPattern = new RegExp(`\\[(?:${unsupportedWidgetShortcodes})(?:\\s[^\\]]*)?\\]`, "gi");
  const widgetClosingPattern = new RegExp(`\\[\\/(?:${unsupportedWidgetShortcodes})\\s*\\]`, "gi");

  return withoutPairedWidgets
    .replace(/\[su_panel(?:\s[^\]]*)?\]/gi, '<aside class="wp-editorial-panel">')
    .replace(/\[\/su_panel\s*\]/gi, "</aside>")
    .replace(/\[hs-card(?:\s[^\]]*)?\]/gi, '<span class="wp-card-reference">')
    .replace(/\[\/hs-card\s*\]/gi, "</span>")
    .replace(widgetPattern, '<aside class="wp-shortcode-fallback">Интерактивный блок доступен в оригинале статьи.</aside>')
    .replace(widgetClosingPattern, "");
}

export function decodeText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (entity, name: string) => textEntities[name.toLowerCase()] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

export function localMediaUrl(value: string): string {
  try {
    const source = new URL(value);
    if (source.protocol !== "https:" || source.hostname !== "hs-manacost.ru" || !source.pathname.startsWith("/wp-content/uploads/")) {
      return "";
    }
    return `/api/media?url=${encodeURIComponent(`https://hs-manacost.ru${source.pathname}`)}`;
  } catch {
    return "";
  }
}

const allowedIframeHosts = new Set([
  "www.youtube.com", "youtube.com", "player.vimeo.com", "rutube.ru",
  "vk.com", "www.vk.com", "vk.ru", "www.vk.ru", "vkvideo.ru", "www.vkvideo.ru"
]);

function safeIframeUrl(value: string): string {
  try {
    const source = new URL(value);
    if (
      source.protocol !== "https:" ||
      source.port !== "" ||
      source.username !== "" ||
      source.password !== "" ||
      !allowedIframeHosts.has(source.hostname)
    ) {
      return "";
    }
    return source.toString();
  } catch {
    return "";
  }
}

export function sanitizeArticleHtml(value: string): string {
  return sanitizeHtml(normalizeWordPressShortcodes(value), {
    allowedTags: [
      "p", "br", "strong", "em", "b", "i", "u", "s", "h2", "h3", "h4", "ul", "ol", "li",
      "blockquote", "figure", "figcaption", "img", "a", "table", "thead", "tbody", "tr", "th", "td",
      "dl", "dt", "dd",
      "pre", "code", "details", "summary", "div", "span", "aside", "iframe"
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "srcset", "sizes", "alt", "title", "width", "height", "loading", "decoding"],
      iframe: ["src", "title", "width", "height", "allow", "allowfullscreen", "loading", "referrerpolicy"],
      "*": ["class"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { iframe: ["https"] },
    allowedIframeHostnames: [
      "www.youtube.com", "youtube.com", "player.vimeo.com", "rutube.ru",
      "vk.com", "www.vk.com", "vk.ru", "www.vk.ru", "vkvideo.ru", "www.vkvideo.ru"
    ],
    transformTags: {
      a: (_tagName, attribs) => {
        const mediaHref = localMediaUrl(attribs.href ?? "");
        return {
          tagName: "a",
          attribs: { ...attribs, href: mediaHref || attribs.href, rel: "noopener noreferrer" }
        };
      },
      img: (_tagName, attribs) => ({
        tagName: "img",
        attribs: { ...attribs, src: localMediaUrl(attribs.src ?? ""), srcset: "", loading: "lazy", decoding: "async" }
      }),
      iframe: (_tagName, attribs) => ({
        tagName: "iframe",
        attribs: {
          ...attribs,
          src: safeIframeUrl(attribs.src ?? ""),
          loading: "lazy",
          referrerpolicy: "strict-origin-when-cross-origin"
        }
      })
    },
    exclusiveFilter(frame) {
      if ((frame.tag === "img" || frame.tag === "iframe") && !frame.attribs.src) return true;
      const classes = frame.attribs.class ?? "";
      return /(?:vip|paywall|td-a-rec|adsbygoogle|ya-ad)/i.test(classes);
    }
  });
}

export function readingMinutes(html: string): number {
  const words = decodeText(html).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}
