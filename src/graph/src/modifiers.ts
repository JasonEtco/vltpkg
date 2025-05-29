import { error } from '@vltpkg/error-cause'
import { PackageJson } from '@vltpkg/package-json'
import { asManifest, type Manifest } from '@vltpkg/types'
import { Spec, type SpecOptions } from '@vltpkg/spec'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PathScurry } from 'path-scurry'
import { PathScurry as PathScurryClass } from 'path-scurry'
import { parse } from 'polite-json'
import type { Edge } from './edge.ts'
import type { Node } from './node.ts'

/**
 * Type definition for the modifiers configuration object
 */
export type GraphModifierConfigObject = Record<string, string | Manifest>

/**
 * A valid item of a given breadcrumb.
 */
export type ModifierBreadcrumbItem = {
  name?: string
  value: string
  type: string
  importer: boolean
  prev: ModifierBreadcrumbItem | undefined
  next: ModifierBreadcrumbItem | undefined
}

/**
 * A breadcrumb is a linked list of items, where
 * each item has a value and a type.
 */
export interface ModifierBreadcrumb extends Iterable<ModifierBreadcrumbItem> {
  clear(): void
  first: ModifierBreadcrumbItem
  last: ModifierBreadcrumbItem
  single: boolean
  interactive: () => ModifierInteractiveBreadcrumb
}

/**
 * An interactive breadcrumb that holds state on what is the current item.
 */
export type ModifierInteractiveBreadcrumb = {
  current: ModifierBreadcrumbItem | undefined
  done: boolean
  next: () => ModifierInteractiveBreadcrumb
}

/**
 * Info needed to define a graph modifier.
 */
export type BaseModifierEntry = {
  type: 'edge' | 'node'
  query: string
  breadcrumb: ModifierBreadcrumb
  value: string | Manifest
  refs: Set<{
    name: string
    from: Node
  }>
}

/**
 * Extra info to define specifically a graph edge modifier.
 */
export type EdgeModifierEntry = BaseModifierEntry & {
  type: 'edge',
  spec: Spec,
  value: string
}

/**
 * Extra info to define the graph node modifier.
 */
export type NodeModifierEntry = BaseModifierEntry & {
  type: 'node',
  manifest: Manifest,
}

export type ModifierEntry = EdgeModifierEntry | NodeModifierEntry

/**
 * An object to track modifiers that have matched an initial part of the
 * breadcrumb. It holds pointers to both nodes and edges matched in the
 * current traversed graph on top of the modifier info and the breadcrumb
 * state that is used to track the current state of the parsing.
 */
export type ModifierActiveEntry = {
  /**
   * The modifier this active entry is working with.
   */
  modifier: ModifierEntry
  /**
   * The breadcrumb that is used to track the current state of the parsing.
   */
  interactiveBreadcrumb: ModifierInteractiveBreadcrumb
  /**
   * The first node to be affected by this modifier.
   */
  originalFrom: Node
  /**
   * The original edge that is being replaced with this entry.
   */
  originalEdge?: Edge
  /**
   * The modified edge that is being used to replace the original edge.
   */
  modifiedEdge?: Edge
}

/**
 * Options for the GraphModifier class constructor
 */
export type GraphModifierOptions = {
  /**
   * Helper method for parsing the breadcrumb items
   */
  parseBreadcrumb: (query: string) => ModifierBreadcrumb
  /**
   * A {@link PackageJson} object, for sharing manifest caches
   */
  packageJson?: PackageJson
  /**
   * A {@link PathScurry} object, for use in filesystem operations
   */
  scurry?: PathScurry
  /**
   * Options for the {@link Spec} parser
   */
  specOptions?: SpecOptions
  /**
   * Parsed normalized contents of the modifiers from a `vlt.json` file
   */
  config?: GraphModifierConfigObject
}

/**
 * Class representing modifiers configuration for a project
 */
export class GraphModifier {
  /** The project root where vlt.json is found */
  projectRoot: string
  /** Scurry object to cache all filesystem calls */
  scurry: PathScurry
  /** The package.json object, for sharing manifest caches */
  packageJson: PackageJson
  /** The loaded modifiers configuration */
  #config?: GraphModifierConfigObject
  #modifiers = new Set<ModifierEntry>()
  #edgeModifiers = new Set<EdgeModifierEntry>()
  #nodeModifiers = new Set<NodeModifierEntry>()
  #initialEntries = new Map<string, ModifierEntry>()
  /**
   * A map of active entries, keyed by the current parsing item
   * of a bredcrumb to a new map that connects the current parsing
   * node to a modifier entry.
   * */
  #activeEntries = new Map<string, Map<Node, ModifierActiveEntry>>()
  #activeModifiers = new Set<ModifierActiveEntry>()

