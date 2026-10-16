const development = process.env.NODE_ENV === 'development';
const csp = [
  "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'none'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${development ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'", "img-src 'self' blob: data:", "font-src 'self'", "worker-src 'self'", `connect-src 'self'${development ? ' ws://127.0.0.1:*' : ''}`,
].join('; ');
const config = {
  devIndicators: false,
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ] }]; },
};
export default config;
