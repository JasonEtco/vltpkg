import t from 'tap'
import { asPostcssNodeWithChildren, parse } from '@vltpkg/dss-parser'
import { prerelease } from '../../src/pseudo/prerelease.ts'
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
})