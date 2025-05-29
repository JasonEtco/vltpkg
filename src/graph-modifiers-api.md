# Graph Modifiers API

A common API that enables multiple of the previous-gen package managers capabilities such as:

- Overrides / Resolutions
- Package Extensions
- Catalogs
- Outdated / Update dependencies
- Patch

and introduces some new concepts like Policies. Making extensive usage of the Dependency Selector Syntax as its user-facing API.

## Motivation

The vlt client needs to be a capable tool that can satisfy power user requirements like customization of a given graph resolution.
By leveraging the Dependency Selector Syntax as its end-user facing API the client takes advantage of the robustness of the query language to provide fine-grain control to its graph install to advanced users.

### Overrides / Resolutions:

Being able to replace dependencies declarations of a given dependency helps end-users getting around problems in their current install graph. Some common examples are:

- Replacing a transitive dependency that has known security issues
- Enforcing usage of a unique package version across the install
- Updating dependencies of a direct (or transitive) abandoned dependency
- Forcing the downgrade of a specific package version that would otherwise be satisfied by a greater, spec-fulfilling version

**Refs:**

- npm Overrides: https://docs.npmjs.com/cli/v10/configuring-npm/package-json?v=true#overrides
- pnpm Overrides: https://pnpm.io/settings#overrides
- yarn Resolutions: https://classic.yarnpkg.com/lang/en/docs/selective-version-resolutions/

### Package Extensions

Adding dependency declarations to a dependency can help end-users fixing some specific categories of errors, such as:

- Declaring missing peer-dependencies to a given package
- Defining a peer-dependency as optional
- Fixing missing dependencies in general

Refs:

- Yarn extensions database (serves as a good repository of real-life problems end-users are patching with this feature): https://github.com/yarnpkg/berry/blob/master/packages/yarnpkg-extensions/sources/index.ts
- pnpm Package Extensions: https://pnpm.io/settings#packageextensions

### Catalogs

Offering a manual way for the end-user to manage versions of selected packages, the Catalog feature focuses on making it easier to manage single package/version combinations in monorepos. A custom spec is available to users so that value can be used in `package.json` files instead, it particularly fixes:

- Enforcing usage of a unique package version across the install
- Providing a concise DX to updating multiple usages of a package to a unique version range
- Helps with avoiding merge conflicts across `package.json` files in a monorepo

**Refs:**

- pnpm Catalogs: https://pnpm.io/catalogs
- Unofficial Yarn catalogs plugin: https://github.com/toss/yarn-plugin-catalogs
- syncpack (monorepo-focused user-land tool in the same problem space): https://github.com/JamieMason/syncpack

### Update Dependencies

All package managers typically offer some DX around updating dependencies that can be safely upgraded due to the nature of semver-version usage across transitive dependencies. 

**Listing outdated dependencies**

All package managers offer a way of listing outdated dependencies, generally defaulting to only direct dependencies but allowing for listing transitive dependencies. Usually showing a table consisting of package names and its current vs latest available versions.

**Executing on a Update operation**

**pnpm** allows for filtered updates, supporting a positional argument that can be defining a namespace or a package name to ignore, while **npm** only accepts a list of names of packages to update via a positional argument in order to filter the update process. By default both package managers will reinstall, ignoring lockfiles, installing the latest version that satisfies the semver ranges defined in the `package.json` file.

**Interactivity**

**Yarn v1** provides support to a `yarn upgrade-interactive` command that enables the end-user the ability to list outdated dependencies and update via an interactive terminal experience, **pnpm** also has support to a `pnpm up -i` , similar behavior can also be found in user-land-packages such as **taze** and **npm-check-updates**.

**Refs:**

