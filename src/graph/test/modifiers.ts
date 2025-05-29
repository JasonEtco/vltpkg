import { dirname, resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import t from 'tap'
import { fileURLToPath } from 'node:url'
import type { Manifest } from '@vltpkg/types'
import { GraphModifier } from '../src/modifiers.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = resolve(__dirname, 'fixtures')
const modifiersFixture = resolve(fixturesDir, 'modifiers')

// Create test fixtures
mkdirSync(modifiersFixture, { recursive: true })
writeFileSync(
  resolve(modifiersFixture, 'vlt.json'),
  JSON.stringify({
    modifiers: {
      'example-string': 'string-value',
      'example-manifest': {
        name: 'test-manifest',
        version: '1.0.0',
        description: 'Test manifest for Modifiers'
      }
    }
  })
)

// Create invalid fixture
mkdirSync(resolve(fixturesDir, 'invalid-modifiers'), { recursive: true })
writeFileSync(
  resolve(fixturesDir, 'invalid-modifiers', 'vlt.json'),
  JSON.stringify({
    notModifiers: {}
  })
)

// Create malformed fixture
mkdirSync(resolve(fixturesDir, 'malformed-modifiers'), { recursive: true })
writeFileSync(
  resolve(fixturesDir, 'malformed-modifiers', 'vlt.json'),
  '{invalid json'
)

t.test('GraphModifier', async t => {
  t.test('constructor', async t => {
    const modifiers = new GraphModifier(modifiersFixture)
    t.equal(modifiers.projectRoot, resolve(modifiersFixture))
    t.ok(modifiers.scurry, 'has a scurry instance')
    t.ok(modifiers.packageJson, 'has a packageJson instance')
  })

  t.test('config getter loads and parses vlt.json', async t => {
    const modifiers = new GraphModifier(modifiersFixture)
    const config = modifiers.config
    
    t.equal(config['example-string'], 'string-value')
    
    const manifestValue = config['example-manifest']
    t.ok(manifestValue && typeof manifestValue !== 'string', 'manifest value is an object')
    
    if (manifestValue && typeof manifestValue !== 'string') {
      t.equal(manifestValue.name, 'test-manifest')
      t.equal(manifestValue.version, '1.0.0')
    }
  })

  t.test('config getter returns cached config if available', async t => {
    const modifiers = new GraphModifier(modifiersFixture)
    
    // Access config for the first time to populate cache
    const config1 = modifiers.config
    
    // Corrupt the fixture file to verify we're using the cache
    writeFileSync(
      resolve(modifiersFixture, 'vlt.json'),
      JSON.stringify({ modifiers: { changed: true } })
    )
    
    // Access config again
    const config2 = modifiers.config
    
    // Restore original file content
    writeFileSync(
      resolve(modifiersFixture, 'vlt.json'),
      JSON.stringify({
        modifiers: {
          'example-string': 'string-value',
          'example-manifest': {
            name: 'test-manifest',
            version: '1.0.0',
            description: 'Test manifest for GraphModifier'
          }
        }
      })
    )
    
    // Verify we got the cached value, not the corrupted file
    t.equal(config1, config2)
    t.equal(config2['example-string'], 'string-value')
  })

  t.test('config getter throws on missing vlt.json', async t => {
    const modifiers = new GraphModifier(resolve(fixturesDir, 'nonexistent'))
    t.throws(() => modifiers.config, { message: 'No vlt.json found' })
  })

  t.test('config getter throws on invalid vlt.json', async t => {
    const modifiers = new GraphModifier(resolve(fixturesDir, 'malformed-modifiers'))
    t.throws(() => modifiers.config, { message: 'Invalid vlt.json file' })
  })

  t.test('config getter throws on missing modifiers property', async t => {
    const modifiers = new GraphModifier(resolve(fixturesDir, 'invalid-modifiers'))
    t.throws(() => modifiers.config, { message: 'Invalid modifiers configuration' })
  })

  t.test('static maybeLoad returns instance if vlt.json exists', async t => {
    const modifiers = GraphModifier.maybeLoad(modifiersFixture)
    t.ok(modifiers instanceof GraphModifier)
    t.equal(modifiers?.projectRoot, resolve(modifiersFixture))
  })

  t.test('static maybeLoad returns undefined if vlt.json does not exist', async t => {
    const modifiers = GraphModifier.maybeLoad(resolve(fixturesDir, 'nonexistent'))
    t.equal(modifiers, undefined)
  })

  t.test('static load returns instance if vlt.json exists', async t => {
    const modifiers = GraphModifier.load(modifiersFixture)
    t.ok(modifiers instanceof GraphModifier)
    t.equal(modifiers.projectRoot, resolve(modifiersFixture))
  })
}) 
