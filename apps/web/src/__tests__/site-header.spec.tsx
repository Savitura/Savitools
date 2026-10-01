/**
 * SiteHeader import guard (Savitura/Savitools#237).
 *
 * `<SiteHeader />` is mounted exactly once, from `src/app/layout.tsx`, so it
 * wraps every route. A page that mounts it again renders a second nav bar on
 * top of the first — the "doubled header" bug this guard exists to prevent.
 *
 * The file is intentionally `.spec.tsx`: it is the regression proof that Jest
 * collects `.tsx` suites (before Savitura/Savitools#244 nothing ran it, which is
 * how the leftover doubled headers survived the #237 fix).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** The one file allowed to mount the shared header, relative to `src/app`. */
const SANCTIONED_MOUNT_POINT = 'layout.tsx';

/** Both module paths the duplicated header has been imported from over time. */
const SITE_HEADER_MODULES = [
  '@/components/layout/site-header',
  '@/components/site-header',
];

function listSourceFiles(directory: string, fileList: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory)) {
    const entryPath = path.join(directory, entry);
    if (fs.statSync(entryPath).isDirectory()) {
      listSourceFiles(entryPath, fileList);
    } else if (entryPath.endsWith('.tsx') || entryPath.endsWith('.ts')) {
      fileList.push(entryPath);
    }
  }
  return fileList;
}

describe('SiteHeader import guard', () => {
  it('only mounts the shared header from the root layout', () => {
    // Resolved from this file, not the process cwd, so the guard holds whichever
    // workspace directory the runner starts in.
    const appDir = path.join(__dirname, '..', 'app');
    expect(fs.existsSync(appDir)).toBe(true);

    const violations = listSourceFiles(appDir)
      .filter(
        (file) => path.relative(appDir, file) !== SANCTIONED_MOUNT_POINT,
      )
      .filter((file) => {
        const source = fs.readFileSync(file, 'utf-8');
        return SITE_HEADER_MODULES.some((modulePath) =>
          source.includes(modulePath),
        );
      })
      .map((file) => path.relative(appDir, file));

    expect(violations).toEqual([]);
  });
});
