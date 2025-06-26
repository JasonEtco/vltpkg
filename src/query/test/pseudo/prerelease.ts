import t from 'tap'
import { asPostcssNodeWithChildren, parse } from '@vltpkg/dss-parser'
import { prerelease } from '../../src/pseudo/prerelease.ts'
import { pseudo } from '../../src/pseudo.ts'
import {
  getSemverRichGraph,
  getSimpleGraph,
} from '../fixtures/graph.ts'
import type { ParserState } from '../../src/types.ts'

t.test('select from prerelease definition', async t => {
  const getState = (query: string, graph = getSemverRichGraph()) => {
    const ast = parse(query)
    const current = asPostcssNodeWithChildren(ast.first.first)
    const state: ParserState = {
      comment: '',
      current,
      initial: {
        edges: new Set(graph.edges.values()),
        nodes: new Set(graph.nodes.values()),
      },
      partial: {
        edges: new Set(graph.edges.values()),
        nodes: new Set(graph.nodes.values()),
      },
      collect: {
        edges: new Set(),
        nodes: new Set(),
      },
      retries: 0,
      cancellable: async () => {},
      walk: async i => i,
      securityArchive: undefined,
      specOptions: {},
      signal: new AbortController().signal,
      specificity: { idCounter: 0, commonCounter: 0 },
    }
    return state
  }

  await t.test('select prerelease packages', async t => {
    const res = await prerelease(getState(':prerelease'))
    t.strictSame(
      [...res.partial.nodes].map(n => `${n.name}@${n.version}`).sort(),
      ['e@1.3.4-beta.1', 'g@1.2.3-rc.1+rev.2'],
      'should have expected prerelease packages',
    )
    t.matchSnapshot({
      nodes: [...res.partial.nodes].map(n => n.name).sort(),
      edges: [...res.partial.edges].map(e => e.name).sort(),
    })
  })

  await t.test('no prereleases in simple graph', async t => {
    const res = await prerelease(getState(':prerelease', getSimpleGraph()))
    t.strictSame(
      [...res.partial.nodes].map(n => `${n.name}@${n.version}`),
      [],
      'should have no results when no prereleases exist',
    )
    t.matchSnapshot({
      nodes: [...res.partial.nodes].map(n => n.name),
      edges: [...res.partial.edges].map(e => e.name),
    })
  })

  await t.test('handles nodes without version', async t => {
    const graph = getSemverRichGraph()
    // Add a node without version to test edge case
    const nodeWithoutVersion = {
      projectRoot: '.',
      confused: false,
      edgesIn: new Set(),
      edgesOut: new Map(),
      importer: false,
      mainImporter: false,
      graph,
      id: 'registry::no-version@1.0.0',
      name: 'no-version',
      version: '1.0.0',
      location: 'registry::no-version@1.0.0/node_modules/no-version',
      manifest: { name: 'no-version' }, // No version in manifest
      integrity: 'sha512-deadbeef',
      resolved: undefined,
      dev: false,
      optional: false,
      setConfusedManifest() {},
    }
    graph.nodes.set(nodeWithoutVersion.id, nodeWithoutVersion)

    const res = await prerelease(getState(':prerelease', graph))
    t.strictSame(
      [...res.partial.nodes].map(n => `${n.name}@${n.version}`).sort(),
      ['e@1.3.4-beta.1', 'g@1.2.3-rc.1+rev.2'],
      'should still select prerelease packages even with nodes missing version manifest',
    )
  })

  await t.test('matches various prerelease formats', async t => {
    const graph = getSimpleGraph()
    
    // Add nodes with various prerelease formats
    const prereleaseFormats = [
      'alpha',
      'beta.1',
      'rc.1',
      'snapshot',
      'dev.123',
      'canary.abc123'
    ]
    
    prereleaseFormats.forEach((prerel, index) => {
      const node = {
        projectRoot: '.',
        confused: false,
        edgesIn: new Set(),
        edgesOut: new Map(),
        importer: false,
        mainImporter: false,
        graph,
        id: `registry::test${index}@1.0.0-${prerel}`,
        name: `test${index}`,
        version: `1.0.0-${prerel}`,
        location: `registry::test${index}@1.0.0-${prerel}/node_modules/test${index}`,
        manifest: { name: `test${index}`, version: `1.0.0-${prerel}` },
        integrity: 'sha512-deadbeef',
        resolved: undefined,
        dev: false,
        optional: false,
        setConfusedManifest() {},
      }
      graph.nodes.set(node.id, node)
    })

    const res = await prerelease(getState(':prerelease', graph))
    const results = [...res.partial.nodes].map(n => n.version).sort()
    
    t.strictSame(
      results,
      [
        '1.0.0-alpha',
        '1.0.0-beta.1', 
        '1.0.0-canary.abc123',
        '1.0.0-dev.123',
        '1.0.0-rc.1',
        '1.0.0-snapshot'
      ],
      'should match all prerelease format variations',
    )
  })
})

t.test(':not(:prerelease) integration', async t => {
  const getStateForNotTest = (query: string, graph = getSemverRichGraph()) => {
    const ast = parse(query)
    const current = ast.first.first
    const state: ParserState = {
      comment: '',
      current,
      initial: {
        edges: new Set(graph.edges.values()),
        nodes: new Set(graph.nodes.values()),
      },
      partial: {
        edges: new Set(graph.edges.values()),
        nodes: new Set(graph.nodes.values()),
      },
      collect: {
        edges: new Set(),
        nodes: new Set(),
      },
      retries: 0,
      cancellable: async () => {},
      walk: pseudo, // Use the pseudo function directly for proper :not integration
      securityArchive: undefined,
      specOptions: {},
      signal: new AbortController().signal,
      specificity: { idCounter: 0, commonCounter: 0 },
    }
    return state
  }

  await t.test('excludes prerelease packages', async t => {
    const res = await pseudo(getStateForNotTest(':not(:prerelease)'))
    const nodeVersions = [...res.partial.nodes].map(n => `${n.name}@${n.version}`).sort()
    
    // Should include stable versions but exclude prereleases
    const expectedStable = [
      'a@1.0.1',
      'b@2.2.1',  
      'c@3.4.0',
      'e@120.0.0',
      'f@4.5.6',
      'semver-rich-project@1.0.0'
    ]
    
    t.strictSame(
      nodeVersions,
      expectedStable,
      'should exclude prerelease packages and include only stable versions',
    )
    
    // Verify no prerelease versions are included
    const hasPrerelease = nodeVersions.some(v => v.includes('-'))
    t.equal(hasPrerelease, false, 'should not contain any prerelease versions')
    
    t.matchSnapshot({
      nodes: [...res.partial.nodes].map(n => n.name).sort(),
      edges: [...res.partial.edges].map(e => e.name).sort(),
    })
  })
})