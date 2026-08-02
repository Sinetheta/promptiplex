import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A lockfile in the parent directory makes Next infer the wrong workspace
  // root, so pin it here.
  turbopack: { root: path.resolve(".") },

  // better-sqlite3 is a native module; it must not be bundled into the server
  // build or the .node binding fails to resolve at runtime.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
