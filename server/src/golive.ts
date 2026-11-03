/**
 * Free "go live": runs the server on this computer and opens a free
 * Cloudflare quick tunnel so the phone app can reach it from anywhere.
 *
 *   npm run live
 *
 * Creates .env with a random access token on first run.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Tunnel, bin, install } from "cloudflared";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");

if (!fs.existsSync(envPath)) {
  const example = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  const token = crypto.randomBytes(18).toString("base64url");
  fs.writeFileSync(envPath, example.replace(/^APP_TOKEN=.*$/m, `APP_TOKEN=${token}`));
  console.log("Created server/.env with a new access token.");
}
process.loadEnvFile(envPath);

if (!process.env.APP_TOKEN || process.env.APP_TOKEN.startsWith("change-me")) {
  console.error("Set APP_TOKEN in server/.env to a long random password first; the server will be public.");
  process.exit(1);
}

// Imported after .env is loaded so the config picks it up.
const { config, demoMode } = await import("./config.js");
await import("./index.js");

if (!fs.existsSync(bin)) {
  console.log("Downloading Cloudflare tunnel (first run only)…");
  await install(bin);
}

const tunnel = Tunnel.quick(`http://localhost:${config.port}`);

// cloudflared prints the public address in its log, e.g.
// "|  https://quiet-river-1234.trycloudflare.com  |". Error messages can mention
// api.trycloudflare.com, so only accept a generated subdomain.
const TUNNEL_URL = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/;
let announced = false;
const onOutput = (text: string) => {
  const match = TUNNEL_URL.exec(text);
  if (match && !announced) {
    announced = true;
    announce(match[0]);
  }
};
tunnel.on("stdout", onOutput);
tunnel.on("stderr", onOutput);

function announce(url: string) {
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  console.log(" CIRCLE is live. In the app, open Settings and enter:\n");
  console.log(`   Server address:  ${url}`);
  console.log(`   Access token:    ${config.appToken}\n`);
  console.log(
    demoMode()
      ? " Mode: DEMO (no API keys in server/.env, every meeting returns a sample)."
      : " Mode: LIVE (real transcription and reports).",
  );
  console.log(" Keep this window open and the computer awake. Ctrl+C to stop.");
  console.log(" The address changes each time you run this; re-enter it in the app.");
  console.log(`${line}\n`);
}

tunnel.on("error", (err: Error) => console.error("Tunnel error:", err.message));
tunnel.on("exit", (code) => {
  console.error(`Tunnel stopped (code ${code}). Run "npm run live" again.`);
  process.exit(1);
});

const stop = () => {
  tunnel.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
