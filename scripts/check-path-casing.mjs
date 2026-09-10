/**
 * Detects repository paths and relative imports that are ambiguous on Windows.
 *
 * A Linux checkout can preserve two paths that differ only by case, while a
 * Windows checkout cannot. TypeScript can also receive the same file through
 * differently cased relative imports, so both cases are checked here.
 */
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), "..");

const ignoredDirectoryNames = new Set([
  ".git",
  ".cache",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "release",
  "tmp"
]);

const sourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const moduleExtensions = [
  ".d.cts",
  ".d.mts",
  ".d.ts",
  ".cts",
  ".css",
  ".cjs",
  ".html",
  ".jpeg",
  ".jpg",
  ".js",
  ".jsx",
  ".json",
  ".mjs",
  ".mts",
  ".png",
  ".sass",
  ".scss",
  ".svg",
  ".ts",
  ".tsx",
  ".webp"
];

const typescriptExtensionSubstitutions = new Map([
  [".cjs", [".cjs", ".cts", ".d.cts"]],
  [".js", [".js", ".jsx", ".ts", ".tsx", ".d.ts"]],
  [".jsx", [".jsx", ".tsx"]],
  [".mjs", [".mjs", ".mts", ".d.mts"]],
  [".mts", [".mts", ".d.mts"]],
  [".ts", [".ts", ".tsx", ".d.ts"]],
  [".tsx", [".tsx"]]
]);

/**
 * Scans the repository while excluding generated and dependency directories.
 *
 * @param {string} root Repository root.
 * @returns {Array<{relativePath: string, isDirectory: boolean}>} Repository entries.
 */
export function collectRepositoryEntries(root) {
  const entries = [];
  collectEntriesFromDirectory(root, "", entries);
  return entries;
}

/**
 * Groups paths that become identical when compared case-insensitively.
 *
 * @param {string[]} paths Relative repository paths.
 * @returns {string[][]} Collision groups with at least two distinct paths.
 */
export function findCaseCollisions(paths) {
  const pathsByFoldedName = new Map();

  for (const path of paths) {
    const foldedPath = foldPath(path);
    const matchingPaths = pathsByFoldedName.get(foldedPath) ?? [];
    matchingPaths.push(path);
    pathsByFoldedName.set(foldedPath, matchingPaths);
  }

  return [...pathsByFoldedName.values()]
    .filter((matchingPaths) => matchingPaths.length > 1)
    .map((matchingPaths) => matchingPaths.toSorted());
}

/**
 * Runs the complete path-casing analysis for a repository.
 *
 * @param {string} root Repository root.
 * @returns {{entries: Array, pathCollisions: string[][], importIssues: Array}} Analysis result.
 */
export function checkRepository(root) {
  const entries = collectRepositoryEntries(root);
  const pathCollisions = findCaseCollisions(entries.map((entry) => entry.relativePath));
  const importIssues = findImportCasingIssues(root, entries);

  return { entries, pathCollisions, importIssues };
}

/**
 * Recursively collects entries below one directory without following symlinks.
 *
 * @param {string} root Repository root.
 * @param {string} relativeDirectory Current relative directory.
 * @param {Array<{relativePath: string, isDirectory: boolean}>} entries Output list.
 * @returns {void}
 */
function collectEntriesFromDirectory(root, relativeDirectory, entries) {
  const absoluteDirectory = resolve(root, relativeDirectory);

  for (const directoryEntry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    if (directoryEntry.isSymbolicLink()) {
      continue;
    }

    const entryPath = normalizeRepositoryPath(join(relativeDirectory, directoryEntry.name));

    if (directoryEntry.isDirectory()) {
      if (ignoredDirectoryNames.has(directoryEntry.name)) {
        continue;
      }

      entries.push({ relativePath: entryPath, isDirectory: true });
      collectEntriesFromDirectory(root, entryPath, entries);
      continue;
    }

    if (directoryEntry.isFile()) {
      entries.push({ relativePath: entryPath, isDirectory: false });
    }
  }
}

/**
 * Finds relative imports whose resolved file uses a different path casing.
 *
 * @param {string} root Repository root.
 * @param {Array<{relativePath: string, isDirectory: boolean}>} entries Repository entries.
 * @returns {Array<{file: string, line: number, specifier: string, actualPath: string}>} Import issues.
 */
