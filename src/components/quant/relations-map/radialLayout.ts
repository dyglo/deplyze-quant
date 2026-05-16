/**
 * Radial focal-hub layout for Relations Map.
 *
 * Reinterprets the Bloomberg "Relationship Map" pattern: the focal
 * instrument sits at the centre, surrounded by labelled category panels
 * arranged around the circumference. Categories (Peers / Sector ETFs /
 * Benchmarks / Macro / Vol regime / Themes) are assigned fixed angular
 * sectors of the circle so the eye can immediately locate each family.
 *
 * Layout assigns absolute (x, y) coordinates on graphology nodes — the
 * sigma renderer reads them directly, no force simulation needed.
 *
 * Coordinate system: centred on (0, 0), focal at origin. Categories
 * occupy concentric rings at radii ~250..420 with within-category nodes
 * spread evenly along an angular wedge.
 */
import Graph from 'graphology';
import type { RelationsGraphSnapshot, RelationsNode } from '../../../lib/quant/relations/types';

export interface RadialCategory {
  id: string;
  label: string;
  /** Center angle (radians, 0 = right, π/2 = up). */
  angle: number;
  /** Half-width of the angular wedge. */
  spread: number;
  /** Ring radius for nodes in this category. */
  radius: number;
  /** Test whether a node belongs to this category. */
  match: (n: RelationsNode, focalId: string | null) => boolean;
}

/** Default category layout, Bloomberg-inspired but Deplyze-styled. */
export function defaultCategories(): RadialCategory[] {
  return [
    {
      id: 'benchmarks',
      label: 'Benchmarks',
      angle: -Math.PI / 2,   // top
      spread: Math.PI / 3,
      radius: 320,
      match: (n) => n.kind === 'benchmark' || n.kind === 'index',
    },
    {
      id: 'sector',
      label: 'Sector ETFs',
      angle: -Math.PI / 6,   // upper right
      spread: Math.PI / 6,
      radius: 300,
      match: (n) => n.kind === 'etf',
    },
    {
      id: 'peers',
      label: 'Peers',
      angle: Math.PI / 4,    // lower right
      spread: Math.PI / 3,
      radius: 360,
      match: (n, focal) => n.kind === 'company' && n.id !== focal,
    },
    {
      id: 'volatility',
      label: 'Volatility',
      angle: Math.PI / 2,    // bottom
      spread: Math.PI / 8,
      radius: 280,
      match: (n) => n.kind === 'vol-regime',
    },
    {
      id: 'macro',
      label: 'Macro',
      angle: (3 * Math.PI) / 4,  // lower left
      spread: Math.PI / 4,
      radius: 340,
      match: (n) => n.kind === 'currency' || n.kind === 'commodity' || n.kind === 'treasury' || n.kind === 'macro',
    },
    {
      id: 'themes',
      label: 'Themes & artifacts',
      angle: Math.PI,             // left
      spread: Math.PI / 5,
      radius: 320,
      match: (n) => n.kind === 'theme' || n.kind === 'artifact' || n.kind === 'news-cluster' || n.kind === 'earnings',
    },
  ];
}

export interface RadialAssignment {
  /** focal node id, if one was detected. */
  focalId: string | null;
  /** category id → ordered list of node ids in that category. */
  buckets: Record<string, string[]>;
  /** node ids that fell outside every category. */
  fallback: string[];
}

/**
 * Compute a radial layout for the snapshot and write x/y onto each
 * graphology node. Returns the bucket assignment so the overlay layer
 * can render the category labels at the right angles.
 *
 * Focal selection: explicit `focalId` argument > first 'company' node
 * connected to the most peers. The focal is placed at origin.
 */
export function applyRadialLayout(
  graph: Graph,
  snapshot: RelationsGraphSnapshot,
  opts: { focalId?: string; categories?: RadialCategory[] } = {},
): RadialAssignment {
  const categories = opts.categories ?? defaultCategories();
  const focalId = opts.focalId ?? inferFocal(snapshot);

  const buckets: Record<string, string[]> = Object.fromEntries(categories.map((c) => [c.id, [] as string[]]));
  const fallback: string[] = [];

  for (const n of snapshot.nodes) {
    if (n.id === focalId) continue;
    const cat = categories.find((c) => c.match(n, focalId));
    if (cat) buckets[cat.id].push(n.id);
    else fallback.push(n.id);
  }

  // Sort within each bucket: cluster-name then label so the result is
  // stable and visually grouped.
  for (const cat of categories) {
    const ids = buckets[cat.id];
    ids.sort((a, b) => byClusterLabel(snapshot, a, b));
  }

  // Place focal at origin.
  if (focalId && graph.hasNode(focalId)) {
    graph.setNodeAttribute(focalId, 'x', 0);
    graph.setNodeAttribute(focalId, 'y', 0);
  }

  // Place each category's nodes along its angular wedge.
  for (const cat of categories) {
    const ids = buckets[cat.id];
    if (ids.length === 0) continue;
    const start = cat.angle - cat.spread;
    const end = cat.angle + cat.spread;
    const step = ids.length === 1 ? 0 : (end - start) / (ids.length - 1);
    ids.forEach((id, idx) => {
      const theta = ids.length === 1 ? cat.angle : start + step * idx;
      if (!graph.hasNode(id)) return;
      // Slight radius jitter (deterministic) to soften perfectly-on-circle look.
      const r = cat.radius + (idx % 3) * 18 - 18;
      graph.setNodeAttribute(id, 'x', Math.cos(theta) * r);
      graph.setNodeAttribute(id, 'y', Math.sin(theta) * r);
    });
  }

  // Fallback ring (anything uncategorized).
  if (fallback.length > 0) {
    const r = 460;
    fallback.forEach((id, i) => {
      const theta = (i / fallback.length) * Math.PI * 2;
      if (!graph.hasNode(id)) return;
      graph.setNodeAttribute(id, 'x', Math.cos(theta) * r);
      graph.setNodeAttribute(id, 'y', Math.sin(theta) * r);
    });
  }

  return { focalId, buckets, fallback };
}

function inferFocal(snapshot: RelationsGraphSnapshot): string | null {
  // Highest-degree company node, falls back to first node.
  if (snapshot.nodes.length === 0) return null;
  const degree = new Map<string, number>();
  for (const e of snapshot.edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const companies = snapshot.nodes.filter((n) => n.kind === 'company');
  if (companies.length === 0) return snapshot.nodes[0]?.id ?? null;
  return companies.sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))[0].id;
}

function byClusterLabel(snapshot: RelationsGraphSnapshot, a: string, b: string): number {
  const na = snapshot.nodes.find((n) => n.id === a);
  const nb = snapshot.nodes.find((n) => n.id === b);
  const ca = na?.cluster ?? na?.sector ?? '';
  const cb = nb?.cluster ?? nb?.sector ?? '';
  if (ca !== cb) return ca.localeCompare(cb);
  return (na?.label ?? a).localeCompare(nb?.label ?? b);
}
