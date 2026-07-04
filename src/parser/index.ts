/**
 * Mermaid flowchart DSL parser → {@link DiagramModel}.
 *
 * Hand-written, dependency-free, and runs everywhere (Node + browser). Lenient
 * by default: unknown constructs degrade to a structured {@link Diagnostic} with
 * line/col and parsing continues. `strict: true` turns every diagnostic into an
 * error and throws a {@link ParseError}. See FR1 for the supported surface.
 */

import type {
  Diagnostic,
  DiagramEdge,
  DiagramModel,
  DiagramNode,
  Direction,
  EdgeKind,
  Shape,
  StyleDef,
  Subgraph,
} from "../model/index.js";
import { isSafeColor } from "../render/style.js";

export interface ParseOptions {
  /** Promote every warning to an error and throw {@link ParseError}. */
  strict?: boolean;
}

/** Thrown in strict mode (or on an unrecoverable syntax error). */
export class ParseError extends Error {
  readonly diagnostics: Diagnostic[];
  constructor(diagnostics: Diagnostic[]) {
    const first = diagnostics[0];
    super(
      first
        ? `${first.message} (line ${first.line}, col ${first.col})`
        : "parse error",
    );
    this.name = "ParseError";
    this.diagnostics = diagnostics;
  }
}

const DIRECTIONS = new Set(["TB", "TD", "BT", "LR", "RL"]);

/** One logical statement plus where it started in the source. */
interface Statement {
  text: string;
  line: number;
  /** 1-based column of `text[0]` within its physical line. */
  col: number;
}

/** Ordered shape openers: longer (2-char) delimiters are tested first. */
const SHAPE_DELIMS: Array<{ open: string; close: string; shape: Shape }> = [
  { open: "([", close: "])", shape: "stadium" },
  { open: "[[", close: "]]", shape: "subroutine" },
  { open: "[(", close: ")]", shape: "cylinder" },
  { open: "[/", close: "/]", shape: "parallelogram" },
  { open: "[\\", close: "\\]", shape: "parallelogram-alt" },
  { open: "((", close: "))", shape: "circle" },
  { open: "{{", close: "}}", shape: "hexagon" },
  { open: "[", close: "]", shape: "rect" },
  { open: "(", close: ")", shape: "rounded" },
  { open: "{", close: "}", shape: "diamond" },
];

interface LinkMatch {
  consumed: number;
  kind: EdgeKind;
  arrows: { start: boolean; end: boolean };
  label?: string;
  length: number;
}

/**
 * Parse mermaid flowchart DSL into a {@link DiagramModel}.
 */
