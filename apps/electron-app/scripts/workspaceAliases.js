/**
 * Resolves workspace package imports to local source files during development builds.
 */
import path from "node:path";

const WORKSPACE_PACKAGES = [
  {
    name: "@open-codex-ui/codex-rpc",
    packageDir: "packages/codex-rpc"
  },
  {
    name: "@open-codex-ui/opencodex-core",
    packageDir: "packages/opencodex-core"
  },
  {
    name: "@open-codex-ui/opencodex-protocol",
    packageDir: "packages/opencodex-protocol"
  },
  {
    name: "@open-codex-ui/opencodex-ui",
    packageDir: "packages/opencodex-ui"
  }
];

/**
 * Creates Vite aliases that point workspace package imports to their source entry points.
 *
 * @param repoRoot Repository root used to resolve workspace package locations.
 * @returns Array of alias entries compatible with Vite resolution.
 */
export function createWorkspaceAliases(repoRoot) {
  return WORKSPACE_PACKAGES.flatMap((workspacePackage) => {
    const packageRoot = path.resolve(repoRoot, workspacePackage.packageDir);
    const exactImport = new RegExp(`^${escapeRegExp(workspacePackage.name)}$`);
    const subpathImport = new RegExp(`^${escapeRegExp(workspacePackage.name)}/(.*)$`);

    return [
      {
        find: exactImport,
        replacement: toPosixPath(path.join(packageRoot, "src", "index.ts"))
      },
      {
        find: subpathImport,
        replacement: `${toPosixPath(packageRoot)}/$1`
      }
    ];
  });
}

/**
 * Creates an esbuild resolver for workspace package imports.
 *
 * @param repoRoot Repository root used to resolve workspace package locations.
 * @returns esbuild plugin descriptor that maps workspace imports to source files.
 */
export function createWorkspaceResolvePlugin(repoRoot) {
  const packages = WORKSPACE_PACKAGES.map((workspacePackage) => {
    return {
      name: workspacePackage.name,
      packageRoot: path.resolve(repoRoot, workspacePackage.packageDir)
    };
  });

  return {
    name: "workspace-alias",
    setup(build) {
      build.onResolve({ filter: /^@open-codex-ui\// }, (args) => {
        for (const workspacePackage of packages) {
          if (args.path === workspacePackage.name) {
            return {
              path: path.join(workspacePackage.packageRoot, "src", "index.ts")
            };
          }

          const prefix = `${workspacePackage.name}/`;
          if (args.path.startsWith(prefix)) {
            return {
              path: path.join(workspacePackage.packageRoot, args.path.slice(prefix.length))
            };
          }
        }

        return undefined;
      });
    }
  };
}

/**
 * Escapes a string so it can be safely embedded in a regular expression.
 *
 * @param value Raw string to escape.
 * @returns Escaped string safe to inject into a `RegExp`.
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalizes Windows paths into POSIX-style paths for bundler configuration.
 *
 * @param value Filesystem path to normalize.
 * @returns Path string that uses forward slashes.
 */
function toPosixPath(value) {
  return value.replace(/\\/g, "/");
}
