/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  // The mail routes embed public/logo.png as a CID attachment, so the file has
  // to be inside the serverless bundle — static assets alone are not enough.
  outputFileTracingIncludes: {
    '/api/send-confirmation':         ['./public/logo.png'],
    '/api/deposit/send-confirmation': ['./public/logo.png'],
  },
  async headers() {
    return [
      {
        // Guest ordering pages — always serve fresh, never cache in browser/CDN
        source: '/order/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
          { key: 'Pragma',        value: 'no-cache' },
        ],
      },
    ]
  },
}

export default nextConfig
