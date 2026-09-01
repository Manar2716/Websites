/* Bundles the client into one self-contained HTML file.
 *
 *   node tools/bundle.mjs [out.html]
 *
 * The game normally ships as forty-odd ES modules served over HTTP, which
 * is the right way to develop it and the wrong way to hand it to somebody
 * on a phone. This inlines the whole module graph, the stylesheet and the
 * markup into a single file that plays offline against bots from anywhere
 * a file can be opened — no server, no network, no build tooling.
 *
 * It is a very small bundler, and it is small because the source only uses
 * four module forms (`export const/function/class`, `export { … }`, plain
 * and namespace imports). It asserts that rather than assuming it: if a
 * module uses something it cannot rewrite, it fails loudly instead of
 * emitting a file that is subtly wrong.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = path.join(ROOT, 'client/js/main.js');
const args = process.argv.slice(2).filter((a) => a !== '--artifact');
const ARTIFACT = process.argv.includes('--artifact');
const OUT = args[0] || path.join(ROOT, 'overclock-standalone.html');

const modules = new Map();          // id -> { code, deps }

function idFor(file) { return path.relative(ROOT, file).replace(/\\/g, '/'); }

function load(file) {
  const id = idFor(file);
  if (modules.has(id)) return id;
  modules.set(id, null);            // placeholder, so cycles terminate
  const src = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);
  const deps = [];
  let code = src;

  const resolve = (spec) => {
    const target = path.resolve(dir, spec);
    if (!fs.existsSync(target)) throw new Error(`${id}: cannot resolve ${spec}`);
    deps.push(target);
    return idFor(target);
  };

  // import * as ns from '…'
  code = code.replace(/^import\s+\*\s+as\s+([\w$]+)\s+from\s+['"]([^'"]+)['"];?$/gm,
    (_, ns, spec) => `const ${ns} = __req(${JSON.stringify(resolve(spec))});`);

  // import { a, b as c } from '…'   (single or multi-line)
  code = code.replace(/^import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?$/gm,
    (_, names, spec) => {
      const binding = names.split(',').map((n) => n.trim()).filter(Boolean)
        .map((n) => {
          const m = n.match(/^([\w$]+)\s+as\s+([\w$]+)$/);
          return m ? `${m[1]}: ${m[2]}` : n;
        }).join(', ');
      return `const { ${binding} } = __req(${JSON.stringify(resolve(spec))});`;
    });

  const exported = new Set();

  // export { A, B };
  code = code.replace(/^export\s*\{([^}]*)\}\s*;?$/gm, (_, names) => {
    for (const n of names.split(',').map((s) => s.trim()).filter(Boolean)) {
      const m = n.match(/^([\w$]+)\s+as\s+([\w$]+)$/);
      if (m) exported.add([m[2], m[1]]);
      else exported.add([n, n]);
    }
    return '';
  });

  // export const / function / class NAME
  code = code.replace(/^export\s+(const|let|function|class|async function)\s+([\w$]+)/gm,
    (_, kind, name) => { exported.add([name, name]); return `${kind} ${name}`; });

  const leftover = code.match(/^export\b.*/m);
  if (leftover) throw new Error(`${id}: unhandled export form -> ${leftover[0].trim()}`);
  const leftIn = code.match(/^import\b.*/m);
  if (leftIn) throw new Error(`${id}: unhandled import form -> ${leftIn[0].trim()}`);

  const assigns = [...exported].map(([as, local]) => `  __e[${JSON.stringify(as)}] = ${local};`).join('\n');

  modules.set(id, {
    code: `__mods[${JSON.stringify(id)}] = function (__e, __req) {\n${code}\n${assigns}\n};`,
  });
  for (const d of deps) load(d);
  return id;
}

load(ENTRY);

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'client/css/app.css'), 'utf8');

const runtime = `
/* A four-line module registry standing in for the browser's own loader.
   Modules are evaluated lazily on first require and cached, so evaluation
   order falls out of the dependency graph rather than the file order. */
const __mods = {};
const __cache = {};
function __req(id) {
  if (__cache[id]) return __cache[id];
  const e = {};
  __cache[id] = e;
  if (!__mods[id]) throw new Error('missing module ' + id);
  __mods[id](e, __req);
  return e;
}
/* Nothing to talk to but ourselves: the standalone build hosts its match
   in this tab rather than looking for a server that is not there. */
window.__OVERCLOCK_OFFLINE = true;
`;

const script = `<script type="module">\n${runtime}\n` +
  [...modules.values()].map((m) => m.code).join('\n\n') +
  `\n\n__req(${JSON.stringify(idFor(ENTRY))});\n</` + `script>`;

/* Every replacement below passes a *function*, not a string. A string
   replacement interprets $$, $&, $1 and friends, and the source contains
   `$$` (the query-all helper) and CSS with `$` in it — which silently
   turned `const $$ = …` into `const $ = …` and produced a bundle that
   failed to parse with a duplicate declaration. */
const body = html
  .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${css}\n</style>`)
  .replace(/<script type="module" src="[^"]*"><\/script>/, () => script)
  .replace(/<title>[^<]*<\/title>/, () => '<title>OVERCLOCK</title>');

/* Artifact mode emits the page contents only. The host supplies the
   doctype, html, head and body, so shipping our own would nest a second
   document inside the first. */
let out = body;
if (ARTIFACT) {
  const inner = body.slice(body.indexOf('<body>') + 6, body.lastIndexOf('</body>'));
  const style = body.slice(body.indexOf('<style>'), body.indexOf('</style>') + 8);
  out = `<title>OVERCLOCK</title>\n${style}\n${inner.trim()}\n`;
}

fs.writeFileSync(OUT, out);
const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
console.log(`bundled ${modules.size} modules -> ${path.relative(ROOT, OUT)}  (${kb} kB, no external requests${ARTIFACT ? ', artifact body only' : ''})`);
