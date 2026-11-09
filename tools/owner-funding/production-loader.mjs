import { registerHooks, stripTypeScriptTypes } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier.startsWith(".") &&
      context.parentURL?.startsWith("file:") &&
      !/\.[a-z0-9]+$/i.test(specifier)
    ) {
      const url = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(url)) return next(url.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith("file:") && url.endsWith(".ts")) {
      let source = readFileSync(fileURLToPath(url), "utf8");
      source = stripTypeScriptTypes(source, { mode: "transform" });
      source = source.replace(
        /import\s+(\w+)\s+from\s+(["'])([^"']+\.json)\2\s*;/g,
        'import $1 from $2$3$2 with {type:"json"};',
      );
      // Export the exact unchanged private production token-check body for this read-only inspection only.
      if (url.endsWith("/src/buy/preflight.ts"))
        source += "\nexport { token as productionTokenCheck };\n";
      return { format: "module", source, shortCircuit: true };
    }
    return next(url, context);
  },
});
