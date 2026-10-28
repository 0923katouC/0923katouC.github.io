import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { VERSION, PROBLEMS, MATERIALS, MECHANISMS, normalizeOptions, cleanName, invent, renderBlueprint, escapeXML, shareURL, readShare, restoreFavorites, readArchive, favoriteKey } from '../projects/toys/odd-inventions/model.mjs';

test('invention generation and geometric blueprint are deterministic for 240 varied seeds', () => {
  const forms = new Set();
  const blueprints = new Set();
  const names = new Set();
  for (let seed = 1; seed <= 240; seed++) {
    const options = { seed, problem: PROBLEMS[seed % PROBLEMS.length].id, material: MATERIALS[seed % MATERIALS.length].id, level: seed % 5 + 1 };
    const inv = invent(options);
    assert.deepEqual(inv, invent(options));
    assert.equal(inv.options.seed, seed);
    assert.equal(inv.specs.length, 4);
    assert.equal(inv.steps.length, 3);
    assert.ok(inv.name.length > 2);
    for (const [key, value] of Object.entries(inv.shape)) assert.ok(Number.isFinite(value) && (key === 'phase' ? value >= 0 && value <= 360 : value > 0));
    const svg = renderBlueprint(inv);
    assert.equal(svg, renderBlueprint(invent(options)));
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /viewBox="0 0 920 1120"/);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined|<script|<foreignObject|javascript:/i);
    forms.add(inv.mechanism.form);
    blueprints.add(svg);
    names.add(inv.name);
  }
  assert.equal(forms.size, 8);
  assert.equal(blueprints.size, 240);
  assert.ok(names.size > 65, `${names.size} distinct invention names`);
  assert.ok(PROBLEMS.length + MATERIALS.length + MECHANISMS.length >= 30);
});

test('mechanism governs meaningful operational instructions as well as the figure', () => {
  const invs = Array.from({ length: 150 }, (_, i) => invent({ seed: i + 1 }));
  for (let form = 0; form < 8; form++) {
    const inv = invs.find(x => x.mechanism.form === form);
    assert.ok(inv);
    assert.match(inv.steps[1], [ /罐盖/, /铰链/, /天线/, /曲柄/, /灯芯/, /伞面/, /摆锤/, /吊舱/ ][form]);
  }
  const jars = invs.filter(x => x.mechanism.form === 0);
  assert.ok(new Set(jars.map(x => x.shape.rings)).size > 1);
  assert.notEqual(renderBlueprint(jars[0], true), renderBlueprint(jars[1], true));
});

test('normalization handles malformed options, boundary seeds, levels and names', () => {
  const fallback = normalizeOptions();
  for (const bad of [null, undefined, 2, 'oops', [], { seed: 'NaN', level: 99, problem: 'bad', material: '<script>' }]) {
    assert.deepEqual(normalizeOptions(bad), fallback);
  }
  assert.equal(normalizeOptions({ seed: 4294967295, level: 5 }).seed, 4294967295);
  for (const seed of [-1, 0, 4294967296, 1.2, Infinity]) assert.equal(normalizeOptions({ seed }).seed, 104729);
  assert.equal(cleanName('  晚\u0000霞\ufffe  '), '晚霞');
  assert.equal(cleanName('\ud800落日\udfff'), '落日');
  assert.equal(Array.from(cleanName('🪐'.repeat(40))).length, 28);
});

test('SVG escapes malicious custom names, preserving safe visible text', () => {
  assert.equal(escapeXML(`<>&"'`), '&lt;&gt;&amp;&quot;&apos;');
  for (const name of ['</text><script>alert(1)', '" onload="alert(1)', '<img src=x onerror=boom>', '甲&乙的"小发明"', "<svg/onload='x'>"]) {
    const inv = invent({ seed: 27, name });
    const svg = renderBlueprint(inv);
    assert.ok(svg.includes(escapeXML(inv.name)));
    assert.doesNotMatch(svg, /<script|<img|<svg\/onload|" onload="/i);
  }
});

test('share links reproduce every selection and clear unrelated query/hash', () => {
  for (const seed of [1, 7919, 4294967295]) {
    const options = normalizeOptions({ seed, problem: 'words', material: 'moon', level: 5, name: '甲&乙 / 晚霞? #🌙' });
    const url = new URL(shareURL('https://example.test/projects/toys/odd-inventions/?old=1#section', options));
    assert.equal(url.pathname, '/projects/toys/odd-inventions/');
    assert.equal(url.hash, '');
    assert.equal(url.searchParams.has('old'), false);
    const restored = readShare(url.searchParams);
    assert.deepEqual(restored, options);
    assert.deepEqual(invent(restored), invent(options));
  }
  assert.deepEqual(readShare('?s=bad&p=unknown&m=broken&a=7'), normalizeOptions());
});

