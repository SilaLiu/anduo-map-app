import { describe, it, expect, vi } from 'vitest';
import { parsePoint, planRoute, toGcj, toWgs } from '../../server/routing.mjs';

describe('高德路线代理', () => {
  it('校验坐标，拒绝空值、越界及参数注入', () => {
    expect(parsePoint('91.68,32.26')).toEqual([91.68, 32.26]);
    for (const p of ['', 'NaN,32', '181,32', '91,90', '91,32&key=x'])
      expect(() => parsePoint(p)).toThrow();
  });
  it('安多坐标转换不是原样返回，往返误差小于一百万分之一度', () => {
    const p = [91.68, 32.26];
    const gcj = toGcj(p);
    expect(Math.abs(gcj[0] - p[0])).toBeGreaterThan(0.001);
    toWgs(gcj).forEach((v: number, i: number) => expect(v).toBeCloseTo(p[i], 6));
  });
  it('请求高德并将路线转回 WGS84，保留米和秒', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          status: '1',
          route: {
            paths: [
              {
                distance: '1200',
                duration: '180',
                steps: [{ polyline: '91.68,32.26;91.69,32.27' }],
              },
            ],
          },
        }),
      });
    const result = await planRoute([91.68, 32.26], [91.69, 32.27], 'test-key', fetcher);
    expect(result.distance).toBe(1200);
    expect(result.duration).toBe(180);
    expect(result.coordinates[0][0]).not.toBe(91.68);
    expect(fetcher.mock.calls[0][0].hostname).toBe('restapi.amap.com');
    expect(fetcher.mock.calls[0][0].searchParams.get('origin')).not.toBe('91.680000,32.260000');
  });
  it('返回配额错误，不生成直线路线', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ status: '0', infocode: '10003' }) });
    await expect(planRoute([91, 32], [92, 33], 'secret', fetcher)).rejects.toThrow('配额');
  });
  it('拒绝空路线及不完整返回', async () => {
    for (const paths of [[], [{ distance: 'bad', steps: [] }]]) {
      const fetcher = vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ status: '1', route: { paths } }) });
      await expect(planRoute([91, 32], [92, 33], 'secret', fetcher)).rejects.toThrow();
    }
  });
});
