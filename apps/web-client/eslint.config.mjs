import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * ESLint was listed in package.json and wired to a `lint` script, but no config
 * file existed anywhere in the repo, so `npm run lint` failed with "couldn't
 * find an eslint.config file" and the project had no lint gate at all.
 *
 * eslint-config-next 16 ships flat config from its subpath exports, so it is
 * spread in directly — no FlatCompat bridge needed (and it does not work here:
 * the eslintrc shim throws on a circular reference in the plugin object).
 */
export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "drizzle/**",
      "supabase/**",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Warnings, not errors: the codebase has existing instances of all three,
      // and promoting them to build failures today would block the deploy this
      // config exists to enable. Clear the backlog, then raise the severity.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "react-hooks/exhaustive-deps": "warn",

      /**
       * KNOWN DEBT — deliberately downgraded, not dismissed.
       *
       * The React Compiler rules below currently fire in six places that all
       * predate this config:
       *
       *   components/landing/hero.tsx:56,76      typewriter state
       *   components/navbar.tsx:88               scroll listener
       *   app/(dashboard)/profile/
       *     vibe-profiles-client.tsx:92          form hydration
       *   app/(dashboard)/on-board/client.tsx:94
       *   app/(dashboard)/analyze-profile/page.tsx:142
       *
       * They are real (each one costs extra renders), but none is a
       * correctness bug, and the hero case is inside an animation the product
       * owner has explicitly asked to preserve — refactoring it blind, with no
       * visual test to catch a regression, trades a small perf win for a risk
       * to the thing users notice most.
       *
       * Left as warnings so CI stays a meaningful gate on everything else
       * instead of being permanently red and therefore ignored. Fix these with
       * the app in front of you, then promote both rules back to "error".
       */
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/incompatible-library": "warn",
    },
  },
];
