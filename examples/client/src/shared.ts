#!/usr/bin/env node

import path from "path";
import { fileURLToPath } from "url";

// ES Module equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const serverCwd = path.resolve(__dirname, "..", "..", "server");
export const clientCwd = path.resolve(__dirname, "..");

