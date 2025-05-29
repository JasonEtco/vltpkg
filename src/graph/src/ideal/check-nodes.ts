import { error } from '@vltpkg/error-cause'
import { appendNodes } from './append-nodes.ts'

import { Spec } from '@vltpkg/spec'
import type { DepID } from '@vltpkg/dep-id'
import type { Graph } from '../graph.ts'
import type { GraphModifier, ModifierActiveEntry } from '../modifiers.ts'
import type { Node } from '../node.ts'
import type { PackageInfoClient } from '@vltpkg/package-info'
import type { SpecOptions } from '@vltpkg/spec'
import type { PathScurry } from 'path-scurry'
import { asDependency, type Dependency } from '../dependencies.ts'
import type {
  BuildIdealFromGraphOptions,
} from './types.ts'

export type CheckNodesOptions = 
  BuildIdealFromGraphOptions &
  SpecOptions & {
  /**
   * The dependencies to check.
   */
  check: Map<DepID, Map<string, Dependency>>
  /**
   * A {@link GraphModifier} instance that holds information on how to
   * modify the graph, replacing nodes and edges as defined in the
   * project configuration.
   */
  modifiers?: GraphModifier
  /**
   * The package info client to use.
   */
  packageInfo: PackageInfoClient
  /**
   * The path scurry instance to use.
   */
  scurry: PathScurry
}

/**
 * Runs an extra check and apply modifiers in all nodes that are not part
 * of the the list of nodes to add.
 */
export const checkNodes = async ({
  check,
  graph,
  modifiers,
  packageInfo,
  scurry,
  ...specOptions
}: CheckNodesOptions): Promise<void> => {
  console.log('checkNodes', check.keys())
  const seen = new Set<DepID>()
  const traverse = new Set<Node>(graph.importers)

  // initializes the map of modifiers with any seen importers
  for (const node of traverse) {
    const deps = check.get(node.id)
    if (deps?.size) {
      modifiers?.tryImporter(node)
    } else {
      traverse.delete(node)
    }
  }

  // TODO: let's add support to versions using the :semver / :v pseudo selector
  for (const node of traverse) {
    const modifiedDeps = new Map<string, Dependency>()
    const modifierRefs = new Map<string, ModifierActiveEntry>()
    for (const [name, edge] of node.edgesOut) {
      const modifierRef = modifiers?.tryNewDependency(node, name)
      //console.log('modifierRef', name, modifierRef?.modifier.query)
      // TODO: needs to support node replacements (package extensions)
      if (modifierRef && 'spec' in modifierRef.modifier) {
        //const spec = modifierRef.interactiveBreadcrumb.done ? modifierRef.modifier.spec : edge.spec
        modifiedDeps.set(name, asDependency({
          type: edge.type,
          spec: edge.spec,
        }))
        modifierRefs.set(name, modifierRef)
      }
    }
    if (node.importer) {
    console.error('--- START CHECK NODES ---')
    console.error('dependencies:', [...modifiedDeps.entries()].map(([name, dep]) => `type: ${name}, spec: ${dep.spec}`).join('\n'))
    console.error('packageInfo', '---')
    console.error('graph', '---')
    console.error('node', node.id)
    console.error('deps', [...modifiedDeps.values()].map(d => d.spec.name).join(', '))
    console.error('scurry', '---')
    console.error('specOptions', specOptions)
    console.error('seen', seen)
    //console.error('modifiers', modifiers)
    //console.error('modifierRefs', modifierRefs)
    console.error('----- END CHECK NODES -----')
    }
    if (modifiedDeps.size) {
      // TODO: inside append nodes we also need a check for tryNewDependency
      await appendNodes(
        modifiedDeps,
        packageInfo,
        graph,
        node,
        [...modifiedDeps.values()],
        scurry,
        specOptions,
        seen,
        modifiers,
        modifierRefs,
      )
    }
  }
}
