import { defineConfig } from "vitest/config";

// Testes de utilitários puros (utils/ e config/), sem Nuxt.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
  },
});
