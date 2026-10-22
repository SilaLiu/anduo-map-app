import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const { resourcePath } = createRequire(import.meta.url)('../../desktop/paths.cjs');
const root = path.resolve('web-dist');
describe('desktop application resources', () => {
  it('serves the entry point and Cesium/data resources from the same stable origin', () => {
    expect(resourcePath(root, 'anduo://app/')).toBe(path.join(root, 'index.html'));
    expect(resourcePath(root, 'anduo://app/cesium/Workers/test.js?v=1')).toBe(path.join(root, 'cesium/Workers/test.js'));
    expect(resourcePath(root, 'anduo://app/data/a%20b.json')).toBe(path.join(root, 'data/a b.json'));
  });
  it('rejects outside resources and traversal using encoded separators', () => {
    for (const url of ['file:///etc/passwd', 'anduo://other/index.html', 'anduo://app/..%2fsecret', 'anduo://app/%5c..%5csecret', 'anduo://app/%00']) {
      expect(() => resourcePath(root, url)).toThrow();
    }
  });
});