- npm outdated: https://docs.npmjs.com/cli/v11/commands/npm-update
- pnpm outdated: https://pnpm.io/cli/outdated
- yarn outdated: https://classic.yarnpkg.com/en/docs/cli/outdated
- npm update: https://docs.npmjs.com/cli/v11/commands/npm-update
- pnpm update: https://pnpm.io/cli/update
- yarn upgrade-interactive: https://classic.yarnpkg.com/lang/en/docs/cli/upgrade-interactive/
- taze: https://github.com/antfu-collective/taze
- npm-check-updates: https://github.com/raineorshine/npm-check-updates

### Patch

Both pnpm & yarn provide ways of patching up reified files on disks in order to provide a mechanism to handling quick patches to transitive dependencies in a way that can be shared across the team unlike hacking the `node_modules` folder would provide.

**Refs:**

- pnpm patch: https://pnpm.io/cli/patch
- yarn patch: https://yarnpkg.com/cli/patch
- patch-package user-land module: https://www.npmjs.com/package/patch-package
- deno patch: https://docs.deno.com/runtime/fundamentals/modules/#overriding-local-jsr-packages

## Detailed explanation

### Overrides & Package Extensions

Add a new feature set to the **vlt client** that, in its aggregate, is referred to as **Graph Modifiers**. It adds the ability for users to modify a realized ideal Graph using configuration defined in their main project’s `package.json` file.

The configuration is defined in a `"modifiers"` key that takes an object, in which each key is a new query, to be parsed by our Dependency Selector Syntax library `@vltpkg/query` defining either node manifest modifiers (similar to Package Extensions) or edge modifiers (similar to overrides).

At the end of the Graph build ideal phase, these modifiers are going to be applied to the given ideal graph and once fully realized (traverse each node and edge, making sure to add any new dependencies) a new query search is done in this new graph, validating that all user-defined queries are either applied or no longer relevant. If validation is successful the install can proceed to reify this new graph, otherwise an `EMODIFIER` error is then thrown.

Some cons of this chosen approach are:

1. Possibly duplicating the number manifests loaded for replaced packages
    1. Unlikely to be a major issue since modifiers are not the primary way of driving / managing dependencies in a project and in situations like replacing the same package for a different version the packument already in memory can be reused.
2. Inability to solve cases in which new matches of a given selector happens
    1. This is solved by running a second `Query.search` that validates that all user-defined queries were either applied to the resulting nodes & edges or are no longer relevant (have no results).

When installing from a lockfile or when an actual graph is already in place (`node_modules`) then the modifiers will only apply if the user also provides new direct dependencies to add to the graph as arguments in the client, otherwise modifiers are ignored. With that in mind, a potential `vlt ci` command should also ignore modifiers, which makes it avoid non-deterministic hazards while also avoiding performance issues.

### Policies

The Policies API is a feature that makes the **vlt client** be able to gate and output extra information based on a user-defined query prior to executing client commands such as `install`, `run`,`exec-local` and `exec`.

The possible Policies actions (types) are either to `error` (prevent action, prints to stderr), `warn` (prints to stderr) or `info` (prints to stdout).

### Catalogs

For now **Catalogs** features can be supplemented by modifiers that affect workspaces to add or replace dependency definitions. The decision is to not implement specific catalogs features similar to the supported by pnpm in the scope of this work but this does not rule out implementing such features in the future.

### Patches

Ruled out of scope for this body of work since the only overlapping part is the usage of the Dependency Selector Syntax for its configuration.

### Update Dependencies

Also out of scope, similar to **Patches,** the overlapping part is the potential usage of the Dependency Selector Syntax as the argument that a potential future `vlt update` command uses.

The research work that is part of the Motivation section above can also be used in future work on how to improve interactive outdated & update experiences in the client.

## Alternatives

1. Do not use our Dependency Selector Syntax for all or some of these features
    1. It has been validated with conversations between the team that we do want to have a concise and unified syntax for these features that expand the usage of our powerful query language.
