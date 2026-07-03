#!/usr/bin/env node
/**
 * `vnm` / `very-nice-mermaid` CLI entry (bin shim). Delegates to {@link run}
 * and maps its return value to the process exit code.
 */
import { run } from "./run.js";

run(process.argv)
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`fatal: ${(err as Error).message}\n`);
    process.exitCode = 1;
  });
