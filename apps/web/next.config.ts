import type { NextConfig } from "next";
import { resolve } from "node:path";

const config: NextConfig = {
  // Workspace packages ship TypeScript source; better-sqlite3 is a native module and must not be bundled.
  transpilePackages: ["@zc/asr", "@zc/core", "@zc/llm", "@zc/orchestrator", "@zc/wallet-api"],
  serverExternalPackages: ["better-sqlite3"],
  reactStrictMode: true,
  // `next build` also writes a self-contained server (.next/standalone) for the Docker image; tracing starts at the repo root.
  output: "standalone",
  outputFileTracingRoot: resolve(import.meta.dirname, "../.."),
  agentRules: false, // the repo-root AGENTS.md is the single source of rules
};
export default config;
