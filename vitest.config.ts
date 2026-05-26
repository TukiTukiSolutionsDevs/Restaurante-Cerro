import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    exclude: ["**/node_modules/**", "**/tests/e2e/**"],
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/component/**/*.test.tsx",
      "tests/integration/**/*.spec.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/app/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