  constructor(projectRoot: string, options: GraphModifierOptions) {
    console.log('GraphModifier constructor')
    this.projectRoot = resolve(projectRoot)
    this.scurry = options.scurry ?? new PathScurryClass(projectRoot)
    this.packageJson = options.packageJson ?? new PackageJson()
    console.log('config')
    this.load(options)
  }

  /**
   * Load the modifiers definitions from vlt.json,
   * converting the result into a GraphModifierConfigObject
   */
  get config(): GraphModifierConfigObject {
    console.log('get config')
    if (this.#config) return this.#config
    const file = resolve(this.projectRoot, 'vlt.json')
    let confData: string
    try {
      confData = readFileSync(file, 'utf8')
    } catch (er) {
      throw error('No vlt.json found', {
        path: this.projectRoot,
        cause: er,
      })
    }
    let parsed: unknown
    try {
      parsed = parse(confData)
    } catch (er) {
      throw error('Invalid vlt.json file', {
        path: this.projectRoot,
        cause: er,
      })
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw error('Invalid vlt.json file, not an object', {
        path: this.projectRoot,
        found: parsed,
        wanted: '{ modifiers: GraphModifierConfigObject }',
      })
    }
    
    const modifiers = (parsed as { modifiers?: GraphModifierConfigObject }).modifiers

    if (modifiers && typeof modifiers !== 'object') {
      throw error('Invalid modifiers configuration', {
        path: file,
        found: modifiers,
        wanted: 'Record<string, string | Manifest>',
      })
    }

    this.#config = modifiers || {}
    console.log('this.#config', this.#config)
    return this.#config
  }

  load(options: GraphModifierOptions) {
    console.log('load')
    for (const [key, value] of Object.entries(this.config)) {
      const breadcrumb = options.parseBreadcrumb(key)
      if (!breadcrumb.last.name) {
        throw error('Could not find name in breadcrumb', {
          found: key,
        })
      }
      if (typeof value === 'string') {
        const mod = {
          breadcrumb,
          query: key,
          refs: new Set(),
          spec: Spec.parse(breadcrumb.last.name, value, options.specOptions),
          type: 'edge',
          value,
        } satisfies EdgeModifierEntry
        this.#modifiers.add(mod)
        this.#edgeModifiers.add(mod)
        // if the breadcrumb starts with an id, then add it to the
        // map of initial entries, so that we can use it to match
        if (breadcrumb.first.name) {
          this.#initialEntries.set(breadcrumb.first.name, mod)
        }
      } else {
        const manifest = asManifest(value)
        const mod = {
          breadcrumb,
          query: key,
          manifest,
          refs: new Set(),
          type: 'node',
          value: manifest,
        } satisfies NodeModifierEntry
        this.#modifiers.add(mod)
        this.#nodeModifiers.add(mod)
        // if the breadcrumb starts with an id, then add it to the
        // map of initial entries, so that we can use it to match
        if (breadcrumb.first.name) {
          this.#initialEntries.set(breadcrumb.first.name, mod)
        }
      }
    }
    console.log('edge modifiers', this.#edgeModifiers)
    console.log('node modifiers', this.#nodeModifiers)
  }

  /**
   * Check if a given importer dependency name has potentially a registered
   * modifier. In case of an ambiguous modifier, the method will always
   * return `true`, it only returns `false` in the case that only fully
   * qualified modifiers are registered and none are targeting the given
   * top-level dependency name.
   */
  maybeHasModifier(depName: string): boolean {
    for (const mod of this.#modifiers) {
      const matchingName = 
        mod.breadcrumb.first.importer && mod.breadcrumb.first.next?.name === depName
      const rootlessBreadcrumb = !mod.breadcrumb.first.importer
      if (rootlessBreadcrumb || matchingName) {
        return true
      }
    }
    return false
  }

  /**
   * Try matching the provided node against the top-level selectors.
   * Register both the node and the modifier if a match is found.
   */
  tryImporter(importer: Node) {
    for (const modifier of this.#modifiers) {
      // if the first item in the breadcrumb is an importer and it matches
      // any of the valid top-level selectors, then register the modifier
      const { first } = modifier.breadcrumb
      const matchRoot = first.value === ':root' && importer.mainImporter
      const matchWorkspace = first.value === ':workspace' && importer.importer
      const matchAny = first.value === ':project' || matchRoot || matchWorkspace
      if (first.importer && matchAny) {
        const active = this.registerModifier(importer, modifier)
        const single = active?.modifier.breadcrumb.single
        // only the importers will update the active entry right after
        // registering it since tryImporter doesn't try to match from
        // active dependencies
        if (active && !single) {
          this.updateActiveEntry(importer, active)
        }
      }
    }
  }

  /**
   * Try matching the provided node and dependency name to the current
   * active parsing modifier entries along with possible starting-level
   * modifiers.
   *
   * When an entry is found it is then returned, otherwise returns
   * `undefined`.
   */
  tryNewDependency(from: Node, name: string): ModifierActiveEntry | undefined {
    // if an active entry is found then returns that
    const mapEntry = this.#activeEntries.get(name)
    if (mapEntry) {
      const entry = mapEntry.get(from)
      if (entry) {
        return entry
      }
    }

    // matches the name against the initial entries, this will make it so
    // that modifier queries that start with a name (e.g: #a > #b) can
    // match at any point of the graph traversal
    const initial = this.#initialEntries.get(name)
    if (initial) {
      return this.registerModifier(from, initial)
    }
  }

  /**
   * Updates an active entry state. If the current breadcrumb state
   * shows there's no more items left, then we deregister the modifier.
   */
  updateActiveEntry(from: Node, active?: ModifierActiveEntry): ModifierActiveEntry | undefined {
    const interactiveBreadcrumb = active?.interactiveBreadcrumb.next()
    if (active && interactiveBreadcrumb?.current?.name) {
      const mapEntry = this.#activeEntries.get(interactiveBreadcrumb.current.name)
      // TODO: fix edge to edge modifier
      // TODO: dash spec to remove dependency
      // TODO: Versions
      // TODO: attributes
      if (mapEntry) {
        // we should never rewrite an existing mapEntry
        if (mapEntry.has(from)) return
        mapEntry.set(from, active)
      } else {
        const nodeMap = new Map<Node, ModifierActiveEntry>()
        nodeMap.set(from, active)
        this.#activeEntries.set(interactiveBreadcrumb.current.name, nodeMap)
        this.#activeModifiers.add(active)
      }
      active.modifier.refs.add({ from, name: interactiveBreadcrumb.current.name })
      return active
    } else if (interactiveBreadcrumb?.done && active?.modifier) {
      // if the breadcrumb is done, we can remove the mapEntry
      this.deregisterModifier(active.modifier)
    }
  }

  /**
   * Registers a new active modifier.
   */
  registerModifier(from: Node, modifier: ModifierEntry): ModifierActiveEntry | undefined {
    return {
      modifier,
      interactiveBreadcrumb: modifier.breadcrumb.interactive(),
      originalFrom: from,
    }
  }

  /**
   * Removes a previously registered modifier from the active entries.
   */
  deregisterModifier(modifier: ModifierEntry): void {
    for (const { from, name } of modifier.refs) {
      const mapEntry = this.#activeEntries.get(name)
      if (mapEntry) {
        // if an entry is found, we remove it from the active set
        const active = mapEntry.get(from)
        if (active) {
          this.#activeModifiers.delete(active)
        }
        // then we remove the entry from the map
        mapEntry.delete(from)
        // if the map is empty, we remove it from the active entries map
        if (!mapEntry.size) {
          this.#activeEntries.delete(name)
        }
      }
    }
  }

  /**
   * Operates in previously registered nodes and edges in order to put
   * back in place any of the original edges that were referenced to in
   * active (ongoing) breadcrumb parsing entries that were never completed.
   *
   * This method can be used to easily rollback any pending operations
   * once the graph traversal is done.
   */
  rollbackActiveEntries(): void {
    for (const modifier of this.#activeModifiers) {
      // if the modifier has an original edge, we can put it back in place
      if (modifier.originalEdge && modifier.originalFrom) {
        modifier.originalFrom.edgesOut.set(
          modifier.originalEdge.spec.name,
          modifier.originalEdge,
        )
      }
      // then we deregister the modifier
      this.deregisterModifier(modifier.modifier)
    }
  }

  /**
   * Convenience method to instantiate and load in one call.
   * Returns undefined if the project does not have a vlt.json file,
   * otherwise returns the loaded Modifiers instance.
   */
  static maybeLoad(
    projectRoot: string,
    options: GraphModifierOptions,
  ) {
    try {
      if (!statSync(resolve(projectRoot, 'vlt.json')).isFile()) {
        return
      }
    } catch {
      return
    }
    return new GraphModifier(projectRoot, options)
  }

  /**
   * Convenience method to instantiate and load in one call.
   * Throws if called on a directory that does not have a vlt.json file.
   */
  static load(
    projectRoot: string,
    options: GraphModifierOptions,
  ) {
    return new GraphModifier(projectRoot, options)
  }
} 
