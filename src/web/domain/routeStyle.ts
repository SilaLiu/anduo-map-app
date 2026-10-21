import { Color, PolylineOutlineMaterialProperty } from 'cesium';

export function navigationRouteStyle() {
  return {
    width: 10,
    clampToGround: true,
    // Ground-polyline ordering is independent of asynchronous data-source load order.
    zIndex: 10000,
    material: new PolylineOutlineMaterialProperty({
      color: Color.fromCssColorString('#26d36b'),
      outlineColor: Color.fromCssColorString('#087c42'),
      outlineWidth: 2,
    }),
  };
}