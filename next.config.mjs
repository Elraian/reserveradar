/** @type {import('next').NextConfig} */
const nextConfig = {
  // The backend scripts in /scripts are plain ESM (.mjs) imported by route
  // handlers. They run on the Node.js runtime (WFS/RT fetch + @google/genai),
  // never Edge. transpilePackages isn't needed — they're local files.
  outputFileTracingIncludes: {
    "/api/**": ["./scripts/**/*"],
  },
};

export default nextConfig;
