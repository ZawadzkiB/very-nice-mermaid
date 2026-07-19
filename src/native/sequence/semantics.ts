/**
 * Archify-style semantic classification for sequence diagrams — shared by the layout (box
 * sizing / legend) and the SVG renderer (colors / sub-labels). Pure string heuristics, no theme:
 * a participant's name → a node ROLE + a short TYPE sub-label, and a message's arrow-style + label
 * → a semantic KIND that drives its color (request / response / exception / cache / async).
 */

import type { MessageSemantic } from "../../model/sequence.js";
import type { EdgeKind } from "../../model/index.js";

/** Infer a node ROLE from a participant's display name (mirrors the flowchart role vocabulary). */
export function inferRole(label: string): string | undefined {
  const s = label.toLowerCase();
  const rules: [string, RegExp][] = [
    ["database", /postgres|postgresql|mysql|mariadb|redis|mongo|cassandra|dynamo|sqlite|datastore|\bdb\b|database|\bcache\b/],
    ["messagebus", /kafka|rabbit|\bsqs\b|\bsns\b|pubsub|\bqueue\b|\btopic\b|\bbus\b|\bstream\b|\bnats\b|\bmq\b|eventbridge|broker/],
    ["security", /\bauth\b|oauth|\bjwt\b|\biam\b|vault|keycloak|identity|\blogin\b|\bsso\b|security|\btoken\b/],
    ["external", /\buser\b|customer|external|third[- ]?party|\b3rd\b|\bactor\b|browser|\bclient\b|visitor/],
    ["frontend", /\bweb\b|\bui\b|frontend|\bspa\b|mobile|\bapp\b|portal|dashboard/],
    ["cloud", /\bcdn\b|\bwaf\b|\bs3\b|cloudfront|nginx|proxy|ingress|load ?balancer|\blb\b|\bcloud\b/],
    ["backend", /\bapi\b|gateway|service|server|backend|worker|lambda|function|microservice|grpc|handler|orchestrat/],
  ];
  for (const [role, re] of rules) if (re.test(s)) return role;
  return undefined;
}

/** A short archify-style TYPE sub-label under a participant's name (empty when unrecognized). */
export function typeLabel(label: string): string {
  const role = inferRole(label);
  const s = label.toLowerCase();
  switch (role) {
    case "database":
      return /redis|memcache|\bcache\b/.test(s) ? "cache" : "store";
    case "backend":
      return /gateway/.test(s) ? "gateway" : /worker/.test(s) ? "worker" : "service";
    case "security":
      return "auth";
    case "messagebus":
      return "broker";
    case "frontend":
      return /browser/.test(s) ? "browser" : "client";
    case "cloud":
      return /cdn/.test(s) ? "cdn" : /waf/.test(s) ? "waf" : "edge";
    case "external":
      return "actor";
    default:
      return "";
  }
}

/**
 * Classify a message into a semantic KIND. A dashed arrow (`-->>`) is a response; otherwise the
 * label's keywords pick exception / cache / async, defaulting to a plain request. Drives color.
 */
export function messageSemantic(kind: "solid" | "dashed", label: string): MessageSemantic {
  const s = label.toLowerCase();
  if (/error|fail|reject|denied|invalid|exception|timeout|unauthor|\b40[13]\b|\b500\b|refus/.test(s)) return "exception";
  if (/cache|redis|\bhit\b|\bmiss\b|memcache|\bttl\b/.test(s)) return "cache";
  if (/emit|publish|event|async|enqueue|\bqueue\b|kafka|\btopic\b|stream|notify|webhook|fire/.test(s)) return "async";
  if (kind === "dashed") return "response";
  return "request";
}

/**
 * Classify a FLOWCHART edge into a semantic from its label keywords (colours it). Unlike a sequence
 * message, a plain unlabeled edge stays the theme's default colour (returns `undefined`) so only
 * intentionally-labeled edges pick up a colour — a dotted edge with no keyword reads as a fallback.
 */
export function flowEdgeSemantic(kind: EdgeKind, label: string): MessageSemantic | undefined {
  const s = (label ?? "").toLowerCase();
  if (/error|fail|reject|denied|invalid|exception|timeout|unauthor|refus|\b40[13]\b|\b500\b/.test(s)) return "exception";
  if (/cache|redis|\bhit\b|\bmiss\b|memcache|\bttl\b|lookup/.test(s)) return "cache";
  if (/emit|publish|event|async|enqueue|\bqueue\b|kafka|\btopic\b|stream|notify|webhook|fire|dispatch/.test(s)) return "async";
  if (/\bget\b|\bpost\b|\bput\b|verify|login|auth|query|fetch|read|write|route|call|request|checkout|sync/.test(s)) return "request";
  if (kind === "dotted") return "cache"; // a dotted fallback edge reads as a cache/optional path
  return undefined;
}

/** Stable display order for the legend + swatch labels. */
export const SEMANTIC_ORDER: MessageSemantic[] = ["request", "response", "cache", "async", "exception"];
export const SEMANTIC_LABEL: Record<MessageSemantic, string> = {
  request: "request",
  response: "response",
  cache: "cache",
  async: "async",
  exception: "exception",
};