export function parse(dsl: string, opts: ParseOptions = {}): DiagramModel {
  const strict = opts.strict === true;
  const diagnostics: Diagnostic[] = [];

  const model: DiagramModel = {
    direction: "TB",
    nodes: [],
    edges: [],
    subgraphs: [],
    classDefs: new Map<string, StyleDef>(),
    warnings: [],
  };

  const nodeMap = new Map<string, DiagramNode>();
  /** Stack of open subgraphs (innermost last). */
  const subgraphStack: Subgraph[] = [];
  /** Opening line/col of each subgraph, for the unterminated diagnostic. */
  const subgraphOpenPos = new Map<Subgraph, { line: number; col: number }>();
  let subgraphCounter = 0;

  const diag = (code: string, message: string, line: number, col: number) => {
    diagnostics.push({
      severity: strict ? "error" : "warning",
      code,
      message,
      line,
      col,
    });
  };

  const ensureNode = (id: string): DiagramNode => {
    let node = nodeMap.get(id);
    if (!node) {
      node = { id, label: id, shape: "rect", classes: [] };
      nodeMap.set(id, node);
      model.nodes.push(node);
      const parent = subgraphStack[subgraphStack.length - 1];
      if (parent && !parent.children.includes(id)) parent.children.push(id);
    }
    return node;
  };

  // --- Preprocess: physical lines → logical statements (comments stripped). ---
  const statements = collectStatements(dsl, diag);

  // --- Header (flowchart / graph <DIR>). ---
  let startIndex = 0;
  const header = statements[0];
  if (header) {
    const m = /^(?:flowchart|graph)\b[ \t]*([A-Za-z]{2})?/.exec(header.text);
    if (m) {
      startIndex = 1;
      const dir = m[1]?.toUpperCase();
      if (dir) {
        if (DIRECTIONS.has(dir)) {
          model.direction = normalizeDirection(dir as Direction);
        } else {
          diag(
            "unknown-direction",
            `unknown direction "${m[1]}"; using TB`,
            header.line,
            header.col,
          );
        }
      }
      const rest = header.text.slice(m[0].length).trim();
      if (rest) {
        // e.g. `graph TD; A-->B` after the `;` split still on the header line.
        statements[0] = { ...header, text: rest };
        startIndex = 0;
      }
    } else {
      diag(
        "missing-header",
        "no `flowchart`/`graph` header; assuming flowchart TB",
        header.line,
        header.col,
      );
    }
  }

  for (let s = startIndex; s < statements.length; s++) {
    const stmt = statements[s];
    if (!stmt) continue;
    parseStatement(stmt);
  }

  if (subgraphStack.length > 0) {
    for (const open of subgraphStack) {
      const pos = subgraphOpenPos.get(open);
      diag(
        "unterminated-subgraph",
        `subgraph "${open.title || open.id}" is missing an \`end\``,
        pos ? pos.line : 1,
        pos ? pos.col : 1,
      );
    }
  }

  model.warnings = diagnostics;
  if (strict && diagnostics.length > 0) throw new ParseError(diagnostics);
  return model;

  // ---- nested helpers (share the closures above) ----

  function parseStatement(stmt: Statement): void {
    const text = stmt.text.trim();
    if (text === "") return;
    const leadCol = stmt.col + (stmt.text.length - stmt.text.trimStart().length);

    if (/^subgraph\b/.test(text)) return openSubgraph(text.slice("subgraph".length), stmt, leadCol);
    if (text === "end") return closeSubgraph(stmt, leadCol);
    if (/^classDef\b/.test(text)) return parseClassDef(text.slice("classDef".length).trim(), stmt, leadCol);
    if (/^class\b/.test(text)) return parseClass(text.slice("class".length).trim(), stmt, leadCol);
    if (/^style\b/.test(text)) return parseStyle(text.slice("style".length).trim(), stmt, leadCol);
    if (/^direction\b/.test(text)) return parseDirection(text.slice("direction".length).trim(), stmt, leadCol);
    if (/^(linkStyle|click|href|call)\b/.test(text)) {
      diag(
        "ignored-statement",
        `\`${text.split(/\s/)[0]}\` is not supported in v1 and was ignored`,
        stmt.line,
        leadCol,
      );
      return;
    }
    parseChain(stmt);
  }

  function openSubgraph(rest: string, stmt: Statement, col: number): void {
    const body = rest.trim();
    let id: string;
    let title: string;
    let m: RegExpExecArray | null;
    if (body === "") {
      id = `subGraph${subgraphCounter++}`;
      title = "";
    } else if ((m = /^([A-Za-z0-9_]+)[ \t]*\[(.*)\]$/.exec(body))) {
      id = m[1]!;
      title = unquote(m[2]!.trim());
    } else if ((m = /^"(.*)"$/.exec(body))) {
      id = `subGraph${subgraphCounter++}`;
      title = m[1]!;
    } else if (/^[A-Za-z0-9_]+$/.test(body)) {
      id = body;
      title = body;
    } else {
      id = `subGraph${subgraphCounter++}`;
      title = unquote(body);
    }
    const sub: Subgraph = { id, title, children: [] };
    const parent = subgraphStack[subgraphStack.length - 1];
    if (parent && !parent.children.includes(id)) parent.children.push(id);
    model.subgraphs.push(sub);
    subgraphStack.push(sub);
    subgraphOpenPos.set(sub, { line: stmt.line, col });
  }

  function closeSubgraph(stmt: Statement, col: number): void {
    if (subgraphStack.length === 0) {
      diag("unmatched-end", "`end` without a matching `subgraph`", stmt.line, col);
      return;
    }
    subgraphStack.pop();
  }

  function parseDirection(rest: string, stmt: Statement, col: number): void {
    const dir = rest.toUpperCase();
    if (!DIRECTIONS.has(dir)) {
      diag("unknown-direction", `unknown direction "${rest}"`, stmt.line, col);
      return;
    }
    const norm = normalizeDirection(dir as Direction);
    const current = subgraphStack[subgraphStack.length - 1];
    if (current) current.direction = norm;
    else model.direction = norm;
  }

  function parseClassDef(rest: string, stmt: Statement, col: number): void {
    const sp = rest.indexOf(" ");
    if (sp === -1) {
      diag("bad-classdef", "classDef needs a name and style properties", stmt.line, col);
      return;
    }
    const names = rest.slice(0, sp).split(",").map((n) => n.trim()).filter(Boolean);
    const style = parseStyleProps(rest.slice(sp + 1), (key) =>
      diag("unsafe-style-value", `dropped unsafe value for \`${key}\``, stmt.line, col),
    );
    for (const name of names) {
      const existing = model.classDefs.get(name);
      model.classDefs.set(name, existing ? { ...existing, ...style } : style);
    }
  }

  function parseClass(rest: string, stmt: Statement, col: number): void {
    const m = /^(.+?)[ \t]+([A-Za-z0-9_]+)$/.exec(rest);
    if (!m) {
      diag("bad-class", "class needs node ids and a class name", stmt.line, col);
      return;
    }
    const ids = m[1]!.split(",").map((n) => n.trim()).filter(Boolean);
    const cls = m[2]!;
    for (const id of ids) {
      const node = ensureNode(id);
      if (!node.classes.includes(cls)) node.classes.push(cls);
    }
  }

  function parseStyle(rest: string, stmt: Statement, col: number): void {
    const m = /^(\S+)[ \t]+(.+)$/.exec(rest);
    if (!m) {
      diag("bad-style", "style needs a node id and style properties", stmt.line, col);
      return;
    }
    const node = ensureNode(m[1]!);
    node.style = {
      ...(node.style ?? {}),
      ...parseStyleProps(m[2]!, (key) =>
        diag("unsafe-style-value", `dropped unsafe value for \`${key}\``, stmt.line, col),
      ),
    };
  }

  /** Parse a node/edge chain: `A[x] --> B & C -->|y| D`. */
  function parseChain(stmt: Statement): void {
    const text = stmt.text;
    let i = 0;
    const skipWs = () => {
      while (i < text.length && (text[i] === " " || text[i] === "\t")) i++;
    };
    const colAt = (idx: number) => stmt.col + idx;

    skipWs();
    let group = parseNodeGroup();
    if (group.length === 0) {
      diag("expected-node", "expected a node id", stmt.line, colAt(i));
      return;
    }

    for (;;) {
      skipWs();
      if (i >= text.length) break;
      const link = matchLink(text.slice(i));
      if (!link) {
        diag(
          "unexpected-token",
          `unexpected "${text.slice(i).trim().slice(0, 16)}"`,
          stmt.line,
          colAt(i),
        );
        break;
      }
      i += link.consumed;
      skipWs();
      const next = parseNodeGroup();
      if (next.length === 0) {
        diag("expected-node", "expected an edge target after the link", stmt.line, colAt(i));
        break;
      }
      for (const from of group) {
        for (const to of next) {
          const edge: DiagramEdge = {
            from,
            to,
            kind: link.kind,
            arrows: link.arrows,
            length: link.length,
          };
          if (link.label !== undefined && link.label !== "") edge.label = link.label;
          model.edges.push(edge);
        }
      }
      group = next;
    }

    /** One or more node refs joined by `&`. */
    function parseNodeGroup(): string[] {
      const ids: string[] = [];
      for (;;) {
        skipWs();
        const id = parseNodeRef();
        if (id === null) break;
        ids.push(id);
        skipWs();
        if (text[i] === "&") {
          i++;
          continue;
        }
        break;
      }
      return ids;
    }

    /** A single node ref: `id`, `id[label]`, `id{x}:::cls`, … */
    function parseNodeRef(): string | null {
      const idMatch = /^[A-Za-z0-9_]+/.exec(text.slice(i));
      if (!idMatch) return null;
      const id = idMatch[0];
      i += id.length;
      const node = ensureNode(id);

      // optional shape + label
      const shaped = readShape();
      if (shaped) {
        node.shape = shaped.shape;
        node.label = shaped.label;
      }

      // optional inline class `:::name` (possibly repeated)
      while (text.startsWith(":::", i)) {
        i += 3;
        const cm = /^[A-Za-z0-9_]+/.exec(text.slice(i));
        if (cm) {
          i += cm[0].length;
          if (!node.classes.includes(cm[0])) node.classes.push(cm[0]);
        } else {
          diag("bad-class-ref", "expected a class name after `:::`", stmt.line, colAt(i));
          break;
        }
      }
      return id;
    }

    /** Read a shape delimiter + label at the cursor, or null. */
    function readShape(): { shape: Shape; label: string } | null {
      const rest = text.slice(i);
      for (const { open, close, shape } of SHAPE_DELIMS) {
        if (!rest.startsWith(open)) continue;
        const bodyStart = i + open.length;
        let label: string;
        let end: number;
        if (text[bodyStart] === '"') {
          const q = text.indexOf('"', bodyStart + 1);
          if (q === -1) {
            diag("unterminated-quote", "unterminated quoted label", stmt.line, colAt(bodyStart));
            label = text.slice(bodyStart + 1);
            end = text.length;
          } else {
            label = text.slice(bodyStart + 1, q);
            const closeAt = text.indexOf(close, q + 1);
            end = closeAt === -1 ? text.length : closeAt + close.length;
          }
        } else {
          const closeAt = text.indexOf(close, bodyStart);
          if (closeAt === -1) {
            diag("unterminated-shape", `unterminated \`${open}\` shape`, stmt.line, colAt(i));
            label = text.slice(bodyStart);
            end = text.length;
          } else {
            label = text.slice(bodyStart, closeAt);
            end = closeAt + close.length;
          }
        }
        i = end;
        return { shape, label: normalizeLabel(label) };
      }
      return null;
    }
  }
}

