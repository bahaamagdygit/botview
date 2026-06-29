import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['playwright'],
  // Pin the workspace root to this project so Next does not pick up an
  // unrelated package-lock.json found higher in the filesystem.
  outputFileTracingRoot: __dirname
};

export default nextConfig;
