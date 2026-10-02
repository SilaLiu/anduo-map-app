// Extraction engines are independent of the map renderer and desktop runtime.
export const state = { extractPolygon: [], extractionResults: [], signal: null };
export const extractionView = { zoom: 15 };
export const map = { getZoom: () => extractionView.zoom };
export const SRC = {
  satellite: {
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
  },
};
