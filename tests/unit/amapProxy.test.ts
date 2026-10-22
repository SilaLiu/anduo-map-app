import { describe, expect, it, vi, afterEach } from 'vitest';
import { amapTarget, proxyAMap } from '../../server/amap-proxy.mjs';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('高德 JS API 安全代理', () => {
  it('固定上游并覆盖客户端伪造的 jscode', () => {
    const url = amapTarget(
      '/_AMapService/v3/config/district?key=browser&jscode=forged',
      'server-secret',
    );
    expect(url.origin).toBe('https://restapi.amap.com');
    expect(url.pathname).toBe('/v3/config/district');
    expect(url.searchParams.getAll('jscode')).toEqual(['server-secret']);
    expect(url.searchParams.get('key')).toBe('browser');
    expect(amapTarget('/_AMapService/v4/map/styles?key=k', 's').origin).toBe(
      'https://webapi.amap.com',
    );
  });
  it('拒绝路径穿越和任意上游地址', () => {
    for (const path of [
      '/other',
      '/_AMapService/../private',
      '/_AMapService/https://evil.test',
      '/_AMapService/%2e%2e/private',
      '/_AMapService/',
      '/_AMapService//evil',
    ])
      expect(() => amapTarget(path, 'secret')).toThrow();
  });
  it('缺失配置时不给出密钥或请求上游', async () => {
    vi.stubEnv('AMAP_SECURITY_JSCODE', '');
    const res = { writeHead: vi.fn(), end: vi.fn() };
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await proxyAMap({ method: 'GET', url: '/_AMapService/v3/test' }, res);
    expect(res.writeHead.mock.calls[0][0]).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('透传正文但拦截可能泄漏安全密钥的异常', async () => {
    vi.stubEnv('AMAP_SECURITY_JSCODE', 'server-secret');
    const fetcher = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      text: async () => '{"status":"1"}',
    });
    vi.stubGlobal('fetch', fetcher);
    const res = { writeHead: vi.fn(), end: vi.fn() };
    await proxyAMap({ method: 'GET', url: '/_AMapService/v3/test?key=k' }, res);
    expect(res.end).toHaveBeenLastCalledWith('{"status":"1"}');
    fetcher.mockResolvedValue({ text: async () => 'echo server-secret' });
    await proxyAMap({ method: 'GET', url: '/_AMapService/v3/test' }, res);
    expect(res.writeHead.mock.calls.at(-1)?.[0]).toBe(502);
    expect(res.end.mock.calls.at(-1)?.[0]).not.toContain('server-secret');
  });
});
