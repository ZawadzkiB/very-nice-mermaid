/**
 * Shared semantic → colour mapping for edges/messages, used by both the flowchart and the
 * sequence renderers (and their runtime twins). A semantic (request / response / cache / async /
 * exception) resolves to a stroke colour from the theme's role palette so a coloured edge matches
 * the archify look; each also gets its own arrowhead marker id so the head takes the same colour.
 */

import type { MessageSemantic } from "../model/sequence.js";
import type { TokenSet } from "../theme/index.js";

/** Every semantic that gets a colored arrowhead marker + a legend swatch, in display order. */
export const SEMANTICS: MessageSemantic[] = ["request", "response", "cache", "async", "exception"];

/** Human labels for the legend. */
export const SEMANTIC_LABEL: Record<MessageSemantic, string> = {
  request: "request",
  response: "response",
  cache: "cache",
  async: "async",
  exception: "exception",
};

/** A semantic's stroke colour (via the role palette; `response`/unknown stays the muted edge colour). */
export function semanticColor(sem: MessageSemantic | undefined, t: TokenSet): string {
  const roles = t.colors.roles;
  switch (sem) {
    case "request":
      return roles.backend?.stroke ?? t.colors.accent;
    case "cache":
      return roles.database?.stroke ?? t.colors.accent;
    case "async":
      return roles.messagebus?.stroke ?? t.colors.accent;
    case "exception":
      return roles.danger?.stroke ?? "#ef4444";
    case "response":
    default:
      return t.colors.edge;
  }
}

/** Stable marker id for a semantic's colored arrowhead (a matching `<marker>` lives in `<defs>`). */
export function semanticMarkerId(sem: MessageSemantic | undefined): string {
  return "vnm-arrow-" + (sem ?? "response");
}
