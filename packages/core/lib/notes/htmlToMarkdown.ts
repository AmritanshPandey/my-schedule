/**
 * Rich note HTML (what the web's tiptap editor stores) → the note markdown
 * line model (lib/notes/markdown.ts): headings, paragraphs, bullet / numbered
 * / checklist items with indentation, pipe tables, and the inline tokens
 * **bold**, *italic*, ~~strike~~, `code` and {c=color}…{/c}.
 *
 * This is the bridge that lets a surface without a DOM editor (apps/native)
 * open, render and edit any note: everything tiptap's toolbar can produce has
 * a markdown form, and the web reads a markdown body back through
 * bodyToEditorHtml. Inline note tags (pills) become `#tag` text — the tag
 * itself also lives on `note.tags`, which the web editor keeps in sync.
 *
 * Pure string work: a tiny tokenizer builds an element tree, then a walk
 * emits lines. No DOM, so it runs the same in Node, Hermes and the browser.
 */
import { NOTE_COLORS } from "./markdown";
import { isRichNoteBody, stripRichNoteBodyPrefix } from "./richText";

type HtmlNode =
  | { type: "text"; text: string }
  | { type: "element"; tag: string; attrs: Record<string, string>; children: HtmlNode[] };

const VOID_TAGS = new Set(["br", "hr", "input", "img", "col", "wbr"]);
const TOKEN_RE = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|[^<]+|</g;
const ATTR_RE = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let match: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(raw)) !== null) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

/** Tokenize into a forgiving element tree (unclosed tags close at their parent's end). */
export function parseHtml(html: string): HtmlNode[] {
  const root: HtmlNode = { type: "element", tag: "#root", attrs: {}, children: [] };
  const stack: Array<Extract<HtmlNode, { type: "element" }>> = [root as Extract<HtmlNode, { type: "element" }>];
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(html)) !== null) {
    const token = match[0];
    const top = stack[stack.length - 1];
    if (token.startsWith("<!--")) continue;
    if (match[1]) {
      const tag = match[1].toLowerCase();
      if (token.startsWith("</")) {
        const idx = stack.map((n) => n.tag).lastIndexOf(tag);
        if (idx > 0) stack.length = idx;
        continue;
      }
      const el: Extract<HtmlNode, { type: "element" }> = { type: "element", tag, attrs: parseAttrs(match[2] ?? ""), children: [] };
      top.children.push(el);
      if (!VOID_TAGS.has(tag) && !match[3]) stack.push(el);
      continue;
    }
    top.children.push({ type: "text", text: decodeEntities(token) });
  }
  return (root as Extract<HtmlNode, { type: "element" }>).children;
}

// ── Inline ────────────────────────────────────────────────────────────────────

function hexFromCss(color: string): string | null {
  const value = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  if (/^#[0-9a-f]{3}$/.test(value)) return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!rgb) return null;
  const toHex = (n: string) => Number(n).toString(16).padStart(2, "0");
  return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
}

function noteColorName(el: Extract<HtmlNode, { type: "element" }>): string | null {
  if (el.attrs["data-note-color"]) return el.attrs["data-note-color"];
  const style = el.attrs.style ?? "";
  const colorDecl = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
  if (!colorDecl) return null;
  const hex = hexFromCss(colorDecl[1]);
  if (!hex) return null;
  return NOTE_COLORS.find((c) => c.hex.toLowerCase() === hex)?.name ?? null;
}

/** Wrap with a paired marker, keeping edge whitespace outside so the token still parses. */
function wrap(inner: string, open: string, close = open): string {
  const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!m || !m[2]) return inner;
  return `${m[1]}${open}${m[2]}${close}${m[3]}`;
}

function inlineText(nodes: HtmlNode[]): string {
  return nodes.map(inlineNode).join("");
}

