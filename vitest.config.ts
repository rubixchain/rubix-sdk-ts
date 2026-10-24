import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "offline",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/live/**"],
        },
      },
      {
        test: {
          name: "live",
          include: ["tests/live/**/*.test.ts"],
          // Transactions on the Rubix node wait for consensus and can take minutes
          testTimeout: 600_000,
          hookTimeout: 600_000,
          // Live tests share one funded DID, so they must not run concurrently
          fileParallelism: false,
        },
      },
    ],
  },
});
