// @anatine/zod-openapi still imports the default export removed in ts-deepmerge 7.
// Keep its existing calls working with the security fixes in ts-deepmerge 8.
// Remove this compatibility patch when upstream supports the named merge export.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const openApiDirectory = path.dirname(require.resolve('@anatine/zod-openapi/package.json'));
const merge = require(require.resolve('ts-deepmerge', { paths: [openApiDirectory] }));
assert.equal(typeof merge.merge, 'function', 'Expected the patched ts-deepmerge named export');

const sourcePath = path.join(openApiDirectory, 'src/lib/zod-openapi.js');
const source = fs.readFileSync(sourcePath, 'utf8');
assert.ok(
  source.includes('ts_deepmerge_1.default') || source.includes('ts_deepmerge_1.merge'),
  'OpenAPI merge implementation changed; review the compatibility patch',
);
fs.writeFileSync(sourcePath, source.replaceAll('ts_deepmerge_1.default', 'ts_deepmerge_1.merge'));

// zod-prisma-types uses recursive rmdirSync, which Node 26 removed.
// rmSync is the supported equivalent and also works on the local Node 22 runtime.
const generatorDirectory = path.dirname(require.resolve('zod-prisma-types/package.json'));
const directoryHelperPath = path.join(generatorDirectory, 'dist/classes/directoryHelper.js');
const directoryHelper = fs.readFileSync(directoryHelperPath, 'utf8');
assert.ok(
  directoryHelper.includes('fs_1.default.rmdirSync(path, { recursive: true })') ||
    directoryHelper.includes('fs_1.default.rmSync(path, { recursive: true })'),
  'Prisma generator cleanup changed; review the Node compatibility patch',
);
fs.writeFileSync(
  directoryHelperPath,
  directoryHelper.replace(
    'fs_1.default.rmdirSync(path, { recursive: true })',
    'fs_1.default.rmSync(path, { recursive: true })',
  ),
);
