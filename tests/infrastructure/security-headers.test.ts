import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

describe('Phase D: Security Headers & CSP Configuration (M12)', () => {
  it('configures security headers for all routes', async () => {
    expect(nextConfig.headers).toBeDefined();
    const headersConfig = await nextConfig.headers!();
    expect(headersConfig).toHaveLength(1);
    expect(headersConfig[0].source).toBe('/:path*');

    const headers = headersConfig[0].headers;
    const headerMap = new Map(headers.map((h) => [h.key, h.value]));

    expect(headerMap.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headerMap.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(headerMap.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headerMap.get('Permissions-Policy')).toContain('camera=()');
    expect(headerMap.get('Strict-Transport-Security')).toContain('max-age=');

    const csp = headerMap.get('Content-Security-Policy');
    expect(csp).toBeDefined();
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("script-src 'self'");
  });

  it('restricts next/image remotePatterns to prevent unauthorized image proxying', () => {
    const imagesConfig = nextConfig.images;
    expect(imagesConfig?.remotePatterns).toEqual([]);
  });

  it('disables the x-powered-by header in nextConfig', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