/** Split source into logical statements, stripping comments + init directives. */
function collectStatements(
  dsl: string,
  diag: (code: string, message: string, line: number, col: number) => void,
): Statement[] {
  const out: Statement[] = [];
  const lines = dsl.split(/\r\n|\r|\n/);
  for (let l = 0; l < lines.length; l++) {
    const raw = lines[l]!;
    const lineNo = l + 1;
    if (/^\s*%%\{.*\}%%\s*$/.test(raw)) {
      const at = raw.indexOf("%%") + 1;
      diag("ignored-directive", "`%%{…}%%` init directive ignored", lineNo, at);
      continue;
    }
    const cleaned = stripComment(raw);
    // split on `;` (statement separator) outside of quotes
    let start = 0;
    let inStr = false;
    for (let c = 0; c <= cleaned.length; c++) {
      const ch = cleaned[c];
      if (ch === '"') inStr = !inStr;
      if ((ch === ";" && !inStr) || c === cleaned.length) {
        const seg = cleaned.slice(start, c);
        if (seg.trim() !== "") out.push({ text: seg, line: lineNo, col: start + 1 });
        start = c + 1;
      }
    }
  }
  return out;
}

/** Remove a trailing `%% …` line comment, respecting double-quoted strings. */
function stripComment(line: string): string {
  let inStr = false;
  for (let i = 0; i < line.length - 1; i++) {
    const ch = line[i];
    if (ch === '"') inStr = !inStr;
    if (!inStr && ch === "%" && line[i + 1] === "%") return line.slice(0, i);
  }
  return line;
}

