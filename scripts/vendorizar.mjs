import { copyFileSync, mkdirSync, existsSync } from "node:fs";

const origem = "node_modules/client-zip/index.js";
const destino = "src/vendor/client-zip.js";

if (!existsSync(origem)) {
  console.error(`[vendorizar] não achei ${origem}. Rode 'npm install' antes.`);
  process.exit(1);
}

mkdirSync("src/vendor", { recursive: true });
copyFileSync(origem, destino);
console.log(`[vendorizar] ${origem} -> ${destino}`);
