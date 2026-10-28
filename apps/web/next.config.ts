import type { NextConfig } from 'next';

import { playgroundConnectOrigins } from './src/lib/playground-origins';

const isProd = process.env.NODE_ENV === 'production';

/**
 * The Playground hosts are configurable (see src/lib/playground-origins.ts), so
 * the allow-list is derived from the same values the UI renders. Hard-coding
 * them meant an override of NEXT_PUBLIC_FLUXA_API_URL / NEXT_PUBLIC_CROWDPAY_API_URL
 * produced a base the browser was then blocked from calling.
 */
const connectSrc = [
  "'self'",
  'https://horizon-testnet.stellar.org',
  'https://horizon.stellar.org',
  'https://friendbot.stellar.org',
  ...playgroundConnectOrigins(),
  // Legacy CrowdPay alias that older deployments still point at.
  'https://api.crowdpay.io',
  'wss://*.stellar.org',
].join(' ');

const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: isProd ? 'max-age=63072000; includeSubDomains; preload' : 'max-age=0',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: [
      'accelerometer=()',
      // `self` so the offline QR handoff can scan frames with the camera
      // (Savitura/Savitools#344). Everything else stays disabled.
      'camera=(self)',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'payment=()',
      'usb=()',
      'interest-cohort=()',
    ].join(', '),
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src ${connectSrc}`,
      "frame-ancestors 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  transpilePackages: [],
  poweredByHeader: false,
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  turbopack: {},
};

export default nextConfig;
