import { prerelease as semverPrerelease } from '@vltpkg/semver'
import type { ParserState } from '../types.ts'
import { removeNode, removeDanglingEdges } from './helpers.ts'

/**
 * :prerelease Pseudo-Selector will only match packages that have prerelease
 * identifiers in their version. This identifies packages like 1.0.0-alpha.1,
 * 2.0.0-beta.2, etc.
 */
export const prerelease = async (state: ParserState) => {
  for (const node of state.partial.nodes) {
    const version = node.manifest?.version
    if (!version) {
      // If there's no version, it's not a prerelease
      removeNode(state, node)
      continue
    }

    const prereleaseIdentifiers = semverPrerelease(version)
    if (!prereleaseIdentifiers || prereleaseIdentifiers.length === 0) {
      // If there are no prerelease identifiers, remove the node
      removeNode(state, node)
    }
  }

  removeDanglingEdges(state)

  return state
}