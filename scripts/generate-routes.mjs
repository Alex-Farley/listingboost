import { Generator, getConfig } from "@tanstack/router-generator";

const config = getConfig();
const generator = new Generator({ config, root: process.cwd() });
await generator.run();
