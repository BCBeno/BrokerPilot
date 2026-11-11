// Pornește Next (dev/start) cu variabilele din `.env` de la rădăcina repo-ului.
// Next caută `.env` doar în apps/web, iar încărcarea din next.config.ts nu ajunge la workerii Turbopack;
// de aceea încărcăm fișierul aici și lăsăm procesul Next să moștenească mediul. Variabilele deja setate nu sunt suprascrise.
// Folosire (din apps/web): node ../../scripts/next-with-env.mjs dev
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
