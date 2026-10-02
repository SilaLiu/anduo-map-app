import { createStore, get, set } from 'idb-keyval';
import type { Workspace } from '../types';
import type { Feature } from 'geojson';
import { parseFeatures, toAnnotation } from '../domain/geo';
import { repairBoundaries, type BoundaryRepair } from '../domain/boundaryRepairs';

const database = createStore('anduo-sandtable', 'workspace');
let queue: Promise<void> = Promise.resolve();
let repairsPromise: Promise<{ repairs: BoundaryRepair[] }> | null = null;

export async function repairStoredBoundaries(features: Feature[]) {
  if (!repairsPromise) {
    repairsPromise = dataJson<{ repairs: BoundaryRepair[] }>('anduo-boundary-repairs.json').catch(
      (error) => {
        repairsPromise = null;
        throw error;
      },
    );
  }
  return repairBoundaries(features, (await repairsPromise).repairs);
}
export async function loadWorkspace(): Promise<
  (Workspace & { boundariesRepaired?: number }) | null
> {
  const saved = await get<Workspace>('v2', database);
  if (saved) {
    if (saved.version !== 2) throw new Error('无法读取此版本的工作区');
    const repaired = await repairStoredBoundaries(saved.boundaries);
    return {
      version: 2,
      annotations: parseFeatures(saved.annotations).map((f) => toAnnotation(f, true)),
      boundaries: parseFeatures(repaired.features),
      boundariesRepaired: repaired.repaired,
    };
  }
  const oldAnnotations = localStorage.getItem('anduo_annos');
  const oldBoundaries = localStorage.getItem('anduo_boundaries');
  if (!oldAnnotations && !oldBoundaries) return null;
  const migrated: Workspace = {
    version: 2,
    annotations: parseFeatures(JSON.parse(oldAnnotations || '[]')).map((f) =>
      toAnnotation(f, true),
    ),
    boundaries: parseFeatures(
      (await repairStoredBoundaries(JSON.parse(oldBoundaries || '[]'))).features,
    ),
  };
  await saveWorkspace(migrated);
  return migrated;
}

export function saveWorkspace(workspace: Workspace): Promise<void> {
  const snapshot = JSON.parse(JSON.stringify(workspace)) as Workspace;
  queue = queue.catch(() => {}).then(() => set('v2', snapshot, database));
  return queue;
}

export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function dataJson<T>(path: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${path}`);
  if (!response.ok) throw new Error(`${path} 加载失败 (${response.status})`);
  return response.json() as Promise<T>;
}
