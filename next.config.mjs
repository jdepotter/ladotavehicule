/** @type {import('next').NextConfig} */
const nextConfig = {
  // No indexing — private app shared via URL only
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    },
  ],
};

export default nextConfig;
