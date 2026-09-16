const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const baseURL = process.env.TEST_URL || 'http://127.0.0.1:4173';
const order = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

async function point(page, selector, x = 0, y = 0) {
  return page.locator(selector).evaluate((el, { x, y }) => {
    const p = new DOMPoint(x, y).matrixTransform(el.getScreenCTM());
    return { x: p.x, y: p.y };
  }, { x, y });
}

async function drag(page, selector, pose, touch = false, drift = .09, cancel = false) {
  await page.locator('#supply').scrollIntoViewIfNeeded();
  const from = await point(page, selector);
  const to = await point(page, '#board', pose.x + drift, pose.y);
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
  }
}

async function site(page, stage, c, row) {
  return page.evaluate(({ stage, c, row }) => TilingGeometry.site(stage, c, row), { stage, c, row });
}

async function solve(page, s, touch) {
  await page.locator(`[data-stage="${s}"]`).click();
  let r = 0, f = false;
  for (const [i, [c, row]] of order.entries()) {
    const target = await site(page, s, c, row);
    if (touch) await page.locator('#supply').tap(); else await page.locator('#supply').click();
    if (r !== target.r) { await page.locator('#rotate').click(); r = target.r; }
    if (f !== target.f) { await page.locator('#flip').click(); f = target.f; }
    await drag(page, '#supply svg', target, touch);
    const count = await page.locator('#placed-count').textContent();
    if (count !== String(i + 2)) console.log('PLACEMENT FAILURE', s, target, await page.locator('#status').textContent(), await page.locator('#board .tile').evaluateAll(es => es.map(e => ({ id: e.dataset.id, x: e.dataset.x, y: e.dataset.y, slot: e.dataset.slot }))));
    assert.equal(count, String(i + 2), `stage ${s + 1}, tile ${i + 2}`);
    if (i < 7) assert.equal(await page.locator('#clear-dialog').isVisible(), false);
  }
  await page.locator('#clear-dialog').waitFor({ state: 'visible' });
  await page.screenshot({ path: `/tmp/tiling-v2-clear-${s}-${touch}.png`, fullPage: true });
  await page.locator('#review').click();
  await page.locator('#fit').click();
  await page.screenshot({ path: `/tmp/tiling-v2-solved-${s}-${touch}.png`, fullPage: true });
  if (!touch && s === 2) {
    await page.locator('#zoom-in').click(); await page.locator('#zoom-in').click();
    await page.locator('#board').screenshot({ path: '/tmp/tiling-v2-seams.png' });
    await page.locator('#fit').click();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1150 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(baseURL);
    await page.screenshot({ path: '/tmp/tiling-v2-initial.png', fullPage: true });
    assert.equal(await page.locator('#board .tile').count(), 1);
    assert.equal(await page.locator('#board .cell, #board .hint-shape, #board .preview').count(), 0);
    assert.equal(await page.locator('#hint').count(), 0);
    assert.equal(await page.locator('#rotate').isDisabled(), true);
    assert.equal(await page.locator('#flip').isDisabled(), true);

    // Exact source strings, including the authored transforms, are preserved.
    const sources = await page.evaluate(() => TilingSources);
    for (let s = 0; s < 3; s++) {
      const original = fs.readFileSync(path.join(__dirname, '..', sources[s].file), 'utf8');
      const hash = require('node:crypto').createHash('sha256').update(original).digest('hex');
      assert.equal(hash, sources[s].sha256);
      await page.locator(`[data-stage="${s}"]`).click();
      for (const contour of sources[s].paths) {
        assert.ok(original.includes(contour.d));
        assert.equal(await page.locator(`#board [data-source-id="${contour.id}"]`).getAttribute('d'), contour.d);
        assert.equal(await page.locator(`#board [data-source-id="${contour.id}"]`).getAttribute('transform'), `matrix(${contour.matrix.join(' ')})`);
      }
    }
    console.log('PASS: original file hashes, path data, and transforms; only one seed, no target underlay');

    // Validate geometric seams from actual SVG fills, independently of the slot matcher.
    const geometry = await page.evaluate(() => {
      const G = TilingGeometry;
      function polygon(asset) {
        const points = [];
        for (const s of asset.contour) {
          const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const args = s.kind === 'A' ? [...s.arc, ...s.end] : s.kind === 'C' ? [...s.controls.flat(), ...s.end] : s.end;
          p.setAttribute('d', `M${s.start.join(' ')} ${s.kind}${args.join(' ')}`);
          const len = p.getTotalLength(), count = s.kind === 'L' ? 1 : 96;
          for (let j = 0; j <= count; j++) { const q = p.getPointAtLength(len * j / count); points.push([(q.x - asset.center[0]) / asset.unit, (q.y - asset.center[1]) / asset.unit]); }
        }
        return points;
      }
      return TilingSources.map((asset, s) => {
        const poly = polygon(asset), shape = G.prepare(poly);
        const ts = [];
        for (let row = -1; row <= 1; row++) for (let c = -1; c <= 1; c++) ts.push({ ...G.site(s, c, row), id: ts.length, slot: G.key(c, row) });
        const collisions = [];
        for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) if (G.overlaps(shape, ts[i], ts[j])) collisions.push([ts[i].slot, ts[j].slot]);
        // Raster-sample the central core rectangle. All gaps must be within
        // the allowed source drafting error from a true authored boundary.
        let maxGap = 0, holes = 0;
        const polygons = ts.map(t => poly.map(p => G.apply(p, t)));
        for (let y = -.95; y <= .95; y += .017) for (let x = -.95; x <= .95; x += .017) {
          const p = [x, y];
          if (!polygons.some(q => G.inside(p, q))) {
            const d = Math.min(...polygons.map(q => G.edgeDistance(p, q))) * asset.unit;
            maxGap = Math.max(maxGap, d); if (d > .33) holes++;
          }
        }
        const noRotation = ts.map(t => ({ ...t, r: 0 }));
        const noMirror = ts.map(t => ({ ...t, f: false }));
        function badCount(list) { let n = 0; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (G.overlaps(shape, list[i], list[j])) n++; return n; }
        return { stage: s + 1, collisions, maxGap, holes, noRotationOverlaps: badCount(noRotation), noMirrorOverlaps: badCount(noMirror), complete: G.complete(s, ts) };
      });
    });
    console.log('GEOMETRY', JSON.stringify(geometry));
    for (const result of geometry) { assert.deepEqual(result.collisions, []); assert.equal(result.holes, 0); assert.equal(result.complete, true); }
    assert.ok(geometry[1].noRotationOverlaps > 0);
    assert.ok(geometry[2].noMirrorOverlaps > 0);
    console.log('PASS: 3x3 continuous coverage within drafting tolerance; wrong rotations/reflections geometrically overlap');

    await page.locator('[data-stage="0"]').click();
    await drag(page, '#supply svg', { x: 0, y: 0 });
    assert.equal(await page.locator('#board .tile').count(), 1, 'reject real overlap');
    await drag(page, '#supply svg', { x: 1.65, y: 1.6 }, false, 0);
    assert.equal(await page.locator('#board .tile').count(), 2, 'free placement');
    assert.equal(await page.locator('#placed-count').textContent(), '1', 'loose tile excluded');
    await drag(page, '[data-id="1"]', { x: 1, y: 0 });
    assert.equal(await page.locator('#placed-count').textContent(), '2');
    await drag(page, '#supply svg', { x: -1, y: 0 }, false, .4);
    assert.equal(await page.locator('#placed-count').textContent(), '2', 'distant tile must not snap');
    await page.locator('#reset').click();
    await drag(page, '#supply svg', { x: 1, y: 0 }, false, .09, true);
    assert.equal(await page.locator('#board .tile').count(), 1);
    console.log('PASS: collision rejection, free placement, reconnecting a loose tile, bounded snap distance, cancel');

    for (let s = 0; s < 3; s++) await solve(page, s, false);
    console.log('PASS: all three stages cleared through mouse input');
    // Keep the source unlimited even after clear, then remove an extra tile.
    await page.locator('#supply').click();
    // Last source state for stage 3 is the (-1,-1) state: r=0, f=true.
    await page.locator('#flip').click();
    await page.locator('#zoom-out').click();
    await drag(page, '#supply svg', await site(page, 2, 2, 0));
    assert.equal(await page.locator('#board .tile').count(), 10);
    await page.locator('#remove').click();
    assert.equal(await page.locator('#board .tile').count(), 9);
    await page.locator('#reset').click();
    assert.equal(await page.locator('#board .tile').count(), 1);
    console.log('PASS: unlimited supply after clear, removal, reset');

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const mobile = await context.newPage(); mobile.on('pageerror', e => errors.push(e.message));
    await mobile.goto(baseURL);
    await solve(mobile, 2, true);
    await mobile.locator('#reset').tap();
    await drag(mobile, '#supply svg', { x: 0, y: 1 }, true, .09, true);
    assert.equal(await mobile.locator('.ghost').count(), 0);
    assert.equal(await mobile.locator('#board .tile').count(), 1);
    await mobile.locator('#supply').tap();
    const art = await mobile.locator('#supply svg').innerHTML();
    await mobile.locator('#flip').tap(); await mobile.locator('#flip').tap();
    assert.equal(await mobile.locator('#supply svg').innerHTML(), art);
    await mobile.locator('#rotate').tap(); await mobile.locator('#rotate').tap();
    assert.equal(await mobile.locator('#supply svg').innerHTML(), art);
    console.log('PASS: touch drag, rotation/reflection, complete stage 3, touch cancellation');
    for (const width of [320, 375, 390, 768, 1024]) {
      await mobile.setViewportSize({ width, height: 1024 });
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow ${width}`);
    }
    await mobile.setViewportSize({ width: 768, height: 1024 });
    await mobile.locator('[data-stage="0"]').tap();
    await drag(mobile, '#supply svg', { x: 1, y: 0 }, true);
    assert.equal(await mobile.locator('#placed-count').textContent(), '2');
    await mobile.screenshot({ path: '/tmp/tiling-v2-ipad.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: 320–1440px layouts, iPad-sized touch input, no JavaScript errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