/** `<br/>` → newline; strip surrounding quotes handled by caller. */
function normalizeLabel(label: string): string {
  return label.replace(/<br\s*\/?>/gi, "\n").trim();
}

function unquote(s: string): string {
  const m = /^"(.*)"$/.exec(s);
  return normalizeLabel(m ? m[1]! : s);
}

function normalizeDirection(dir: Direction): Direction {
  return dir === "TD" ? "TB" : dir;
}

/**
 * Allowlist of safe CSS values for the style properties that reach a render
 * sink: SVG attributes in `renderSvg`, and inline card CSS in the DOM runtime /
 * standalone HTML export. `style`/`classDef` values are attacker-controlled, so
 * a value outside these grammars — notably one containing `url(`, quotes,
 * `<`/`>`, `;`, `}`, backslashes, whitespace, or control chars — is DROPPED at
 * the source rather than rendered. This closes the SVG attribute-breakout XSS
 * (REV-001) and the CSS `url()` network fetch that would break the zero-network
 * HTML export (REV-002). The SVG sink additionally attribute-escapes as defense
 * in depth.
 */
// The color allowlist lives in `render/style` ({@link isSafeColor}) as the one
// source of truth shared with the mermaid fallback tier's `themeVariables`
// sanitizer. Width/dash grammars are parser-local (only `style`/`classDef` reach
// them).
const SAFE_WIDTH = /^[0-9]*\.?[0-9]+(?:px|pt|em|rem|%)?$/;
const SAFE_DASH = /^[0-9][0-9.,\s]*$/;

