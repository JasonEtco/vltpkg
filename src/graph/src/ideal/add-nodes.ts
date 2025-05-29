import type { DepID } from '@vltpkg/dep-id'
import { error } from '@vltpkg/error-cause'
import type { PackageInfoClient } from '@vltpkg/package-info'
import type { SpecOptions } from '@vltpkg/spec'
import type { PathScurry } from 'path-scurry'
import { appendNodes } from './append-nodes.ts'
import type {
  BuildIdealAddOptions,
  BuildIdealFromGraphOptions,
} from './types.ts'
import { resolveSaveType } from '../resolve-save-type.ts'
import type {GraphModifier, ModifierActiveEntry} from '../modifiers.ts'

export type AddNodesOptions = BuildIdealAddOptions &
  BuildIdealFromGraphOptions &
  SpecOptions & {
    /**
     * A {@link PathScurry} instance based on the `projectRoot` path
     */
    scurry: PathScurry

    /**
     * A {@link PackageInfoClient} instance to read manifest info from.
     */
    packageInfo: PackageInfoClient

    /**
     * A {@link GraphModifier} instance that holds information on how to
     * modify the graph, replacing nodes and edges as defined in the
     * project configuration.
     */
    modifiers?: GraphModifier
  }

/**
 * Add new nodes in the given `graph` for dependencies specified at `add`.
 */
export const addNodes = async ({
  add,
  graph,
  modifiers,
  packageInfo,
  scurry,
  ...specOptions
}: AddNodesOptions) => {
  const seen = new Set<DepID>()
  // iterates on the list of dependencies per importer updating
  // the graph using metadata fetch from the registry manifest files
  for (const [depID, dependencies] of add) {
    if (!dependencies.size)
      return

    const importer = graph.nodes.get(depID)
    if (!importer) {
      throw error('Could not find importer', { found: depID })
    }
    modifiers?.tryImporter(importer)

    // Removes any edges and nodes that are currently part of the
    // graph but are also in the list of dependencies to be installed
    const deps = [...dependencies.values()]
    for (const dep of deps) {
      const { spec } = dep
      const existingEdge = importer.edgesOut.get(spec.name)
      dep.type = resolveSaveType(importer, spec.name, dep.type)
      const node = existingEdge?.to
      if (node) graph.removeNode(node)
    }

    const modifierRefs = new Map<string, ModifierActiveEntry>()
    for (const { spec } of deps) {
      const modifierRef = modifiers?.tryNewDependency(importer, spec.name)
      if (modifierRef && 'spec' in modifierRef.modifier) {
        modifierRefs.set(spec.name, modifierRef)
      }
    }

    console.error('--- START ADD NODES ---')
    console.error('dependencies:', [...dependencies.entries()].map(([name, dep]) => `type: ${name}, spec: ${dep.spec}`).join('\n'))
    console.error('packageInfo', '---')
    console.error('graph', '---')
    console.error('node', importer.id)
    console.error('deps', deps.map(d => d.spec.name).join(', '))
    console.error('scurry', '---')
    console.error('specOptions', specOptions)
    console.error('seen', seen)
    //console.error('modifiers', modifiers)
    //console.error('modifierRefs', modifierRefs)
    console.error('----- END ADD NODES -----')
    // Add new nodes for packages defined in the dependencies list fetching
    // metadata from the registry manifests and updating the graph
    await appendNodes(
      dependencies,
      packageInfo,
      graph,
      importer,
      deps,
      scurry,
      specOptions,
      seen,
      modifiers,
      modifierRefs,
    )
  }
}
