import { expect, it } from 'vitest';
import { Color, JulianDate, PolylineGraphics } from 'cesium';
import { navigationRouteStyle } from '../../src/web/domain/routeStyle';

it('renders a wide green outlined route above ordinary ground lines', () => {
  const line = new PolylineGraphics(navigationRouteStyle());
  const time = JulianDate.now();
  expect(line.clampToGround?.getValue(time)).toBe(true);
  expect(line.zIndex?.getValue(time)).toBe(10000);
  expect(line.width?.getValue(time)).toBe(10);
  const material = line.material?.getValue(time);
  expect(material.color).toEqual(Color.fromCssColorString('#26d36b'));
  expect(material.outlineColor).toEqual(Color.fromCssColorString('#087c42'));
  expect(material.outlineWidth).toBe(2);
});