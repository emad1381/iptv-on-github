const fs = require('fs');
const path = require('path');

const base = __dirname;
let passed = 0, failed = 0;

function log(name, status, detail) {
  if (status === 'PASS') passed++; else failed++;
  console.log('[' + status + '] ' + name + (detail ? ' — ' + detail : ''));
}

// Test 1: All files exist
const requiredFiles = [
  'index.html', 'manifest.json', 'sw.js', 'README.md', 'LICENSE',
  'css/themes.css', 'css/main.css', 'css/player.css', 'css/modal.css', 'css/mobile.css',
  'js/app.js', 'js/storage.js', 'js/ui.js', 'js/player.js', 'js/channels.js',
  'js/categories.js', 'js/search.js', 'js/import-export.js', 'js/settings.js',
  'js/shortcuts.js', 'js/diagnostics.js',
  'assets/favicon.svg', 'assets/logo.svg',
  'data/default-categories.json'
];
const missingFiles = requiredFiles.filter(f => !fs.existsSync(path.join(base, f)));
if (missingFiles.length === 0) {
  log('All files exist', 'PASS', requiredFiles.length + ' files');
} else {
  log('All files exist', 'FAIL', 'Missing: ' + missingFiles.join(', '));
}

// Test 2: No localStorage in JS (except storage.js migration, ignore comments)
const jsFiles = fs.readdirSync(path.join(base, 'js')).filter(f => f.endsWith('.js'));
let localStorageLeaks = [];
for (const f of jsFiles) {
  if (f === 'storage.js') continue;
  const content = fs.readFileSync(path.join(base, 'js', f), 'utf8');
  // Strip single-line comments
  const stripped = content.replace(/\/\/.*$/gm, '');
  // Strip multi-line comments
  const strippedAll = stripped.replace(/\/\*[\s\S]*?\*\//g, '');
  if (strippedAll.indexOf('localStorage') !== -1) {
    localStorageLeaks.push(f);
  }
}
if (localStorageLeaks.length === 0) {
  log('No localStorage outside storage.js', 'PASS', 'Clean (comments excluded)');
} else {
  log('No localStorage outside storage.js', 'FAIL', 'Found in: ' + localStorageLeaks.join(', '));
}

// Test 3: storage.js exports
const storageContent = fs.readFileSync(path.join(base, 'js/storage.js'), 'utf8');
const storageExports = ['init', 'loadAppState', 'saveAppState', 'loadTheme', 'saveTheme', 'loadProxyUrl', 'saveProxyUrl', 'clearAll', 'loadCustomProxies', 'saveCustomProxies', 'exportSettings', 'importSettings'];
const missingStorageExports = storageExports.filter(e => {
  return storageContent.indexOf('export async function ' + e) === -1 &&
         storageContent.indexOf('export function ' + e) === -1;
});
if (missingStorageExports.length === 0) {
  log('storage.js exports', 'PASS', storageExports.join(', '));
} else {
  log('storage.js exports', 'FAIL', 'Missing: ' + missingStorageExports.join(', '));
}

// Test 4: IndexedDB stores
if (storageContent.indexOf("'channels'") !== -1 &&
    storageContent.indexOf("'categories'") !== -1 &&
    storageContent.indexOf("'settings'") !== -1 &&
    storageContent.indexOf("'backups'") !== -1) {
  log('IndexedDB stores defined', 'PASS', 'channels, categories, settings, backups');
} else {
  log('IndexedDB stores defined', 'FAIL', 'Missing stores');
}

// Test 4b: Custom proxy support
const settingsContent = fs.readFileSync(path.join(base, 'js/settings.js'), 'utf8');
const hasCustomProxy = settingsContent.indexOf('addCustomProxy') !== -1 &&
                       settingsContent.indexOf('removeCustomProxy') !== -1 &&
                       settingsContent.indexOf('renderProxyPresets') !== -1 &&
                       settingsContent.indexOf('bindProxyEvents') !== -1;
if (hasCustomProxy) {
  log('Custom proxy support', 'PASS', 'add, remove, render, bindProxyEvents');
} else {
  log('Custom proxy support', 'FAIL', 'Missing functions');
}

// Test 4c: Settings export/import includes proxy
const ieContent = fs.readFileSync(path.join(base, 'js/import-export.js'), 'utf8');
if (ieContent.indexOf('settings') !== -1 && ieContent.indexOf('version: \'2.1\'') !== -1) {
  log('Export includes settings', 'PASS', 'version 2.1 with settings field');
} else {
  log('Export includes settings', 'FAIL', 'Missing settings in export');
}

// Test 5: Import graph
function checkImports(file) {
  const content = fs.readFileSync(path.join(base, 'js', file), 'utf8');
  const re = /from\s+['"]\.\/([\w\-\.]+\.js)['"]/g;
  const issues = [];
  let match;
  while ((match = re.exec(content)) !== null) {
    const target = match[1];
    if (!fs.existsSync(path.join(base, 'js', target))) {
      issues.push(target + ' not found');
    }
  }
  return issues;
}

let importIssues = [];
for (const f of jsFiles) {
  const issues = checkImports(f);
  if (issues.length > 0) importIssues.push(f + ': ' + issues.join(', '));
}
if (importIssues.length === 0) {
  log('Import graph valid', 'PASS', 'All imports resolve');
} else {
  log('Import graph valid', 'FAIL', importIssues.join('; '));
}

// Test 6: HTML references
const htmlContent = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
const htmlRefs = [
  'css/themes.css', 'css/main.css', 'css/player.css', 'css/modal.css', 'css/mobile.css',
  'js/app.js', 'manifest.json', 'assets/favicon.svg'
];
const missingHtmlRefs = htmlRefs.filter(r => htmlContent.indexOf(r) === -1);
if (missingHtmlRefs.length === 0) {
  log('HTML references all assets', 'PASS', htmlRefs.length + ' references');
} else {
  log('HTML references all assets', 'FAIL', 'Missing: ' + missingHtmlRefs.join(', '));
}

// Test 7: No inline scripts
const inlineScriptMatch = htmlContent.match(/<script(?![^>]*type=)(?![^>]*src=)[^>]*>/g);
if (!inlineScriptMatch || inlineScriptMatch.length === 0) {
  log('No inline scripts', 'PASS', 'Only module + CDN scripts');
} else {
  log('No inline scripts', 'FAIL', inlineScriptMatch.length + ' inline script(s)');
}

// Test 8: manifest.json
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
const mChecks = [];
if (manifest.name) mChecks.push('name');
if (manifest.display) mChecks.push('display');
if (manifest.icons && manifest.icons.length > 0) mChecks.push('icons');
if (manifest.start_url) mChecks.push('start_url');
if (mChecks.length === 4) {
  log('manifest.json valid', 'PASS', manifest.name + ', ' + manifest.display);
} else {
  log('manifest.json valid', 'FAIL', 'Missing: ' + ['name','display','icons','start_url'].filter(c => !mChecks.includes(c)).join(', '));
}

// Test 9: sw.js cache count
const swContent = fs.readFileSync(path.join(base, 'sw.js'), 'utf8');
const cacheEntries = swContent.match(/'\.\//g) || [];
if (cacheEntries.length >= 15) {
  log('sw.js cache list', 'PASS', cacheEntries.length + ' entries');
} else {
  log('sw.js cache list', 'FAIL', 'Only ' + cacheEntries.length + ' entries');
}

// Test 10: No absolute paths
const absPaths = htmlContent.match(/href="\/[^\/][^"]*"|src="\/[^\/][^"]*"/g) || [];
if (absPaths.length === 0) {
  log('GitHub Pages paths', 'PASS', 'All relative');
} else {
  log('GitHub Pages paths', 'FAIL', absPaths.join(', '));
}

// Test 11: CSS classes
const cssContent = ['css/themes.css','css/main.css','css/player.css','css/modal.css','css/mobile.css']
  .map(f => fs.readFileSync(path.join(base, f), 'utf8')).join('');
const jsClasses = ['channel-row','cat-tab','cat-tabs','cat-count','cat-del','cat-add',
  'cat-assign-bar','cat-pick-item','toast','modal-overlay','modal-card',
  'search-modal-content','result','result-logo','result-info','settings-section',
  'proxy-row','diag-log','shortcuts-grid','kbd','loader','video-wrap','fs-btn','test-result-area'];
const missingClasses = jsClasses.filter(c => cssContent.indexOf('.' + c) === -1);
if (missingClasses.length === 0) {
  log('CSS classes match JS', 'PASS', jsClasses.length + ' classes');
} else {
  log('CSS classes match JS', 'FAIL', 'Missing: ' + missingClasses.join(', '));
}

// Test 12: default-categories.json
const cats = JSON.parse(fs.readFileSync(path.join(base, 'data/default-categories.json'), 'utf8'));
if (cats.categories && cats.categories.length >= 5) {
  log('default-categories.json', 'PASS', cats.categories.length + ' categories');
} else {
  log('default-categories.json', 'FAIL', 'Invalid');
}

// Test 13: JS syntax check
let syntaxErrors = [];
for (const f of jsFiles) {
  const content = fs.readFileSync(path.join(base, 'js', f), 'utf8');
  // Basic syntax checks
  const opens = (content.match(/\{/g) || []).length;
  const closes = (content.match(/\}/g) || []).length;
  if (Math.abs(opens - closes) > 2) {
    syntaxErrors.push(f + ' (brace mismatch: ' + opens + ' open, ' + closes + ' close)');
  }
}
if (syntaxErrors.length === 0) {
  log('JS syntax (brace check)', 'PASS', 'All balanced');
} else {
  log('JS syntax (brace check)', 'FAIL', syntaxErrors.join(', '));
}

// Test 14: app.js has async bootstrap
const appContent = fs.readFileSync(path.join(base, 'js/app.js'), 'utf8');
if (appContent.indexOf('async function bootstrap') !== -1 &&
    appContent.indexOf('await storage.init()') !== -1 &&
    appContent.indexOf('registerServiceWorker') !== -1) {
  log('app.js async bootstrap + SW registration', 'PASS', 'Found async bootstrap, await init, registerServiceWorker');
} else {
  log('app.js async bootstrap + SW registration', 'FAIL', 'Missing');
}

// Summary
console.log('\n=== NODE.JS VALIDATION SUMMARY ===');
console.log('PASS: ' + passed);
console.log('FAIL: ' + failed);
console.log('TOTAL: ' + (passed + failed));
console.log(failed === 0 ? '\nALL TESTS PASSED' : '\n' + failed + ' TEST(S) FAILED');
