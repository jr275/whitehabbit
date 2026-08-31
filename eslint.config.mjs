import next from "eslint-config-next"
import tseslint from "typescript-eslint"

/* ================================================================== *
 * ESLint — closes audit item #10, which had been open since the
 * original repository audit ("no ESLint, no Prettier, no formatting
 * config anywhere").
 *
 * Scoped deliberately. The repository contains two products, and the
 * pre-existing one was written without a linter; turning a full rule
 * set on across ~90 of its components would produce hundreds of
 * findings that nobody asked for and that would bury real ones.
 *
 * So: a small set of genuinely load-bearing rules everywhere, and the
 * stricter type-aware rules only on Pocket2's own code, which was
 * written with them in mind. Widening later is a one-line change to
 * the `files` globs.
 * ================================================================== */

export default tseslint.config(
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "public/**", "migrations/**"],
  },

  ...next,

  {
    /* INHERITED CODE — the agent-factory product predates any linter.
     * Its components trip ~20 React 19 hook rules (setState in an
     * effect, refs read during render). Those are worth fixing, but by
     * that product's owner, in their own change: turning them into
     * blocking errors here would mean this security checkpoint
     * rewriting ~90 components nobody asked it to touch.
     *
     * They stay VISIBLE as warnings rather than being switched off, so
     * the debt is reported rather than hidden. Pocket2's own code is
     * held to errors below. */
    files: [
      "components/{character,factory,home,insights,integrations,library,observatory,outputs,products,studio,workforce}/**/*.tsx",
      "components/*.tsx",
      "app/{approvals,evolve,factory,insights,integrations,library,login,observatory,outcomes,outputs,products,signup,studio,workforce}/**/*.tsx",
      "lib/{agent,character,fabric-graph,insights,library,products,worker,workforce,workforce-demo}/**/*.{ts,tsx}",
      "lib/*.ts",
      "scripts/**/*.mjs",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/use-memo": "warn",
      "react/no-unescaped-entities": "warn",
      "prefer-const": "warn",
      "@typescript-eslint/no-misused-promises": "off",
    },
  },

  {
    // Repository-wide: the rules that catch real defects rather than
    // style preferences.
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "no-alert": "error",
      // `==` against null is the one useful loose comparison.
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
    },
  },

  {
    // Pocket2's own code, held to the stricter standard the product
    // brief asks for ("type-safe", "avoid any").
    files: ["lib/pocket2/**/*.ts", "app/pocket2/**/*.tsx", "app/api/pocket2/**/*.ts", "components/pocket2/**/*.tsx"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    extends: [tseslint.configs.recommendedTypeChecked],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // Interfaces here mirror database rows, so an empty one is a
      // real placeholder rather than a style choice.
      "@typescript-eslint/no-empty-object-type": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  {
    // The structured logger IS the console boundary.
    files: ["lib/observability/logger.ts"],
    rules: { "no-console": "off" },
  },

  {
    // Tests legitimately print diagnostics and assert on loose shapes.
    files: ["tests/**/*.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },
)
