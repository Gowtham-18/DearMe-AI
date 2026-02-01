const path = require("path");

const isProd = process.env.NODE_ENV === "production";

const connectSources = ["'self'", "http://localhost:8000", "https://*.supabase.co", "wss://*.supabase.co"];
const nlpUrl = process.env.NEXT_PUBLIC_NLP_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (nlpUrl) {
  connectSources.push(nlpUrl);
}

if (supabaseUrl) {
  connectSources.push(supabaseUrl);
}

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${connectSources.join(" ")}`,
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@dearme/shared"],
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
