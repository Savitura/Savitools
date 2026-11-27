import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const BUDGETS = {
  sharedWarning: 500 * 1024,
  sharedFailure: 1024 * 1024,
  routeWarning: 750 * 1024,
  routeFailure: 1536 * 1024,
};

const buildDirectory = path.resolve(process.argv[2] ?? 'apps/web/.next');
const staticDirectory = path.resolve(buildDirectory, 'static');

async function readManifest(name) {
  const filePath = path.join(buildDirectory, name);
  let contents;
  try {
    contents = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read Next.js manifest ${filePath}: ${error.message}`);
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`Invalid JSON in Next.js manifest ${filePath}: ${error.message}`);
  }
}

function assertPages(manifest, name) {
  if (!manifest || typeof manifest.pages !== 'object' || manifest.pages === null) {
    throw new Error(`Next.js manifest ${name} does not contain a pages map`);
  }
  return manifest.pages;
}

async function getJavaScriptSize(asset) {
  if (typeof asset !== 'string' || !asset.endsWith('.js')) return null;

  const filePath = path.resolve(buildDirectory, asset);
  if (!filePath.startsWith(`${staticDirectory}${path.sep}`)) {
    throw new Error(`Unexpected client asset path in Next.js manifest: ${asset}`);
  }

  try {
    return (await stat(filePath)).size;
  } catch (error) {
    throw new Error(`Cannot stat client asset ${filePath}: ${error.message}`);
  }
}

function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

async function main() {
  const legacyManifest = await readManifest('build-manifest.json');
  const appManifest = await readManifest('app-build-manifest.json');
  const routes = new Map();
  if (!Array.isArray(legacyManifest.rootMainFiles)) {
    throw new Error('Next.js build-manifest.json does not contain rootMainFiles');
  }
  const sharedRootFiles = legacyManifest.rootMainFiles;

  for (const [name, manifest] of [
    ['build-manifest.json', legacyManifest],
    ['app-build-manifest.json', appManifest],
  ]) {
    for (const [route, files] of Object.entries(assertPages(manifest, name))) {
      if (!Array.isArray(files)) {
        throw new Error(`Invalid asset list for route ${route} in ${name}`);
      }
      if (/^\/(?:_app|_error|_document)$/.test(route)) continue;
      const routeFiles = routes.get(route) ?? new Set();
      for (const file of files) {
        if (typeof file !== 'string') {
          throw new Error(`Invalid asset entry for route ${route} in ${name}`);
        }
        routeFiles.add(file);
      }
      routes.set(route, routeFiles);
    }
  }

  if (routes.size === 0) {
    throw new Error('No Next.js routes found in build manifests');
  }

  const fileSizes = new Map();
  const routeFiles = new Map();
  const references = new Map();
  for (const [route, files] of routes) {
    for (const file of sharedRootFiles) files.add(file);
    const jsFiles = new Set([...files].filter((file) => file.endsWith('.js')));
    routeFiles.set(route, jsFiles);

    for (const file of jsFiles) {
      if (!fileSizes.has(file)) {
        const size = await getJavaScriptSize(file);
        fileSizes.set(file, size);
      }
      references.set(file, (references.get(file) ?? 0) + 1);
    }
  }

  const sharedSize = [...references.entries()]
    .filter(([, count]) => count > 1)
    .reduce((total, [file]) => total + fileSizes.get(file), 0);
  let failed = false;
  let warned = false;

  console.log(`Shared client JavaScript: ${formatSize(sharedSize)}`);
  if (sharedSize > BUDGETS.sharedFailure) {
    console.error(`::error::Shared client bundle exceeds ${formatSize(BUDGETS.sharedFailure)}`);
    failed = true;
  } else if (sharedSize > BUDGETS.sharedWarning) {
    console.warn(`::warning::Shared client bundle exceeds ${formatSize(BUDGETS.sharedWarning)}`);
    warned = true;
  }

  const sortedRoutes = [...routeFiles.entries()]
    .map(([route, files]) => ({
      route,
      size: [...files].reduce((total, file) => total + fileSizes.get(file), 0),
    }))
    .sort((left, right) => right.size - left.size);

  for (const { route, size } of sortedRoutes) {
    console.log(`${route}: ${formatSize(size)}`);
    if (size > BUDGETS.routeFailure) {
      console.error(
        `::error::Route ${route} exceeds ${formatSize(BUDGETS.routeFailure)}`,
      );
      failed = true;
    } else if (size > BUDGETS.routeWarning) {
      console.warn(
        `::warning::Route ${route} exceeds ${formatSize(BUDGETS.routeWarning)}`,
      );
      warned = true;
    }
  }

  if (failed) process.exitCode = 1;
  else if (!warned) console.log('All client bundle budgets are within the warning thresholds.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