2. Follow pnpm’s lead in the various implementations
3. Do not provide any ability to modify a graph resolution
4. Apply modifiers during the Graph build ideal phase
    1. This option has been ruled out since building the ideal graph is a hot path for the install and running `Query.search` on every new appended node is going to run into very difficult to solve performance problems.
    2. This option is not ideal since it requires defining a sub set of the Query Language that limits a lot the power of queries while also creates more friction to the end user that has to learn about and be aware of this valid subset.

## Implementation

### Query

Given the possible conflicting nature of queries, we’ll need to implement support to selector specificity. This way we can know what value should apply in case of multiple queries matching an Edge or a Node manifest dependency.

To implement specificity we’ll only need to track 2 different counters: one for id selectors found and one for pseudo-selectors & attribute selectors. Note that combinators (such as `*` and `>` ) should not add to specificity and in reference material it’s also noted that the pseudo-selector with nested elements (e.g: `:not()` , `:is()` and `:has()`) should not add to specificity.

Refs:

- https://css-tricks.com/specifics-on-css-specificity/
- https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascade/Specificity

### User-facing syntax & UX

From the user point of view, all of the configuration and management of the graph modifier API features happens at the `package.json` file. Future work may implement new user interfaces to manage this configuration from both the cli and GUI client but that is out of scope of the implementation described here.

**The modifiers key**

