import { existsSync, statSync } from "node:fs";

const requiredFiles = ["dist/server/server.js"];
const requiredDirectories = ["dist/client"];

for (const file of requiredFiles) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    throw new Error(`Production build is missing required file: ${file}`);
  }
}

for (const directory of requiredDirectories) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`Production build is missing required directory: ${directory}`);
  }
}

console.log("Production bundle structure looks valid.");
