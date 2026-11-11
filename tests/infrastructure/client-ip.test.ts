import { describe, it, expect } from 'vitest';
import { pickClientIp } from '../../src/infrastructure/security/client-ip';

describe('H5: Client IP Resolution and Rate Limiting Scenarios', () => {
  it('Scenario 1 (Single Reverse Proxy / Nginx / cPanel, hops=1): picks the proxy-appended IP from the right and ignores spoofed entries', () => {
    const spoofedChain = '6.6.6.6, 203.0.113.9';
    expect(pickClientIp(spoofedChain, null, 1)).toBe('203.0.113.9');
  });

  it('Scenario 2 (Cloudflare + Nginx Proxy Chain, hops=2): correctly steps 2 hops from the right', () => {
    const chain = 'client.attacker.ip, 198.51.100.25, 10.0.0.1'; // client, CF, internal reverse proxy
    expect(pickClientIp(chain, null, 2)).toBe('198.51.100.25');
  });

  it('Scenario 3 (Directly exposed, hops=0): rejects forged X-Forwarded-For and uses direct real IP', () => {
    const forgedXff = '1.2.3.4, 5.6.7.8';
    const directSocketIp = '198.51.100.99';
    expect(pickClientIp(forgedXff, directSocketIp, 0)).toBe('198.51.100.99');
  });

  it('Scenario 3 isolation: two different clients in direct mode resolve to different IPs without sharing bucket', () => {
    const clientA = pickClientIp('forged-a', '192.168.1.10', 0);
    const clientB = pickClientIp('forged-b', '192.168.1.20', 0);

    expect(clientA).toBe('192.168.1.10');
    expect(clientB).toBe('192.168.1.20');
    expect(clientA).not.toBe(clientB);
    expect(clientA).not.toBe('unknown');
    expect(clientB).not.toBe('unknown');
  });

  it('never steps past the start of the chain if chain length is less than hops', () => {
    expect(pickClientIp('203.0.113.9', null, 3)).toBe('203.0.113.9');
  });

  it('falls back to realIp when no forwarded chain exists with hops > 0', () => {
    expect(pickClientIp(null, ' 198.51.100.4 ', 1)).toBe('198.51.100.4');
  });

  it('returns unknown safely when neither forwardedFor nor realIp is provided', () => {
    expect(pickClientIp(null, null, 1)).toBe('unknown');
    expect(pickClientIp(null, null, 0)).toBe('unknown');
  });
});