To configure overrides and package extensions, a new object defined using the `"modifiers"` property of the `package.json` file, e.g:

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "modifiers": {
    ...
  }
}
```

**Setting Edge Modifiers**

Edge modifiers are the equivalent of the Overrides feature, they are applied when a string value is used in the modifiers object, e.g:

```json
{
  "dependencies": {
    "a": "^1.0.0",
  },
  "modifiers": {
    ":root > #a > #b": "^1.0.0"
  }
}
```

In case of conflicting results among multiple queries, selector specificity is then used to define which one applies to a given edge:

```json
{
  "dependencies": {
    "a": "^1.0.0"
  },
  "modifiers": {
    ":root > #a > #b": "1",
    ":root #b": "2"
  }
}
```

Setting a specific version value for a given peer dependency:

```json
{
  "modifiers": {
    "#react:peer": "^19"
  }
}
```

Set my entire graph to be using the latest versions of every single dependency:

```json
{
  "modifiers": {
    "*": "latest"
  }
}
```

**Setting Node modifiers**

Node modifiers are the equivalent to Package extensions, they can be configured using an object as the value defined from the query key, e.g:

```json
{
  "dependencies": {
    "a": "^1.0.0",
  },
  "modifiers": {
    ":root > #a": {
      "dependencies": {
        "c": "^1.0.0"
      }
    }
  }
}
```

The node modifiers allow for changing any keys in the selected nodes manifests. It works by merging the values defined in the modifier object with those in the manifest already loaded in memory.

```json
{
  "modifiers": {
    "#react": {
      "scripts": {
        "prepare": "echo react"
      },
      "engines": {
        "node": ">=24"
      },
      "keywords": []
    }
  }
}
```

It’s also possible to replicate the edge modifier behaviour using a known dependency name, e.g:

```json
{
  "modifiers": {	  
    ":has(#astro)": {
	    "dependencies": {
	      "astro": "7"
	    }
	  }
  }
}
```

Supplementing **Catalogs** functionality:

```json
{
  "modifiers": {
    ":workspace": {
      "devDependencies": {
        "eslint": "^19",
      }
    },
    "#a:workspace": {
      "dependency": {
        "react": "^19"
      }
    }
  }
}
```

**Setting Policies**

Policies can be defined in the `package.json` file in two forms:

- A short-form in which it takes a string that is one of the valid types (meaning that any resulting returned by that `Query.search` is going to trigger the action described by the defined type.
- A object form that accepts two keys, a `"type"` that defines one of the valid action types and a `"expect-results"` that allows the user to customize when the action should occur.

```json
{
  "policies": {
    ":severity(<=3)": "warn",
    ":workspace": {
      "type": "warn",
      "expect-results": "<=10"
    },
    "#react": {
      "type": "error",
      "expect-results": "1"
    }
  }
}
```

### Graph modifier API

Changes at different locations of the graph module are required to support the different features.

- Add support to `package.json` based config to enable query-defined modifiers & custom policies
    - Add new `Modifiers` & `Policies` keys & types to a new `ProjectManifest` type in `@vltpkg/types` that extends the base `Manifest` type.
        - If a given `Modifier` value is of type `string` then it should operate on edges, replacing that edge `spec` value by the provided value.
        - If the `Modifier` value is an object, then it should extend the current `Manifest` by merging objects and any conflicting keys taking the value defined in the `Modifier`
- Implement new logic that is able to modify nodes manifests and edge specs in a given graph
    - this new API operates after the graph build ideal phase, applying modifications to nodes and edges running a validation step afterwards
    - first step is to run `Query.search` on all the query string used as a key in the `ProjectManifest`
    - the resulting matrix is now in-memory, e.g:
    
    | query keys | query values | resulting nodes | resulting edges | specificity |
    | --- | --- | --- | --- | --- |
    | :root > #a > #b | “1” |  | a-b | (2, 1) |
    | :root > :not(#a) #b | “2” |  | c-b | (2, 1) |
    | #b | { “d10s”: { “r”: “18” }, “foo”: 1 } | b |  | (1, 0) |
    | * | { “d10s”: { “r”: “17” }, “foo”: 0 } | a, ~~b~~, c |  | (0, 0) |
    - queries are then sorted by descending specificity order
    - resulting nodes from queries that have a `string` value are excluded
    - resulting edges from queries that have an `object` value are excluded
    - in the remaining items, any seen node or edge is also excluded from the results
    - for every selected node that is resulting from a object-defined modifier, its manifest is then changed to be a new object, resulting of the merging of the original manifest and the configured `Modifier` value
    - dependency-defining key/value pairs (`”dependencies”`, `"devDependencies"`, `"optionalDependencies"`, `"peerDependencies"`) from this new manifest are parsed and any missing edge is created and existing edge spec values are replaced if found UNLESS an edge that is also part of the result returned by `Query.search` is found, then it’s skipped
    - next we walk the edge results and update any selected edge with the value defined in its query value
    - any edge created or changed by a query value object or any edge spec changed by a query value string are collected in to a `modifiedEdges` set
    - then we resolve the ideal graph again, by iterating on the list of `modifiedEdges` and applying the same logic from `appendNodes` on each modified edge.
    - Run `Graph.gc`
    - Rerun the original queries (keys) defined in the modifiers to validate values using the `Query.search` method:
        - if there are no returned nodes or edges for any given key OR any matching node or edge match the values defined in modifiers:
            - proceeds to reify
            - otherwise it should throw an `EMODIFIER` error containing the failing query key along with information on the nodes or edges that contain mismatching values

### Policies API

Implement a Policies API that is able to gate and output extra information based on a query prior to executing the following commands:

- `install` (post load-ideal, prior to reify)
- `run` (post load-actual, prior to running scripts)
- `exec-local` (post load-actual, prior to running scripts)
- `exec` (post load-ideal, prior to reify)

Possible Policies actions (types) are:

- `error`
- `warn`
- `info`

A `Policy`entry can define a `"expect-results"` property, that value has to match the number of items returned by the query search, otherwise we take the action defined as type, by default the `"expect-results"` value is `0` .

The `"expect-results"` property mimics its cli option counterpart and enables use cases such as validating that a peer dependency only has a single match in the install graph:

```json
{
  "policies": {
    "#react:peer": {
      "type": "error",
      "expect-results": "1"
    }
  }
}
```

Or define that a given project may never have more than 10 defined workspaces:

```json
{
  "policies": {
    ":workspaces": {
      "type": "error",
      "expect-results": "<=10"
  }
}
```

- Refs: https://github.com/npm/rfcs/issues/685
- Refs: https://github.com/npm/rfcs/pull/637
