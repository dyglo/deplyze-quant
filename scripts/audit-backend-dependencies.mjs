/** Read-only module/contract inventory. Run: node scripts/audit-backend-dependencies.mjs */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const relative = p => path.relative(root, p).replaceAll(path.sep, '/');
const source = p => ts.createSourceFile(p, fs.readFileSync(p, 'utf8'), ts.ScriptTarget.Latest, true);
function resolve(from, name) {
  if (!name.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), name);
  return ['', '.ts', '.tsx', '/index.ts', '/index.tsx']
    .map(s => base + s).find(p => fs.existsSync(p) && fs.statSync(p).isFile());
}
function imports(p) {
  const result = [];
  function visit(n) {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      result.push(n.moduleSpecifier.text);
    }
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      result.push(n.arguments[0].text);
    }
    ts.forEachChild(n, visit);
  }
  visit(source(p));
  return result;
}
function closure(entry) {
  const seen = new Set(), pending = [path.resolve(entry)];
  while (pending.length) {
    const p = pending.pop();
    if (seen.has(p)) continue;
    seen.add(p);
    if (!/\.tsx?$/.test(p)) continue;
    for (const name of imports(p)) {
      const target = resolve(p, name);
      if (target) pending.push(target);
    }
  }
  return [...seen].map(relative).sort();
}
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
const reachable = closure('src/main.tsx');
const contracts = [];
for (const file of reachable.filter(p => /\.(ts|tsx)$/.test(p))) {
  const tree = source(file);
  function visit(n) {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^gateway(Get|GetMeta|Post|PostWithTimeout|Patch|Beacon)$/.test(n.expression.text)) {
      contracts.push({ file, line: tree.getLineAndCharacterOfPosition(n.getStart()).line + 1,
        client: n.expression.text, pathExpression: n.arguments[0]?.getText(tree),
        responseType: n.typeArguments?.map(a => a.getText(tree)).join(', ') ?? null });
    }
    ts.forEachChild(n, visit);
  }
  visit(tree);
}
const handlers = [];
for (const file of walk('cloud-run/gateway/src/routes').filter(p => p.endsWith('.ts'))) {
  const tree = source(file);
  function visit(n) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && /^(get|post|patch|delete)$/.test(n.expression.name.text) && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
      handlers.push({ file, line: tree.getLineAndCharacterOfPosition(n.getStart()).line + 1,
        method: n.expression.name.text.toUpperCase(), routerPath: n.arguments[0].text });
    }
    ts.forEachChild(n, visit);
  }
  visit(tree);
}
const app = source('src/App.tsx');
const routeRoots = imports('src/App.tsx').map(name => resolve(path.resolve('src/App.tsx'), name)).filter(Boolean);
const routeDependencies = Object.fromEntries(routeRoots.filter(p => /pages\/|components\/Settings/.test(relative(p)))
  .map(p => [relative(p), closure(p).filter(q => /^src\/(services|hooks|lib\/quant|lib\/telemetry)\//.test(q))]));
const candidates = [...walk('src/services'), ...walk('src/hooks')].filter(p => p.endsWith('.ts') && !reachable.includes(p));
console.log(JSON.stringify({
  evidence: 'Module reachability, including re-exports and dynamic imports. A reachable module does not prove every export is used. Unreachable files are deletion candidates, not deletion authorization.',
  routes: [...app.text.matchAll(/<Route\s+path="([^"]+)"/g)].map(m => m[1]),
  routeDependencies, reachableServices: reachable.filter(p => p.startsWith('src/services/')),
  unreachableCandidates: candidates, browserContracts: contracts, gatewayHandlers: handlers,
  firebaseConsumers: reachable.filter(p => /\.tsx?$/.test(p) && imports(p).some(n => n.startsWith('firebase/'))),
}, null, 2));
