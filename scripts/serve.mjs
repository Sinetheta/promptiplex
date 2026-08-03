import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * Starts the Next server for `npm run dev` and `npm start`.
 *
 * Two things this exists to do, neither of which the plain `next` command can:
 *
 * 1. **Read `PORT` from `.env`.** Next reads `PORT` while parsing its arguments,
 *    before it loads any env file, so an entry there would otherwise be ignored.
 *    Loading it here — before Next starts — makes it real environment by the
 *    time Next looks. The shell still wins, because `loadEnvFile` does not
 *    overwrite a variable that is already set.
 *
 * 2. **Keep `-H 127.0.0.1` in one place.** The hostname is deliberately not
 *    configurable: which port the server answers on is a convenience, which
 *    interface it answers on is the only thing keeping an unauthenticated,
 *    key-spending endpoint off the local network. See README, "Running it
 *    safely".
 *
 * Plain JavaScript rather than the `.mts` the other scripts use: Next re-spawns
 * its own worker through `NODE_OPTIONS`, which rejects the loader flags that
 * running TypeScript here would require.
 */

if (existsSync(".env")) process.loadEnvFile(".env");

const command = process.argv[2] === "start" ? "start" : "dev";

const child = spawn(
  process.execPath,
  ["./node_modules/next/dist/bin/next", command, "-H", "127.0.0.1"],
  { stdio: "inherit" },
);

// Ctrl-C reaches the child through the shared terminal; this is here so the
// wrapper reports what actually happened rather than always exiting 0.
child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