test('favorite archive rejects invalid records, removes duplicates, and caps at 24', () => {
  const valid = { version: VERSION, options: normalizeOptions({ seed: 17, name: '<收藏>' }) };
  const invalid = [null, 'x', {}, { version: 1, options: null }, { version: 9, options: valid.options }, { version: 1, options: { ...valid.options, seed: '17' } }, { version: 1, options: { ...valid.options, problem: 'unknown' } }, { version: 1, options: { ...valid.options, level: 6 } }];
  assert.deepEqual(restoreFavorites([...invalid, valid, valid]), [valid]);
  const full = restoreFavorites(Array.from({ length: 50 }, (_, i) => ({ version: VERSION, options: normalizeOptions({ seed: i + 1 }) })));
  assert.equal(full.length, 24);
  assert.equal(new Set(full.map(item => favoriteKey(item.options))).size, 24);
  assert.deepEqual(restoreFavorites('not an array'), []);
});

test('damaged, empty, or obsolete localStorage data never breaks restoration', () => {
  for (const raw of [null, '', '{broken', 'null', '[]', '42', '{}', '{"version":99}']) {
    assert.deepEqual(readArchive(raw), { last: null, favorites: [] });
  }
  const last = normalizeOptions({ seed: 19, material: 'cloud' });
  const favorites = [{ version: VERSION, options: last }];
  assert.deepEqual(readArchive(JSON.stringify({ version: VERSION, last, favorites })), { last, favorites });
  assert.deepEqual(readArchive('{"version":1,"favorites":[{"version":1,"options":null}]}'), { last: null, favorites: [] });
});

test('static page exposes every app hook, a strict CSP, and external assets only', async () => {
  const dir = new URL('../projects/toys/odd-inventions/', import.meta.url);
  const html = await readFile(new URL('index.html', dir), 'utf8');
  const app = await readFile(new URL('app.mjs', dir), 'utf8');
  const css = await readFile(new URL('style.css', dir), 'utf8');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  for (const match of app.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.has(match[1]), `missing #${match[1]}`);
  assert.match(html, /script-src 'self'; style-src 'self'/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>|\bstyle=|\bonclick=/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(html, /href="\/projects\/toys\/"/);
});

test('inline blueprints keep IDs unique across the real HTML and explicit SVG instances', async () => {
  const html = await readFile(new URL('../projects/toys/odd-inventions/index.html', import.meta.url), 'utf8');
  const samples = Array.from({ length: 100 }, (_, i) => invent({ seed: i + 1 }));
  for (let form = 0; form < MECHANISMS.length; form++) {
    const invention = samples.find(item => item.mechanism.form === form);
    assert.ok(invention);
    const workbench = renderBlueprint(invention, true, 'workbench');
    const svgs = [
      workbench,
      renderBlueprint(invention, true, 'archive-preview'),
      renderBlueprint(invention, false, 'download'),
      renderBlueprint(invent({ ...invention.options, name: '<特殊 & 名称>' }), true, 'workbench'),
      renderBlueprint(invention, true, 'scope "<>&')
    ];
    assert.equal(workbench, renderBlueprint(invent(invention.options), true, 'workbench'));
    const mounted = html.replace(/(<div id="blueprint"[^>]*>)(<\/div>)/, (_, open, close) => open + svgs.join('') + close);
    assert.notEqual(mounted, html, 'real blueprint mount must be populated');
    const allIds = [...mounted.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(allIds).size, allIds.length, `duplicate document IDs in form ${form}`);
    assert.equal(allIds.filter(id => id === 'material').length, 1, 'the material select must be the only #material');
    for (const svg of svgs) {
      const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
      assert.equal(ids.length, 5, 'title, description, grid, hatching and material each need an ID');
      assert.ok(ids.every(id => /^cmc-odd-[a-z0-9-]+$/.test(id)), 'identifiers must stay in the safe SVG namespace');
      const paintReferences = [...svg.matchAll(/url\(#([^\)]+)\)/g)].map(match => match[1]);
      const labelReferences = svg.match(/aria-labelledby="([^"]+)"/)[1].split(' ');
      assert.ok(paintReferences.length >= 2, 'the page grid and geometric material must retain their pattern references');
      for (const ref of [...paintReferences, ...labelReferences]) {
        assert.ok(ids.includes(ref), `reference ${ref} must resolve inside its own SVG`);
      }
    }
  }
});