function inlineNode(node: HtmlNode): string {
  if (node.type === "text") return node.text.replace(/\s*\n\s*/g, " ");
  const inner = () => inlineText(node.children);
  switch (node.tag) {
    case "br":
      return "\n";
    case "strong":
    case "b":
      return wrap(inner(), "**");
    case "em":
    case "i":
      return wrap(inner(), "*");
    case "s":
    case "del":
    case "strike":
      return wrap(inner(), "~~");
    case "code":
      return wrap(inner(), "`");
    case "input":
    case "img":
      return "";
    case "span": {
      if (node.attrs["data-note-tag"] !== undefined) {
        const tag = node.attrs["data-note-tag"] || inner().replace(/^#/, "");
        return tag ? `#${tag}` : "";
      }
      const color = noteColorName(node);
      return color ? wrap(inner(), `{c=${color}}`, "{/c}") : inner();
    }
    default:
      return inner();
  }
}

// ── Blocks ────────────────────────────────────────────────────────────────────

const BLOCK_TAGS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table", "blockquote", "hr", "pre", "label"]);

function isBlock(node: HtmlNode): boolean {
  return node.type === "element" && BLOCK_TAGS.has(node.tag);
}

const pad = (indent: number) => "  ".repeat(Math.max(0, indent));

function cellText(cell: Extract<HtmlNode, { type: "element" }>): string {
  // A cell holds paragraphs; one table row is one line, so they join with a space.
  const parts: string[] = [];
  for (const child of cell.children) {
    const text = isBlock(child) && child.type === "element" ? inlineText(child.children) : inlineNode(child);
    if (text.trim()) parts.push(text.trim());
  }
  return parts.join(" ").replace(/\n/g, " ").replace(/\|/g, "/");
}

function tableLines(table: Extract<HtmlNode, { type: "element" }>): string[] {
  const rows: string[][] = [];
  const walk = (nodes: HtmlNode[]) => {
    for (const node of nodes) {
      if (node.type !== "element") continue;
      if (node.tag === "tr") {
        rows.push(node.children.filter((c): c is Extract<HtmlNode, { type: "element" }> => c.type === "element" && (c.tag === "td" || c.tag === "th")).map(cellText));
      } else if (node.tag !== "colgroup") {
        walk(node.children);
      }
    }
  };
  walk(table.children);
  if (rows.length === 0) return [];
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const norm = rows.map((r) => [...r, ...Array(cols - r.length).fill("")]);
  const line = (r: string[]) => `| ${r.join(" | ")} |`;
  return [line(norm[0]), `| ${Array(cols).fill("---").join(" | ")} |`, ...norm.slice(1).map(line)];
}

function listLines(list: Extract<HtmlNode, { type: "element" }>, indent: number): string[] {
  const out: string[] = [];
  const isTaskList = list.attrs["data-type"] === "taskList";
  let order = Number(list.attrs.start) || 1;
  for (const item of list.children) {
    if (item.type !== "element" || item.tag !== "li") continue;
    const isTask = isTaskList || item.attrs["data-type"] === "taskItem";
    const checked = item.attrs["data-checked"] === "true";
    // A task item nests its content in a <div>; a plain item holds it directly.
    const content = isTask ? item.children.find((c) => c.type === "element" && c.tag === "div") : null;
    const children = content && content.type === "element" ? content.children : item.children;

    let first: string | null = null;
    const rest: string[] = [];
    let inlineBuffer = "";
    const flushInline = () => {
      if (!inlineBuffer.trim()) {
        inlineBuffer = "";
        return;
      }
      const text = inlineBuffer.trim();
      inlineBuffer = "";
      if (first === null) first = text;
      else rest.push(`${pad(indent + 1)}${text}`);
    };
    for (const child of children) {
      if (child.type === "element" && (child.tag === "ul" || child.tag === "ol")) {
        flushInline();
        if (first === null) first = "";
        rest.push(...listLines(child, indent + 1));
      } else if (child.type === "element" && child.tag === "label") {
        continue; // the task item's checkbox
      } else if (isBlock(child) && child.type === "element") {
        flushInline();
        const lines = blockLines([child], indent + 1);
        for (const l of lines) {
          if (first === null) first = l.trim();
          else rest.push(l);
        }
      } else {
        inlineBuffer += inlineNode(child);
      }
    }
    flushInline();

    const text = (first ?? "").replace(/\n/g, " ");
    if (isTask) out.push(`${pad(indent)}- [${checked ? "x" : " "}] ${text}`);
    else if (list.tag === "ol") out.push(`${pad(indent)}${order++}. ${text}`);
    else out.push(`${pad(indent)}- ${text}`);
    out.push(...rest);
  }
  return out;
}

function blockLines(nodes: HtmlNode[], indent = 0): string[] {
  const out: string[] = [];
  let inlineBuffer = "";
  const flushInline = () => {
    if (!inlineBuffer.trim()) {
      inlineBuffer = "";
      return;
    }
    for (const line of inlineBuffer.split("\n")) out.push(line.trim() ? `${pad(indent)}${line.trim()}` : "");
    inlineBuffer = "";
  };

  for (const node of nodes) {
    if (!isBlock(node) || node.type !== "element") {
      inlineBuffer += inlineNode(node);
      continue;
    }
    flushInline();
    switch (node.tag) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const level = Math.min(3, Number(node.tag[1]));
        out.push(`${"#".repeat(level)} ${inlineText(node.children).replace(/\n/g, " ").trim()}`);
        break;
      }
      case "ul":
      case "ol":
        out.push(...listLines(node, indent));
        break;
      case "table":
        out.push(...tableLines(node));
        break;
      case "hr":
        out.push("---");
        break;
      case "pre": {
        const code = inlineText(node.children).replace(/^`|`$/g, "");
        for (const line of code.split("\n")) out.push(line ? `${pad(indent)}\`${line}\`` : "");
        break;
      }
      case "blockquote":
      case "div":
      case "label":
      case "li":
        out.push(...blockLines(node.children, indent));
        break;
      default: {
        // p (and anything paragraph-like): one line per hard break; an empty
        // paragraph is a deliberate blank line.
        const text = inlineText(node.children);
        if (!text.trim()) {
          out.push("");
        } else {
          for (const line of text.split("\n")) out.push(line.trim() ? `${pad(indent)}${line.trim()}` : "");
        }
      }
    }
  }
  flushInline();
  return out;
}

/** Rich note HTML (no prefix) → note markdown. */
export function richHtmlToMarkdown(html: string): string {
  const lines = blockLines(parseHtml(html));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  while (lines.length > 0 && lines[0] === "") lines.shift();
  return lines.join("\n");
}

/** Any stored note body → note markdown (a legacy markdown body passes through). */
export function bodyToMarkdown(body: string): string {
  return isRichNoteBody(body) ? richHtmlToMarkdown(stripRichNoteBodyPrefix(body)) : body;
}
