// ═══════════════════════════════════════════
//  Application entry point — orchestrates modules
// ═══════════════════════════════════════════

import { state, subscribe, saveAnnotations, loadInitialData } from './state.js';
import { initMap, swLayer, map } from './map/map.js';
import { initAnnotationSource, updateAnnotations, initBoundarySources, updateBoundarySources, initExtractPreviewSource } from './map/sources.js';
import { addAnnotationLayers, ensureBoundaryLayers, bringAnnosToFront, updateBoundaryVisibilityFilters } from './map/layers.js';
import { addSandTableLayers, bringSandTableToFront } from './sandtable/sandtable-layers.js';
import { initDrawEvents } from './drawing/draw-events.js';
import { initDialogButtons, initAnnoClickHandlers } from './annotations/anno-dialogs.js';
import { initExportButton, initImportButton, initClearButton } from './annotations/anno-data.js';
import { renderTree, debouncedRenderTree } from './admin/admin-tree.js';
import { updateBoundaryOptions, updateBoundaryStatus } from './admin/admin-boundaries.js';
import { loadTownCenters, computeSharedTownPolygons, assignAdminByGeometry } from './admin/admin-geometry.js';
import { initExtractDialog } from './extraction/extract.js';
import { initExtractPreview } from './extraction/extract-preview.js';
import { initUIEvents, updateStatusBar, switchTab } from './ui/ui-events.js';
import { ensureAnduoDefaultBoundaries, focusAnduoCounty } from './admin/anduo-default.js';

async function init() {
  await loadInitialData();
  await loadTownCenters();

  if (state.boundaries.length) {
    computeSharedTownPolygons();
    state.annos = state.annos.map(assignAdminByGeometry);
    await saveAnnotations();
  }
  updateBoundaryOptions();
  updateBoundaryStatus();

  document.getElementById('loading').style.display = 'none';

  initMap();

  // Subscribe to state changes
  subscribe((key) => {
    if (key === 'annos') {
      updateAnnotations();
      renderTree(document.getElementById('search-input').value);
      updateBoundaryOptions();
    }
    if (key === 'boundaries') {
      updateBoundarySources();
      updateBoundaryVisibilityFilters();
      updateBoundaryOptions();
      updateBoundaryStatus();
    }
  });

  map.on('load', () => {
    initAnnotationSource();
    addAnnotationLayers();
    initBoundarySources();
    ensureBoundaryLayers();
    ensureAnduoDefaultBoundaries().then(() => focusAnduoCounty());
    initExtractPreviewSource();
    addSandTableLayers().then(() => {
      bringSandTableToFront();
    });
    bringAnnosToFront();

    initDrawEvents();
    initDialogButtons();
    initAnnoClickHandlers();
    initExportButton();
    initImportButton();
    initClearButton();
    initExtractDialog();
    initExtractPreview();
    initUIEvents();

    document.getElementById('l-sat').classList.add('on');
    document.getElementById('l-sat').onclick = () => swLayer('satellite');
    document.getElementById('l-tianditu').onclick = () => swLayer('tianditu');
    document.getElementById('l-street').onclick = () => swLayer('street');

    document.getElementById('search-input').addEventListener('input', () => {
      debouncedRenderTree(document.getElementById('search-input').value);
    });

    map.on('zoom', updateStatusBar);
    updateStatusBar();
    renderTree();
    switchTab('fav');
  });
}

document.addEventListener('DOMContentLoaded', () => init().catch(console.error));
