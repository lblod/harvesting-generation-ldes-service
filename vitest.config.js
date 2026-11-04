import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    setupFiles: ["test/setup.js"],
    mockReset: true,
    env: {
      SHAPES_DIR: resolve("shapes"),
      BASE_URL: "http://example.org/ldes/",
    },
  },
});
