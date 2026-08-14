/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Keep dashboard RSC payloads on the client so sidebar clicks swap instantly
  // instead of refetching and flashing a loading state.
  experimental: {
    staleTimes: {
      dynamic: 180,
      static: 300,
    },
  },
};

module.exports = nextConfig;