function findImportCasingIssues(root, entries) {
  const files = entries.filter((entry) => !entry.isDirectory);
  const filesByFoldedPath = indexFilesByFoldedPath(files);
  const issues = [];

  for (const file of files) {
    if (!sourceExtensions.has(getExtension(file.relativePath))) {
      continue;
    }

    const source = readFileSync(resolve(root, file.relativePath), "utf8");
    const importedFiles = typescript.preProcessFile(source, true, true).importedFiles;

    for (const importedFile of importedFiles) {
      if (!isRelativeModuleSpecifier(importedFile.fileName)) {
        continue;
      }

      const resolution = resolveRelativeModule(file.relativePath, importedFile.fileName, filesByFoldedPath);
      if (resolution === null || resolution.requestedPath === resolution.actualPath) {
        continue;
      }

      issues.push({
        file: file.relativePath,
        line: getLineNumber(source, importedFile.pos),
        specifier: importedFile.fileName,
        actualPath: resolution.actualPath
      });
    }
  }

  return deduplicateImportIssues(issues);
}

/**
 * Indexes files by their case-insensitive repository path.
 *
 * @param {Array<{relativePath: string, isDirectory: boolean}>} files Repository files.
 * @returns {Map<string, string[]>} Folded path index.
 */
function indexFilesByFoldedPath(files) {
  const filesByFoldedPath = new Map();

  for (const file of files) {
    const foldedPath = foldPath(file.relativePath);
    const matchingFiles = filesByFoldedPath.get(foldedPath) ?? [];
    matchingFiles.push(file.relativePath);
    filesByFoldedPath.set(foldedPath, matchingFiles);
  }

  return filesByFoldedPath;
}

/**
 * Resolves a relative module using case-insensitive candidates.
 *
 * @param {string} importerPath Importing file path.
 * @param {string} specifier Relative module specifier.
 * @param {Map<string, string[]>} filesByFoldedPath Folded file index.
 * @returns {{requestedPath: string, actualPath: string}|null} Resolution or null.
 */
