/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/urunler/:path*', destination: 'https://trex-admin.onrender.com/giris', permanent: false },
      { source: '/sepet/:path*', destination: 'https://trex-admin.onrender.com/giris', permanent: false },
      { source: '/odeme/:path*', destination: 'https://trex-admin.onrender.com/giris', permanent: false },
      { source: '/hesabim/:path*', destination: 'https://trex-admin.onrender.com/giris', permanent: false },
      { source: '/bayilik/:path*', destination: 'https://trex-admin.onrender.com/giris', permanent: false },
      { source: '/club/:path*', destination: 'https://trex-admin.onrender.com/giris', permanent: false },
      { source: '/yasal/:path*', destination: 'https://trex-admin.onrender.com/giris', permanent: false },
    ];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      ],
    }];
  },
};

export default nextConfig;