/** Is a `style`/`classDef` value safe to render for its property? */
function isSafeStyleValue(key: string, value: string): boolean {
  switch (key) {
    case "stroke-width":
      return SAFE_WIDTH.test(value);
    case "stroke-dasharray":
      return SAFE_DASH.test(value);
    case "fill":
    case "stroke":
    case "color":
      return isSafeColor(value);
    default:
      // Unknown keys are preserved verbatim but never reach a render sink.
      return true;
  }
}

/**
 * Split a style property list on commas at **paren depth 0** only, so a comma
 * inside a function value — `rgb(10,20,30)`, `hsl(200,50%,40%)`, `rgba(...)`,
 * `hsla(...)` — stays with its declaration instead of being fragmented (which
 * would fail {@link isSafeStyleValue} and drop a legitimate color). The `;`
 * declaration separator is already split upstream in {@link collectStatements}.
 */
function splitTopLevelCommas(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      if (depth > 0) depth--;
    } else if (ch === "," && depth === 0) {
      parts.push(input.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(input.slice(start));
  return parts;
}

/** Parse `fill:#f9f,stroke:#333,stroke-width:2px` into a {@link StyleDef}. */
function parseStyleProps(
  input: string,
  onDrop?: (key: string, value: string) => void,
): StyleDef {
  const style: StyleDef = {};
  for (const part of splitTopLevelCommas(input)) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "" || value === "") continue;
    if (!isSafeStyleValue(key, value)) {
      onDrop?.(key, value);
      continue;
    }
    switch (key) {
      case "stroke-width":
        style.strokeWidth = value;
        break;
      case "stroke-dasharray":
        style.strokeDasharray = value;
        break;
      default:
        style[key] = value;
    }
  }
  return style;
}

/**
 * Match a link operator at the start of `rest`. Handles solid/open/dotted/thick
 * lines, `<`/`x`/`o` arrow markers on either end, the `-- text -->` middle-label
 * form, and a trailing `|label|`.
 */
export function matchLink(rest: string): LinkMatch | null {
  // Middle-label forms first (more specific).
  const mid =
    /^([<xo])?={2,}[ \t]+(.+?)[ \t]+={2,}([>xo])?/.exec(rest) ??
    /^([<xo])?-\.+[ \t]+(.+?)[ \t]+\.+-([>xo])?/.exec(rest) ??
    /^([<xo])?-{2,}[ \t]+(.+?)[ \t]+-{2,}([>xo])?/.exec(rest);
  let m: RegExpExecArray | null = mid;
  let label: string | undefined;
  let lineStyle: "solid" | "dotted" | "thick";
  if (m) {
    label = normalizeLabel(m[2]!);
    lineStyle = m[0]!.includes("=") ? "thick" : m[0]!.includes(".") ? "dotted" : "solid";
  } else {
    m =
      /^([<xo])?-\.+-([>xo])?/.exec(rest) ??
      /^([<xo])?={2,}([>xo])?/.exec(rest) ??
      /^([<xo])?-{2,}([>xo])?/.exec(rest);
    if (!m) return null;
    lineStyle = m[0]!.includes("=") ? "thick" : m[0]!.includes(".") ? "dotted" : "solid";
  }

  let consumed = m[0]!.length;
  const startMarker = m[1];
  const endMarker = m[m.length - 1];
  const arrows = {
    start: startMarker === "<" || startMarker === "x" || startMarker === "o",
    end: endMarker === ">" || endMarker === "x" || endMarker === "o",
  };

  // trailing |label| (wins over a middle label if both somehow appear)
  const pipe = /^[ \t]*\|([^|]*)\|/.exec(rest.slice(consumed));
  if (pipe) {
    label = normalizeLabel(pipe[1]!);
    consumed += pipe[0].length;
  }

  const lineChars = m[0]!.replace(/[<>xo]/g, "");
  const length = lineChars.replace(/[^-=]/g, "").length || 2;

  let kind: EdgeKind;
  if (lineStyle === "dotted") kind = "dotted";
  else if (lineStyle === "thick") kind = "thick";
  else kind = arrows.start || arrows.end ? "solid" : "open";

  const out: LinkMatch = { consumed, kind, arrows, length };
  if (label !== undefined) out.label = label;
  return out;
}