function resolveRelativeModule(importerPath, specifier, filesByFoldedPath) {
  const cleanSpecifier = specifier.split(/[?#]/u, 1)[0];
  const requestedModulePath = normalizeModulePath(
    posix.join(posix.dirname(importerPath), cleanSpecifier)
  );

  if (requestedModulePath === null) {
    return null;
  }

  for (const candidate of createModuleCandidates(requestedModulePath)) {
    const matchingPaths = filesByFoldedPath.get(foldPath(candidate.lookupPath));
    if (matchingPaths === undefined || matchingPaths.length !== 1) {
      continue;
    }

    return {
      requestedPath: candidate.comparisonPath,
      actualPath: matchingPaths[0]
    };
  }

  return null;
}

/**
 * Creates TypeScript-style file and index candidates for a module path.
 *
 * @param {string} requestedModulePath Normalized module path without an assumed extension.
 * @returns {Array<{lookupPath: string, comparisonPath: string}>} Module candidates.
 */
function createModuleCandidates(requestedModulePath) {
  const requestedExtension = getKnownModuleExtension(requestedModulePath);
  const candidates = [];

  if (requestedExtension === null) {
    for (const extension of moduleExtensions) {
      addModuleCandidate(candidates, requestedModulePath + extension, requestedModulePath + extension);
      addModuleCandidate(
        candidates,
        posix.join(requestedModulePath, "index" + extension),
        posix.join(requestedModulePath, "index" + extension)
      );
    }

    return candidates;
  }

  addModuleCandidate(candidates, requestedModulePath, requestedModulePath);

  const substitutions = typescriptExtensionSubstitutions.get(requestedExtension) ?? [];
  for (const extension of substitutions) {
    const substitutedPath = replaceModuleExtension(requestedModulePath, requestedExtension, extension);
    addModuleCandidate(candidates, substitutedPath, substitutedPath);
  }

  return candidates;
}

/**
 * Adds a module candidate unless it was already generated.
 *
 * @param {Array<{lookupPath: string, comparisonPath: string}>} candidates Candidate list.
 * @param {string} lookupPath Folded lookup path.
 * @param {string} comparisonPath Path used to compare casing.
 * @returns {void}
 */
function addModuleCandidate(candidates, lookupPath, comparisonPath) {
  if (candidates.some((candidate) => candidate.lookupPath === lookupPath)) {
    return;
  }

  candidates.push({ lookupPath, comparisonPath });
}

/**
 * Removes duplicate diagnostics emitted by repeated preprocessing results.
 *
 * @param {Array<{file: string, line: number, specifier: string, actualPath: string}>} issues Import issues.
 * @returns {Array<{file: string, line: number, specifier: string, actualPath: string}>} Unique issues.
 */
function deduplicateImportIssues(issues) {
  const uniqueIssues = new Map();

  for (const issue of issues) {
    const key = `${issue.file}:${issue.line}:${issue.specifier}:${issue.actualPath}`;
    uniqueIssues.set(key, issue);
  }

  return [...uniqueIssues.values()].sort((left, right) => {
    return left.file.localeCompare(right.file) || left.line - right.line;
  });
}

/**
 * Returns the one-based source line containing a character position.
 *
 * @param {string} source Source contents.
 * @param {number} position Character position.
 * @returns {number} One-based line number.
 */
function getLineNumber(source, position) {
  return source.slice(0, position).split("\n").length;
}

/**
 * Checks whether a module specifier can refer to a repository-relative path.
 *
 * @param {string} specifier Module specifier.
 * @returns {boolean} Whether the specifier is relative.
 */
function isRelativeModuleSpecifier(specifier) {
  return specifier === "." || specifier === ".." || specifier.startsWith("./") || specifier.startsWith("../");
}

/**
 * Returns a known module extension, preferring compound declarations.
 *
 * @param {string} path Repository path.
 * @returns {string|null} Known extension or null.
 */
function getKnownModuleExtension(path) {
  const lowercasePath = path.toLowerCase();
  return moduleExtensions.find((extension) => lowercasePath.endsWith(extension)) ?? null;
}

/**
 * Replaces a known module extension while preserving the rest of the path.
 *
 * @param {string} path Module path.
 * @param {string} currentExtension Current extension.
 * @param {string} replacementExtension Replacement extension.
 * @returns {string} Path with the replacement extension.
 */
function replaceModuleExtension(path, currentExtension, replacementExtension) {
  return path.slice(0, -currentExtension.length) + replacementExtension;
}

/**
 * Normalizes a filesystem path to the repository's slash-separated form.
 *
 * @param {string} path Filesystem path.
 * @returns {string} Normalized repository path.
 */
function normalizeRepositoryPath(path) {
  return path.split(/[\\/]/u).filter((part) => part.length > 0).join("/");
}

/**
 * Normalizes a module path and rejects paths that leave the repository root.
 *
 * @param {string} path Candidate module path.
 * @returns {string|null} Normalized relative path or null.
 */
function normalizeModulePath(path) {
  const normalizedPath = posix.normalize(path.replaceAll("\\", "/"));
  if (normalizedPath === "." || normalizedPath === ".." || normalizedPath.startsWith("../")) {
    return null;
  }

  return normalizedPath.startsWith("/") ? null : normalizedPath;
}

/**
 * Folds a repository path using Unicode normalization and lowercase casing.
 *
 * @param {string} path Repository path.
 * @returns {string} Case-insensitive comparison key.
 */
function foldPath(path) {
  return normalizeRepositoryPath(path).normalize("NFC").toLowerCase();
}

/**
 * Returns a lowercase extension for a path.
 *
 * @param {string} path Repository path.
 * @returns {string} Lowercase extension, or an empty string.
 */
function getExtension(path) {
  const lastSegment = path.slice(path.lastIndexOf("/") + 1);
  const extensionStart = lastSegment.lastIndexOf(".");
  return extensionStart <= 0 ? "" : lastSegment.slice(extensionStart).toLowerCase();
}

/**
 * Formats and runs the command-line check.
 *
 * @param {string[]} argumentsList Command-line arguments.
 * @returns {number} Process exit code.
 */
export function runPathCasingCheck(argumentsList = []) {
  const root = parseRootArgument(argumentsList);
  const result = checkRepository(root);

  if (result.pathCollisions.length === 0 && result.importIssues.length === 0) {
    console.log(
      `Path casing check passed (${result.entries.length} repository entries, ` +
        `${result.importIssues.length} import issues).`
    );
    return 0;
  }

  console.error("Path casing check failed.");

  for (const collision of result.pathCollisions) {
    console.error("\nPaths differ only by case:");
    for (const path of collision) {
      console.error(`  - ${path}`);
    }
  }

  for (const issue of result.importIssues) {
    console.error(
      `\n${issue.file}:${issue.line}: import "${issue.specifier}" resolves to ` +
        `"${issue.actualPath}" with different casing.`
    );
  }

  return 1;
}

/**
 * Parses the optional repository root argument.
 *
 * @param {string[]} argumentsList Command-line arguments.
 * @returns {string} Repository root.
 */
function parseRootArgument(argumentsList) {
  if (argumentsList.length === 0) {
    return repositoryRoot;
  }

  if (argumentsList.length === 2 && argumentsList[0] === "--root") {
    return resolve(argumentsList[1]);
  }

  throw new Error("Usage: node scripts/check-path-casing.mjs [--root <repository-root>]");
}

const isDirectExecution = process.argv[1] !== undefined && resolve(process.argv[1]) === scriptPath;
if (isDirectExecution) {
  try {
    process.exitCode = runPathCasingCheck(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
