import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/**
 * Load environment variables from .env file relative to this file's location.
 * This ensures consistent behavior regardless of the current working directory.
 */
export function loadEnv() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const envPath = path.resolve(__dirname, "../../.env");
  dotenv.config({ path: envPath });
}
