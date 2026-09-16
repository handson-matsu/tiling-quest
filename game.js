'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const G = window.TilingGeometry;
  const NS = 'http://www.w3.org/2000/svg';
  const stages = [
    {
      name: '平行移動', english: 'TRANSLATION', icon: '↗', title: 'そのまま、つながる。',
      description: 'とがった尾と、でこぼこの背中。\n向きを変えずに、となりへずらそう。',
      rotate: false, flip: false, note: '向きはそのまま。でこぼこを見てみよう。',
      clear: '同じ向きのまま、ずらすことで敷き詰められました。', term: 'これが平行移動です。',
      question: 'となりの生き物は、どちらへ、どれくらい動かしたもの？',
    },
    {
      name: '回転移動', english: 'ROTATION', icon: '↻', title: 'くるり、つながる。',
      description: 'まるい頭と、ぎざぎざの足。\n向きを回すと、何が変わる？',
      rotate: true, flip: false, note: '選んで180°回転。まるい境界にも注目。',
      clear: 'タイルの向きを回すことで、ぴったりつながりました。', term: '回転移動を使った敷き詰めです。',
      question: '上と下の仲間を見比べよう。顔は、どちらを向いている？',
    },
    {
      name: '鏡映', english: 'REFLECTION', icon: '⇄', title: 'ぱたん、つながる。',
      description: 'よく似ているのに、合わない形。\n鏡うつしの仲間をつくってみよう。',
      rotate: true, flip: true, note: '左右反転と180°回転を組み合わせよう。',
      clear: '鏡に映した形を使うことで、ぴったりつながりました。', term: '鏡映を使った敷き詰めです。',
      question: '鏡うつしにした顔と模様。回すだけの場合と、何が違う？',
    },
  ];
  const palette = [
    ['#85b9a0', '#42765e'], ['#edbe79', '#b78340'], ['#df9b8c', '#aa6455'],
    ['#92b8ca', '#577f94'], ['#b0bc83', '#788649'], ['#b7a6c5', '#826d96'],
    ['#7eb9b0', '#478b81'], ['#e4aa81', '#ac7349'], ['#c3a6a9', '#956f75'],
  ];
  let index = 0, stage, source, shape;
  let tiles = [], nextId = 1, selected = 'supply', supply = { r: 0, f: false };
  let gesture = null, cleared = false, clearTimer = null, joined = new Set();
  let camera = { x: -.22, y: 0, zoom: 1 }, scale = 100;
  let completeStages = new Set();
  try { completeStages = new Set(JSON.parse(localStorage.getItem('tiling-quest-svg-completed') || '[]')); } catch {}

  function el(tag, attributes = {}) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attributes)) e.setAttribute(k, v);
    return e;
  }

  function contourPoints(asset) {
    const points = [];
    for (const seg of asset.contour) {
      const args = seg.kind === 'A' ? [...seg.arc, ...seg.end] : seg.kind === 'C' ? [...seg.controls.flat(), ...seg.end] : seg.end;
      const p = el('path', { d: `M${seg.start.join(' ')} ${seg.kind}${args.join(' ')}` });
      const count = seg.kind === 'L' ? 1 : 96;
      const length = p.getTotalLength();
      for (let j = 0; j <= count; j++) {
        const q = p.getPointAtLength(length * j / count);
        const v = [(q.x - asset.center[0]) / asset.unit, (q.y - asset.center[1]) / asset.unit];
        if (!points.length || Math.hypot(v[0] - points.at(-1)[0], v[1] - points.at(-1)[1]) > 1e-7) points.push(v);
      }
    }
    return points;
  }
  const shapes = window.TilingSources.map(s => G.prepare(contourPoints(s)));

  function motif() {
    if (index === 0) return `
      <path d="M-.85 .01L-.51 -.11 -.59 .12Z" fill="var(--dark)" opacity=".7"/>
      <path d="M-.57 .17Q-.25 -.21 .16 .13Q-.1 .46 -.57 .17Z" fill="#fff4cf" opacity=".65"/>
      <path d="M-.5 .17Q-.25 .4 .07 .15M-.41 .15Q-.22 .28 -.08 .12" fill="none" stroke="var(--dark)" stroke-width=".033" stroke-linecap="round"/>
      <ellipse cx="-.23" cy="-.31" rx=".096" ry=".113" fill="#fffcef"/>
      <ellipse cx=".11" cy="-.31" rx=".106" ry=".12" fill="#fffcef"/>
      <circle cx="-.203" cy="-.3" r=".048" fill="#294d43"/><circle cx=".142" cy="-.301" r=".052" fill="#294d43"/>
      <circle cx=".16" cy="-.326" r=".015" fill="white"/>
      <path d="M.07 -.095q.11 .105 .2-.012" fill="none" stroke="#345649" stroke-width=".028" stroke-linecap="round"/>
      <ellipse cx=".285" cy="-.18" rx=".054" ry=".031" fill="#f6d29e"/>
      <path d="M-.12 .42l.05-.07 .05.07M.29 .35l.05-.07" fill="none" stroke="var(--dark)" stroke-width=".026"/>
      <circle cx="-.46" cy="-.045" r=".024" fill="#fff9df"/>`;
    return `
      <path d="M-.91 .015Q-.52 -.22 -.29 .15T.29 .49" fill="none" stroke="var(--dark)" stroke-width=".135" opacity=".62" stroke-linecap="round"/>
      <path d="M-.53 -.23l.07 .13 .095-.07M-.43 -.36l.08 .10 .09-.08" fill="none" stroke="#fff4d1" stroke-width=".041" stroke-linecap="round"/>
      <ellipse cx=".125" cy="-.51" rx=".078" ry=".096" fill="#fffcef"/>
      <ellipse cx=".343" cy="-.49" rx=".084" ry=".098" fill="#fffcef"/>
      <circle cx=".145" cy="-.502" r=".039" fill="#294d43"/><circle cx=".366" cy="-.484" r=".043" fill="#294d43"/>
      <circle cx=".38" cy="-.501" r=".013" fill="white"/>
      <path d="M.16 -.31q.075 .095 .17 .01" fill="none" stroke="#345649" stroke-width=".027" stroke-linecap="round"/>
      <ellipse cx=".37" cy="-.35" rx=".039" ry=".025" fill="#f5d7ac"/>
      <ellipse cx="-.14" cy=".21" rx=".15" ry=".18" fill="#fff4cf" opacity=".72" transform="rotate(-24 -.14 .21)"/>
      <circle cx="-.43" cy=".055" r=".039" fill="#fff5d9"/><circle cx="-.58" cy="-.015" r=".026" fill="#fff5d9"/>
      <path d="M.1 .54l.03-.075M.185 .575l.025-.075" fill="none" stroke="var(--dark)" stroke-width=".028" stroke-linecap="round"/>
      ${index === 2 ? '<path d="M-.025 -.19l.072 .04-.045 .07-.074-.038Z" fill="#f5da87"/><circle cx="-.3" cy=".26" r=".03" fill="var(--dark)"/>' : ''}`;
  }

  function art(id, clipId) {
    const color = palette[id % palette.length];
    const normalization = `scale(${1 / source.unit}) translate(${-source.center[0]} ${-source.center[1]})`;
    return `<g style="--dark:${color[1]}">
      <defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><path d="${source.fill}" transform="${normalization}"/></clipPath></defs>
      <g clip-path="url(#${clipId})"><rect x="-2" y="-2" width="4" height="4" fill="${color[0]}"/>${motif()}</g>
      <g transform="${normalization}" fill="none" stroke="${color[1]}" stroke-width=".7" stroke-linejoin="round" stroke-linecap="round" class="source-outline">
        ${source.paths.map(p => `<path data-source-id="${p.id}" d="${p.d}" transform="matrix(${p.matrix.join(' ')})"/>`).join('')}
      </g>
    </g>`;
  }

  function orientedBounds(t) {
    return G.bounds(shape.polygon.map(p => G.apply(p, { ...t, x: 0, y: 0 })));
  }

  function thumbnail(t, id, prefix) {
    const b = orientedBounds(t), pad = .06;
    return `<svg xmlns="${NS}" viewBox="${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + pad * 2} ${b.maxY - b.minY + pad * 2}" aria-hidden="true"><g transform="matrix(${G.matrix({ ...t, x: 0, y: 0 })})">${art(id, `${prefix}-${index}-${id}`)}</g></svg>`;
  }

  function updateCamera() {
    const rect = $('board').getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    scale = Math.min(rect.width / 4.15, rect.height / 4.15) * camera.zoom;
    const w = rect.width / scale, h = rect.height / scale;
    $('board').setAttribute('viewBox', `${camera.x - w / 2} ${camera.y - h / 2} ${w} ${h}`);
  }

  function renderNav() {
    document.querySelector('.stages').innerHTML = stages.map((s, i) => `
      <button class="stage-tab ${i === index ? 'active' : ''}" data-stage="${i}" aria-current="${i === index ? 'step' : 'false'}">
        <span class="stage-icon" aria-hidden="true">${s.icon}</span><span><small>STAGE 0${i + 1}</small><b>${s.name}</b></span><span class="tab-end">${completeStages.has(i) ? '✓' : '→'}</span>
      </button>`).join('');
  }

  function renderBoard() {
    joined = G.connected(tiles);
    $('board').innerHTML = tiles.filter(t => gesture?.moved !== true || t.id !== gesture.id).map(t => `
      <g class="tile ${t.id === 0 ? 'anchor' : ''} ${t.id === selected ? 'selected' : ''}" tabindex="0" role="button"
        aria-label="${t.id === 0 ? 'はじめのタイル、固定' : `タイル${t.id}、選んで移動`}" data-id="${t.id}"
        data-x="${t.x}" data-y="${t.y}" data-r="${t.r}" data-f="${t.f}" data-slot="${t.slot || ''}"
        data-connected="${Boolean(t.slot && joined.has(t.slot))}" transform="matrix(${G.matrix(t)})">
        ${art(t.id, `board-${index}-${t.id}`)}
        ${t.id === 0 ? '<text x="-.12" y=".015" class="anchor-mark">START</text>' : ''}
      </g>`).join('');
    updateCamera();
  }

  function renderTools() {
    $('placed-count').textContent = joined.size;
    $('progress-bar').style.width = `${Math.min(1, joined.size / 9) * 100}%`;
    $('supply').innerHTML = thumbnail(supply, nextId, 'supply');
    $('supply').classList.toggle('selected', selected === 'supply');
    const fixed = selected === 0 || selected === null;
    $('rotate').disabled = !stage.rotate || fixed;
    $('flip').disabled = !stage.flip || fixed;
    $('remove').disabled = typeof selected !== 'number' || selected === 0;
    $('selection-label').textContent = selected === 'supply' ? '新しいタイルを選択中' : selected === 0 ? 'はじめのタイルは固定です' : selected === null ? 'タイルを選んでみよう' : '置いたタイルを選択中';
    $('tool-note').textContent = stage.note;
  }

  function render() { renderBoard(); renderTools(); }
  function say(message) { $('status').textContent = message; }

  function start(i) {
    cancelGesture();
    clearTimeout(clearTimer);
    $('clear-dialog').close();
    index = i; stage = stages[i]; source = window.TilingSources[i]; shape = shapes[i];
    tiles = [{ ...G.site(i, 0, 0), id: 0, slot: '0,0' }];
    supply = { r: 0, f: false }; nextId = 1; selected = 'supply'; cleared = false;
    camera = { x: -.22, y: 0, zoom: 1 };
    $('stage-number').textContent = `STAGE 0${i + 1} / ${stage.english}`;
    $('stage-title').innerHTML = stage.title.replace('、', '、<br>');
    $('stage-description').textContent = stage.description;
    $('transforms').innerHTML = ['平行移動', '回転', '鏡映'].map((n, j) => `<span class="${j === 1 && !stage.rotate || j === 2 && !stage.flip ? 'off' : ''}">${n}</span>`).join('');
    $('board-label').textContent = 'はじめの1枚から、自由につなごう';
    $('celebration').innerHTML = '';
    say('下のタイルを取り出して、となりへ。');
    renderNav(); render();
  }

  function freeOfOverlap(t, ignore) {
    return !tiles.some(other => other.id !== ignore && G.overlaps(shape, t, other));
  }

  function snapCandidate(t, ignore, pointerType) {
    const others = tiles.filter(p => p.id !== ignore);
    const cluster = G.connected(others);
    const occupied = new Set(others.filter(p => p.slot).map(p => p.slot));
    const options = new Map();
    for (const p of others) {
      if (!cluster.has(p.slot)) continue;
      for (const [c, row] of G.neighbours(p.c, p.row)) {
        const slot = G.key(c, row);
        if (!occupied.has(slot)) options.set(slot, { ...G.site(index, c, row), slot });
      }
    }
    let best = null, distance = Math.min(.34, (pointerType === 'touch' ? 28 : 21) / scale);
    for (const candidate of options.values()) {
      if (candidate.r !== t.r || candidate.f !== t.f) continue;
      const d = Math.hypot(candidate.x - t.x, candidate.y - t.y);
      if (d <= distance && freeOfOverlap(candidate, ignore)) { best = candidate; distance = d; }
    }
    return best;
  }

  function local(x, y) {
    const p = new DOMPoint(x, y).matrixTransform($('board').getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  }

  function choose(id) {
    selected = id;
    render();
  }

  function pointerDown(e) {
    if (gesture || e.isPrimary === false || e.button > 0) return;
    const tile = e.target.closest('[data-id]');
    const fromSupply = e.currentTarget === $('supply');
    const id = fromSupply ? 'supply' : tile ? Number(tile.dataset.id) : null;
    if (id === 0) { choose(0); say('この1枚が出発点。新しいタイルをとなりにつなごう。'); return; }
    const t = id === 'supply' ? { ...supply, x: 0, y: 0 } : tiles.find(p => p.id === id);
    const p = local(e.clientX, e.clientY);
    let offset = { x: 0, y: 0 };
    if (fromSupply) {
      const q = new DOMPoint(e.clientX, e.clientY).matrixTransform($('supply').querySelector('svg').getScreenCTM().inverse());
      offset = { x: q.x, y: q.y };
    } else if (t) offset = { x: p.x - t.x, y: p.y - t.y };
    gesture = {
      id, t: t ? { ...t } : null, offset, pointerId: e.pointerId, pointerType: e.pointerType,
      startX: e.clientX, startY: e.clientY, startCamera: { ...camera }, moved: false, source: e.currentTarget,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (id !== null) { selected = id; renderTools(); }
    e.preventDefault();
  }

  function createGhost() {
    const ghost = document.createElement('div');
    ghost.className = 'ghost';
    ghost.innerHTML = thumbnail(gesture.t, gesture.id === 'supply' ? nextId : gesture.id, 'ghost');
    document.body.append(ghost);
    gesture.ghost = ghost;
    renderBoard();
  }

  function pointerMove(e) {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const d = gesture;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5) return;
    if (!d.moved) { d.moved = true; if (d.id !== null) createGhost(); }
    if (d.id === null) {
      camera.x = d.startCamera.x - (e.clientX - d.startX) / scale;
      camera.y = d.startCamera.y - (e.clientY - d.startY) / scale;
      updateCamera(); e.preventDefault(); return;
    }
    const p = local(e.clientX, e.clientY);
    d.pose = { ...d.t, x: p.x - d.offset.x, y: p.y - d.offset.y };
    d.candidate = snapCandidate(d.pose, d.id, d.pointerType);
    const box = orientedBounds(d.t), pad = .06;
    const ghost = d.ghost;
    ghost.style.left = `${e.clientX + (box.minX - pad - d.offset.x) * scale}px`;
    ghost.style.top = `${e.clientY + (box.minY - pad - d.offset.y) * scale}px`;
    ghost.style.width = `${(box.maxX - box.minX + pad * 2) * scale}px`;
    ghost.style.height = `${(box.maxY - box.minY + pad * 2) * scale}px`;
    ghost.firstElementChild.style.width = '100%'; ghost.firstElementChild.style.height = '100%';
    ghost.classList.toggle('ready', Boolean(d.candidate));
    if (d.candidate) say('ここで離すと、ぴたっ。');
    else say('でっぱりと、へこみを見比べよう。');
    e.preventDefault();
  }

  function cancelGesture() {
    if (!gesture) return;
    const d = gesture; gesture = null;
    d.ghost?.remove();
    if (d.source.hasPointerCapture(d.pointerId)) d.source.releasePointerCapture(d.pointerId);
  }

  function commit(t, id, pointerType) {
    const candidate = snapCandidate(t, id, pointerType);
    const pose = candidate ? { ...t, ...candidate } : { ...t, slot: null };
    if (!freeOfOverlap(pose, id)) {
      render(); say('少し重なっているよ。向きや場所を変えてみよう。'); return false;
    }
    let placed;
    if (id === 'supply') {
      placed = { ...pose, id: nextId++ };
      tiles.push(placed);
    } else {
      placed = tiles.find(p => p.id === id);
      Object.assign(placed, pose);
    }
    selected = placed.id;
    render();
    if (candidate) {
      $('board').querySelector(`[data-id="${placed.id}"]`)?.classList.add('snapped');
      say('ぴたっ！ 境界がつながった。');
    } else say('ここに置いておこう。選んで、また動かせるよ。');
    checkClear();
    return true;
  }

  function pointerUp(e) {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const d = gesture;
    cancelGesture();
    if (!d.moved) {
      if (d.id !== null) choose(d.id);
      else if (selected === 'supply') {
        const p = local(e.clientX, e.clientY);
        commit({ ...supply, ...p }, 'supply', e.pointerType);
      }
      return;
    }
    if (d.id === null) return;
    const rect = $('board').getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      render(); say('タイルをエリアの中で離してね。'); return;
    }
    commit(d.pose, d.id, d.pointerType);
  }

  function change(kind) {
    if (gesture || selected === null || selected === 0 || kind === 'rotate' && !stage.rotate || kind === 'flip' && !stage.flip) return;
    const t = selected === 'supply' ? supply : tiles.find(p => p.id === selected);
    if (!t) return;
    const next = { ...t };
    if (kind === 'rotate') next.r = (next.r + 180) % 360;
    else next.f = !next.f;
    if (selected === 'supply') {
      supply = next; renderTools();
      say(kind === 'rotate' ? 'くるり、180°。絵の向きも変わった。' : 'ぱたん、鏡うつし。左右が入れ替わった。');
    } else commit(next, selected, 'mouse');
  }

  function checkClear() {
    if (cleared) return;
    if (!G.complete(index, tiles)) {
      if (joined.size >= 9) say('たくさんつながった！ 上下にも広げて、小さな面をつくろう。');
      return;
    }
    cleared = true;
    completeStages.add(index);
    try { localStorage.setItem('tiling-quest-svg-completed', JSON.stringify([...completeStages])); } catch {}
    renderNav();
    $('board-label').textContent = 'つながる形、見つけた！';
    say('CLEAR! このまま、もっと広げてもいいよ。');
    $('celebration').innerHTML = Array.from({ length: 24 }, (_, i) => `<i class="confetti" style="background:${palette[i % palette.length][0]};--x:${Math.cos(i * 2.4) * 175}px;--y:${Math.sin(i * 2.4) * 165}px"></i>`).join('');
    $('clear-text').textContent = stage.clear;
    $('clear-term').textContent = stage.term;
    $('clear-question').textContent = stage.question;
    $('next-stage').textContent = index < 2 ? '次のステージへ →' : '最初のステージへ ↗';
    clearTimer = setTimeout(() => { cancelGesture(); render(); $('clear-dialog').showModal(); }, 600);
  }

  function fitAll() {
    if (gesture) return;
    const b = G.bounds(tiles.flatMap(t => shape.polygon.map(p => G.apply(p, t))));
    const rect = $('board').getBoundingClientRect();
    camera.x = (b.minX + b.maxX) / 2; camera.y = (b.minY + b.maxY) / 2;
    const desired = Math.min(rect.width / (b.maxX - b.minX + .65), rect.height / (b.maxY - b.minY + .8));
    camera.zoom = Math.min(1.8, desired / Math.min(rect.width / 4.15, rect.height / 4.15));
    updateCamera();
  }

  document.querySelector('.stages').addEventListener('click', e => {
    const button = e.target.closest('[data-stage]');
    if (button) start(Number(button.dataset.stage));
  });
  $('supply').addEventListener('pointerdown', pointerDown);
  $('board').addEventListener('pointerdown', pointerDown);
  window.addEventListener('pointermove', pointerMove, { passive: false });
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointercancel', () => { cancelGesture(); render(); say('移動を取り消しました。'); });
  for (const element of [$('board'), $('supply')]) {
    element.addEventListener('lostpointercapture', () => { if (gesture) { cancelGesture(); render(); } });
  }
  $('supply').addEventListener('click', e => { if (e.detail === 0) choose('supply'); });
  $('rotate').addEventListener('click', () => change('rotate'));
  $('flip').addEventListener('click', () => change('flip'));
  $('remove').addEventListener('click', () => {
    if (gesture || typeof selected !== 'number' || selected === 0) return;
    tiles = tiles.filter(t => t.id !== selected); selected = 'supply'; render();
    say('タイルを戻しました。別のつなげ方を試してみよう。');
  });
  $('reset').addEventListener('click', () => start(index));
  $('fit').addEventListener('click', fitAll);
  for (const [id, factor] of [['zoom-in', 1.2], ['zoom-out', 1 / 1.2]]) {
    $(id).addEventListener('click', () => {
      if (gesture) return;
      camera.zoom = Math.max(.3, Math.min(2.6, camera.zoom * factor)); updateCamera();
    });
  }
  $('review').addEventListener('click', () => $('clear-dialog').close());
  $('next-stage').addEventListener('click', () => start((index + 1) % 3));
  window.addEventListener('keydown', e => {
    if ($('clear-dialog').open) return;
    if (e.key === 'Escape' && gesture) { cancelGesture(); render(); }
    if (e.key.toLowerCase() === 'r') change('rotate');
    if (e.key.toLowerCase() === 'f') change('flip');
    const tile = e.target.closest?.('[data-id]');
    if (tile && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose(Number(tile.dataset.id)); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); $('remove').click(); }
  });
  window.addEventListener('blur', () => { if (gesture) { cancelGesture(); render(); } });
  new ResizeObserver(() => {
    if (gesture) { cancelGesture(); render(); }
    updateCamera();
  }).observe($('board'));
  start(0);
})();
