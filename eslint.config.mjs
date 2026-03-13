// @ts-check
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

// ── Shared TypeScript rules ────────────────────────────────────────────────────
// @typescript-eslint/recommended is spread in, then we override specific rules.
// "no-explicit-any" is set to "warn" (not "error") to allow existing code to pass
// while flagging new violations in review.
const tsRulesBase = {
  ...tseslint.configs["recommended"].rules,
  ...tseslint.configs["strict"].rules,

  // Downgrade from error → warn for existing code that uses `any`
  "@typescript-eslint/no-explicit-any": "warn",

  // Allow unused vars prefixed with _ (common intentional pattern)
  "@typescript-eslint/no-unused-vars": [
    "error",
    { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
  ],

  // Allow empty catch blocks — existing code uses catch {} intentionally
  "@typescript-eslint/no-empty-function": "warn",
  "no-empty": ["warn", { allowEmptyCatch: true }],

  // Prefer unknown over any in catch — warn for existing code
  "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",

  // Allow non-null assertions (existing code uses these in dispatch logic)
  "@typescript-eslint/no-non-null-assertion": "warn",

  // Dynamic delete is used intentionally for Record cleanup in server.ts
  "@typescript-eslint/no-dynamic-delete": "warn",
};

export default [
  // ── Global ignores ──────────────────────────────────────────────────────────
  {
    ignores: [
      "node_modules/**",
      "dist-office/**",
      "office/node_modules/**",
      "*.config.cjs",       // ecosystem.config.cjs (CommonJS)
    ],
  },

  // ── Backend: src/ (Bun/TypeScript) ─────────────────────────────────────────
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        // Bun runtime globals
        Bun: "readonly",
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearInterval: "readonly",
        setInterval: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        crypto: "readonly",
        File: "readonly",
        FormData: "readonly",
        Response: "readonly",
        Request: "readonly",
        Buffer: "readonly",
        ArrayBuffer: "readonly",
        Promise: "readonly",
        Map: "readonly",
        Set: "readonly",
        Error: "readonly",
        JSON: "readonly",
        Math: "readonly",
        Date: "readonly",
        RegExp: "readonly",
        parseInt: "readonly",
        Array: "readonly",
        Object: "readonly",
        String: "readonly",
        Number: "readonly",
        Boolean: "readonly",
        Symbol: "readonly",
        Uint8Array: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tsRulesBase,
    },
  },

  // ── Frontend: office/src/ (React 19 + TypeScript) ──────────────────────────
  {
    files: ["office/src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        location: "readonly",
        history: "readonly",
        Event: "readonly",
        EventSource: "readonly",
        WebSocket: "readonly",
        CustomEvent: "readonly",
        HTMLElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLTextAreaElement: "readonly",
        HTMLCanvasElement: "readonly",
        HTMLSelectElement: "readonly",
        Element: "readonly",
        Node: "readonly",
        NodeList: "readonly",
        MutationObserver: "readonly",
        ResizeObserver: "readonly",
        IntersectionObserver: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        performance: "readonly",
        crypto: "readonly",
        Blob: "readonly",
        File: "readonly",
        FileReader: "readonly",
        FormData: "readonly",
        Response: "readonly",
        Request: "readonly",
        Headers: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        MediaQueryList: "readonly",
        MediaQueryListEvent: "readonly",
        React: "readonly",
        Map: "readonly",
        Set: "readonly",
        Error: "readonly",
        JSON: "readonly",
        Math: "readonly",
        Date: "readonly",
        RegExp: "readonly",
        Promise: "readonly",
        Array: "readonly",
        Object: "readonly",
        String: "readonly",
        Number: "readonly",
        Boolean: "readonly",
        Symbol: "readonly",
        parseInt: "readonly",
        parseFloat: "readonly",
        isNaN: "readonly",
        isFinite: "readonly",
        process: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    settings: {
      react: {
        version: "19",
      },
    },
    rules: {
      ...tsRulesBase,

      // React rules
      ...reactPlugin.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",   // not needed with React 17+ new JSX transform
      "react/prop-types": "off",            // we use TypeScript for prop types
      "react/display-name": "warn",

      // React hooks rules
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Unescaped entities in JSX are purely cosmetic — warn not error
      "react/no-unescaped-entities": "warn",
    },
  },
];
