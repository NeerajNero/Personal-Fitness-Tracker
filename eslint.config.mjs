import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Multi-user guard: app code reaches the database only through `forUser(userId)` (src/lib/db/scope.ts),
  // so a query on a per-person table can't be written without a user id. Exceptions: the scope itself,
  // src/lib/users.ts (sign-in and cross-user lookups) and the db module.
  {
    files: ["src/**/*.{ts,tsx}", "auth.ts"],
    ignores: ["src/db/**", "src/lib/db/**", "src/lib/users.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@/db", message: "Query through forUser(userId) from @/lib/db/scope." }],
          patterns: [{ group: ["**/src/db", "**/src/db/index", "../db", "../../db", "./db"], message: "Query through forUser(userId) from @/lib/db/scope." }],
        },
      ],
    },
  },
]);

export default eslintConfig;
