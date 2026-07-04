/**
 * Structured render/pipeline diagnostics (FR5 / D5) — the "loud fallback" channel.
 *
 * Distinct from the parser's {@link Diagnostic} (which carries a source line/col):
 * these describe *pipeline* events — which **tier** rendered a diagram, why a
 * **capability** (ascii, png, native styling) was unavailable, and when an output
 * **degraded** (e.g. mermaid geometry under jsdom). Every non-native path emits
 * one so a fallback is never silent.
 *
 * Browser-safe: plain data + string formatting, no Node built-ins or DOM globals.
 */

/** Render-diagnostic severity. `info` is expected-but-notable; `warn`/`error` are losses. */
export type RenderSeverity = "info" | "warn" | "error";

/** Which rendering tier a diagram took. */
export type RenderTier = "native" | "fallback";

/** A structured pipeline diagnostic. */
export interface RenderDiagnostic {
  /** Stable machine code, e.g. `fallback-tier`, `capability-unavailable`. */
  code: string;
  severity: RenderSeverity;
  /** The tier this event relates to, when applicable. */
  tier?: RenderTier;
  /** A short machine-ish reason (e.g. the detected diagram type). */
  reason?: string;
  /** The capability that was missing/degraded, e.g. `ascii`, `png`, `native`. */
  capability?: string;
  /** Human-readable one-liner. */
  message: string;
}

/**
 * A collector threaded through parse → route → render → CLI. Callers push
 * diagnostics as they happen; the CLI (or any sink) drains {@link all}.
 */
export class Diagnostics {
  private readonly items: RenderDiagnostic[] = [];

  /** Record a diagnostic and return it. */
  emit(d: RenderDiagnostic): RenderDiagnostic {
    this.items.push(d);
    return d;
  }

  /** A diagram took the mermaid.js fallback tier. Info-level (expected, not a loss). */
  fallbackTier(detectedType: string, message?: string): RenderDiagnostic {
    return this.emit({
      code: "fallback-tier",
      severity: "info",
      tier: "fallback",
      reason: detectedType,
      message:
        message ??
        `'${detectedType}' rendered via the mermaid.js fallback engine (no native renderer)`,
    });
  }

  /** A requested capability isn't available for this tier (e.g. ASCII for a pie). */
  capabilityUnavailable(
    capability: string,
    tier: RenderTier,
    message: string,
  ): RenderDiagnostic {
    return this.emit({
      code: "capability-unavailable",
      severity: "warn",
      tier,
      capability,
      message,
    });
  }

  /** An output degraded (e.g. mermaid geometry is unreliable under jsdom). */
  degraded(capability: string, reason: string, message: string): RenderDiagnostic {
    return this.emit({
      code: "render-degraded",
      severity: "warn",
      tier: "fallback",
      capability,
      reason,
      message,
    });
  }

  /**
   * The fallback engine produced a **degenerate/blank** artifact headless — a
   * zero/negative-width viewBox, negative-dimension rects, or empty content — so
   * there is no usable output at all (D9-A: honest failure, not a broken SVG
   * baked to disk). error-level; the CLI exits non-zero and writes nothing. The
   * diagram renders correctly in a real browser / the library.
   */
  fallbackUnavailable(reason: string, message: string): RenderDiagnostic {
    return this.emit({
      code: "fallback-render-unavailable",
      severity: "error",
      tier: "fallback",
      reason,
      message,
    });
  }

  /**
   * A theme token failed the style allowlist and was dropped/replaced before
   * reaching mermaid's `themeVariables` (FR5/FR7). warn-level: the render still
   * succeeds, but the requested styling was not applied verbatim.
   */
  unsafeThemeValue(token: string, message: string): RenderDiagnostic {
    return this.emit({
      code: "unsafe-theme-value",
      severity: "warn",
      capability: "theme",
      reason: token,
      message,
    });
  }

  /** A tier could not produce any output at all (hard failure). */
  failed(reason: string, message: string): RenderDiagnostic {
    return this.emit({
      code: "render-failed",
      severity: "error",
      tier: "fallback",
      reason,
      message,
    });
  }

  /** All diagnostics, in emission order. */
  all(): readonly RenderDiagnostic[] {
    return this.items;
  }

  /** Is there at least one diagnostic at or above `warn`? (Drives `--strict`.) */
  hasLoss(): boolean {
    return this.items.some((d) => d.severity === "warn" || d.severity === "error");
  }

  /** Is there at least one `error`-level diagnostic? */
  hasError(): boolean {
    return this.items.some((d) => d.severity === "error");
  }
}

/**
 * Format a diagnostic for a machine-greppable log line: a stable
 * `code severity tier [capability=…] message` shape. The CLI prints these to
 * stderr so a fallback/degradation is always visible and easy to grep.
 */
export function formatRenderDiagnostic(d: RenderDiagnostic): string {
  const tier = d.tier ?? "-";
  const cap = d.capability ? ` capability=${d.capability}` : "";
  return `${d.code} ${d.severity} ${tier}${cap} ${d.message}`;
}
