/* Rigid transforms and an invisible, unbounded adjacency lattice.
 * Lengths are normalized by the unmodified source's nominal side length.
 * No target polygon, target silhouette or cell is rendered by the game.
 */
(function (root) {
  'use strict';
  const mod = (n, m) => ((n % m) + m) % m;
  const key = (c, r) => `${c},${r}`;
  const neighbours = (c, r) => [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]];

  function site(stage, c, row) {
    if (stage === 0) return { x: c, y: row, r: 0, f: false, c, row };
    if (stage === 1) {
      return {
        x: c + row * (0.13705 / 69.68006),
        y: c * (0.14145 / 69.68006) + row * (69.84974 / 69.68006),
        r: mod(row, 2) * 180, f: false, c, row,
      };
    }
    // Successive columns reverse the vertical boundary profile. Express that
    // reflection using the UI's left/right reflection and a half-turn.
    return {
      x: c, y: row * (69.84974 / 69.68006),
      r: mod(row + c, 2) * 180, f: mod(c, 2) === 1, c, row,
    };
  }

  function apply(p, t) {
    let x = t.f ? -p[0] : p[0], y = p[1];
    if (mod(t.r, 360) === 180) { x = -x; y = -y; }
    return [x + t.x, y + t.y];
  }

  function inverse(p, t) {
    let x = p[0] - t.x, y = p[1] - t.y;
    if (mod(t.r, 360) === 180) { x = -x; y = -y; }
    return [t.f ? -x : x, y];
  }

  function matrix(t) {
    const sign = mod(t.r, 360) === 180 ? -1 : 1;
    return `${sign * (t.f ? -1 : 1)} 0 0 ${sign} ${t.x} ${t.y}`;
  }

  function inside(p, polygon) {
    let yes = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) &&
          p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
    }
    return yes;
  }

  function edgeDistance(p, polygon) {
    let min = Infinity;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const den = dx * dx + dy * dy;
      const t = den ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den)) : 0;
      min = Math.min(min, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
    }
    return min;
  }

  function bounds(points) {
    return {
      minX: Math.min(...points.map(p => p[0])), maxX: Math.max(...points.map(p => p[0])),
      minY: Math.min(...points.map(p => p[1])), maxY: Math.max(...points.map(p => p[1])),
    };
  }

  function prepare(polygon) {
    const probes = [], box = bounds(polygon);
    for (let y = box.minY + .04; y < box.maxY; y += .095) {
      for (let x = box.minX + .04; x < box.maxX; x += .095) {
        if (inside([x, y], polygon) && edgeDistance([x, y], polygon) > .025) probes.push([x, y]);
      }
    }
    return { polygon, probes, box };
  }

  function overlaps(shape, a, b) {
    const ab = bounds(shape.polygon.map(p => apply(p, a)));
    const bb = bounds(shape.polygon.map(p => apply(p, b)));
    if (ab.maxX < bb.minX || bb.maxX < ab.minX || ab.maxY < bb.minY || bb.maxY < ab.minY) return false;
    // About 0.33 source units: covers authored endpoint/edge discrepancies,
    // not a visible gap or a significant overlap. Never deform the artwork.
    const epsilon = .0047;
    for (const [from, to] of [[a, b], [b, a]]) {
      for (const p of [...shape.polygon, ...shape.probes]) {
        const q = inverse(apply(p, from), to);
        if (inside(q, shape.polygon) && edgeDistance(q, shape.polygon) > epsilon) return true;
      }
    }
    return false;
  }

  function connected(tiles) {
    const occupied = new Map(tiles.filter(t => t.slot).map(t => [key(t.c, t.row), t]));
    const found = new Set(), queue = [key(0, 0)];
    while (queue.length) {
      const k = queue.shift();
      if (found.has(k) || !occupied.has(k)) continue;
      found.add(k);
      const t = occupied.get(k);
      for (const [c, r] of neighbours(t.c, t.row)) queue.push(key(c, r));
    }
    return found;
  }

  function complete(stage, tiles) {
    const joined = connected(tiles);
    if (joined.size < 9) return false;
    const cluster = tiles.filter(t => t.slot && joined.has(key(t.c, t.row)));
    // A small two-dimensional patch is required, rather than a single row.
    const patch = cluster.some(t => [[1, 0], [0, 1], [1, 1]].every(([x, y]) => joined.has(key(t.c + x, t.row + y))));
    return patch && (stage !== 1 || cluster.some(t => t.r === 180)) && (stage !== 2 || cluster.some(t => t.f));
  }

  const api = { site, apply, inverse, matrix, inside, edgeDistance, bounds, prepare, overlaps, connected, complete, key, neighbours };
  if (typeof module !== 'undefined') module.exports = api;
  root.TilingGeometry = api;
})(typeof window === 'undefined' ? globalThis : window);
