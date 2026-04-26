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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPosixPath(value) {
  return value.replace(/\\/g, "/");
}
