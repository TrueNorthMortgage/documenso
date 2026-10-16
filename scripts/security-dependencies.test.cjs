const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { generateSchema } = require('@anatine/zod-openapi');
const { z } = require('zod');

const openApiDirectory = path.dirname(require.resolve('@anatine/zod-openapi/package.json'));
const { merge } = require(require.resolve('ts-deepmerge', { paths: [openApiDirectory] }));

test('OpenAPI schemas still support nested properties and union merges', () => {
  const schema = generateSchema(
    z.object({
      name: z.string().min(1),
      count: z.number().int().optional(),
      tags: z.array(z.string()),
      choice: z.union([z.string(), z.number()]),
    }),
  );
  assert.equal(schema.properties.name.minLength, 1);
  assert.equal(schema.properties.count.type, 'integer');
  assert.deepEqual(schema.required, ['name', 'tags', 'choice']);
  assert.deepEqual(schema.properties.choice.oneOf, [{ type: 'string' }, { type: 'number' }]);
});

test('schema merging discards prototype overrides at every nesting level', () => {
  const malicious = JSON.parse(
    '{"__proto__":{"polluted":true},"constructor":{},"nested":{"toString":null,"hasOwnProperty":null,"value":"safe"}}',
  );
  const result = merge({}, malicious);
  assert.deepEqual(Object.keys(result), ['nested']);
  assert.deepEqual(Object.keys(result.nested), ['value']);
  assert.equal(result.nested.value, 'safe');
  assert.equal(typeof result.nested.hasOwnProperty, 'function');
  assert.equal(result.nested.toString(), '[object Object]');
  assert.equal({}.polluted, undefined);
});

test('Nodemailer can compose a message without contacting a mail server', async () => {
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const result = await transport.sendMail({
    from: 'sender@example.invalid',
    to: 'recipient@example.invalid',
    subject: 'Compatibility test',
    text: 'Test message',
    attachments: [{ filename: 'test.txt', content: 'Test attachment' }],
  });
  const message = result.message.toString();
  assert.match(message, /Subject: Compatibility test/);
  assert.match(message, /filename=test\.txt/);
});

test('Sharp loads its native module and processes an image', async () => {
  const sharp = require('sharp');
  const output = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } })
    .resize(1, 1)
    .png()
    .toBuffer();
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 1);
  assert.equal(metadata.height, 1);
  assert.equal(metadata.format, 'png');
});

test('Prisma generator can remove stale generated files on Node 26', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const generatorDirectory = path.dirname(require.resolve('zod-prisma-types/package.json'));
  const { DirectoryHelper } = require(path.join(generatorDirectory, 'dist/classes/directoryHelper.js'));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prisma-generator-'));
  try {
    fs.mkdirSync(path.join(directory, 'nested'));
    fs.writeFileSync(path.join(directory, 'nested', 'stale.ts'), '');
    DirectoryHelper.removeDir(directory);
    assert.equal(fs.existsSync(directory), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
