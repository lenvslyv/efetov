import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Use the project's TypeScript compiler to load real TSX components in Node.
// This runner performs component/markup checks, not browser layout tests.
registerHooks({
  resolve(specifier, context, nextResolve) {
    let candidate;
    if (specifier.startsWith("@/")) candidate = new URL(`../src/${specifier.slice(2)}`, import.meta.url);
    else if (specifier.startsWith(".") && context.parentURL) candidate = new URL(specifier, context.parentURL);
    if (candidate?.protocol === "file:") {
      for (const suffix of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
        const url = new URL(candidate.href + suffix);
        if (/\.(tsx|ts)$/.test(url.pathname) && existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (/\.(tsx|ts)$/.test(new URL(url).pathname)) {
      const result = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        fileName: fileURLToPath(url),
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      });
      return { format: "module", source: result.outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
await import("../tests/ui-components.tsx");
