import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: ["verification/**", ".next/**", "node_modules/**"],
  },
  {
    rules: {
      // The protocol core must stay framework-free and must never reach upward into UI.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "next/*", "@/ui/*", "@/hooks/*"],
              message:
                "src/crypto, src/identity and src/technocore must stay framework-free. Move UI concerns into src/ui or src/hooks.",
            },
          ],
        },
      ],
      // Private key material must never reach a console.
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  {
    // The restriction above applies only to the protocol core; UI code needs React.
    files: ["src/ui/**", "src/hooks/**", "src/civilization-ui/**", "src/sonnet-ui/**", "src/observatory-ui/**", "app/**", "middleware.ts", "next.config.ts"],
    rules: { "no-restricted-imports": "off" },
  },
];
