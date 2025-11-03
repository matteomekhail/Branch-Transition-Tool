#!/usr/bin/env bun

import { $ } from "bun";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";

// Repository URL
const REPO_URL = "https://github.com/testpointcorp/vansah-jirapluginapp";

// Colors for output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function error(message: string) {
  log(`❌ Error: ${message}`, colors.red);
}

function success(message: string) {
  log(`✅ ${message}`, colors.green);
}

function info(message: string) {
  log(`ℹ️  ${message}`, colors.cyan);
}

function warning(message: string) {
  log(`⚠️  ${message}`, colors.yellow);
}

// Temporary directory for clone
const TEMP_DIR = join(process.cwd(), ".git-temp-clone");

// Cleanup temporary files
async function cleanup() {
  try {
    if (existsSync(TEMP_DIR)) {
      info("Cleaning up temporary files...");
      await $`rm -rf ${TEMP_DIR}`;
    }
  } catch (e) {
    warning("Unable to clean temporary files");
  }
}

// Handle interruption
process.on("SIGINT", async () => {
  console.log("\n");
  warning("Operation interrupted by user");
  await cleanup();
  process.exit(130);
});

// Search for branch in active remote branches
async function findActiveBranch(branchName: string): Promise<string | null> {
  try {
    info(`Searching for branch "${branchName}" in active remote branches...`);
    
    const result = await $`git ls-remote --heads ${REPO_URL}`.text();
    const lines = result.trim().split("\n");
    
    for (const line of lines) {
      if (line.includes(`refs/heads/${branchName}`)) {
        const commitHash = line.split("\t")[0];
        success(`Active branch found! Commit: ${commitHash.substring(0, 8)}`);
        return commitHash;
      }
    }
    
    warning(`Branch "${branchName}" not found in active branches`);
    return null;
  } catch (e) {
    error("Unable to retrieve remote branches");
    throw e;
  }
}

// Search for branch in commit history (deleted branches)
async function findBranchInHistory(branchName: string): Promise<string | null> {
  try {
    info(`Searching for branch "${branchName}" in commit history...`);
    
    // Shallow clone of repository
    info("Cloning repository...");
    await $`git clone --depth=1000 ${REPO_URL} ${TEMP_DIR}`;
    
    // Search in commit messages
    info("Analyzing commit history...");
    const result = await $`git -C ${TEMP_DIR} log --all --oneline --grep=${branchName}`.text();
    
    if (result.trim()) {
      const firstLine = result.trim().split("\n")[0];
      const commitHash = firstLine.split(" ")[0];
      success(`Branch found in history! Commit: ${commitHash}`);
      return commitHash;
    }
    
    // Search in merge commits
    info("Searching in merge commits...");
    const mergeResult = await $`git -C ${TEMP_DIR} log --all --merges --oneline --grep=${branchName}`.text();
    
    if (mergeResult.trim()) {
      const firstLine = mergeResult.trim().split("\n")[0];
      const commitHash = firstLine.split(" ")[0];
      success(`Branch found via merge commit! Commit: ${commitHash}`);
      return commitHash;
    }
    
    // Search for pattern in branch name in ref logs if available
    try {
      const reflogResult = await $`git -C ${TEMP_DIR} log --all --oneline`.text();
      const lines = reflogResult.split("\n");
      
      for (const line of lines) {
        if (line.toLowerCase().includes(branchName.toLowerCase())) {
          const commitHash = line.split(" ")[0];
          success(`Branch found via pattern search! Commit: ${commitHash}`);
          return commitHash;
        }
      }
    } catch (e) {
      // Reflog not available, continue
    }
    
    warning(`Branch "${branchName}" not found in history`);
    return null;
  } catch (e: any) {
    error(`Error while searching in history: ${e.message}`);
    throw e;
  }
}

// Find the original branch commit (handles merge commits)
async function findOriginalBranchCommit(commitHash: string): Promise<string> {
  try {
    info("Checking if the commit is a merge commit...");
    
    const parents = await $`git -C ${TEMP_DIR} rev-list --parents -n 1 ${commitHash}`.text();
    const parentCommits = parents.trim().split(" ");
    
    if (parentCommits.length > 2) {
      // It's a merge commit, take the second parent (the merged branch)
      const branchCommit = parentCommits[2];
      info(`Merge commit detected, using branch commit: ${branchCommit.substring(0, 8)}`);
      return branchCommit;
    }
    
    return commitHash;
  } catch (e) {
    // If there's an error, use the original commit
    return commitHash;
  }
}

// Find the base commit (where the branch separated from main/master)
async function findBaseCommit(branchCommit: string): Promise<string> {
  try {
    // Fetch main/master branch for reference
    try {
      await $`git -C ${TEMP_DIR} fetch origin main`;
      const baseCommit = await $`git -C ${TEMP_DIR} merge-base ${branchCommit} origin/main`.text();
      return baseCommit.trim();
    } catch (e) {
      // Try with master
      await $`git -C ${TEMP_DIR} fetch origin master`;
      const baseCommit = await $`git -C ${TEMP_DIR} merge-base ${branchCommit} origin/master`.text();
      return baseCommit.trim();
    }
  } catch (e) {
    warning("Unable to determine base commit, using parent commit");
    const parent = await $`git -C ${TEMP_DIR} rev-parse ${branchCommit}^`.text();
    return parent.trim();
  }
}

// Extract complete diff with metadata
async function extractPatch(branchName: string, branchCommit: string): Promise<string> {
  try {
    info("Extracting complete diff with metadata...");
    
    // Find base commit
    const baseCommit = await findBaseCommit(branchCommit);
    info(`Base commit: ${baseCommit.substring(0, 8)}`);
    
    // Generate patch with format-patch to get all metadata
    info("Generating patch file...");
    
    // Get commit information in the branch
    const commitLog = await $`git -C ${TEMP_DIR} log --pretty=format:"Author: %an <%ae>%nDate: %ad%nCommit: %H%n%n%s%n%n%b%n" --date=iso ${baseCommit}..${branchCommit}`.text();
    
    // Get complete diff
    const diff = await $`git -C ${TEMP_DIR} diff ${baseCommit}..${branchCommit}`.text();
    
    // Compose complete patch file
    const patchContent = `Branch: ${branchName}
Repository: ${REPO_URL}
Base Commit: ${baseCommit}
Branch Commit: ${branchCommit}
Generated: ${new Date().toISOString()}

================================================================================
COMMIT HISTORY
================================================================================

${commitLog}

================================================================================
DIFF
================================================================================

${diff}`;
    
    return patchContent;
  } catch (e: any) {
    error(`Unable to extract patch: ${e.message}`);
    throw e;
  }
}

// Main function
async function main() {
  // Verify arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    error("Branch name not provided");
    console.log("\nUsage: bun run extract-branch-changes.ts <branch-name>");
    console.log("Example: bun run extract-branch-changes.ts VANS-5501\n");
    process.exit(1);
  }
  
  const branchName = args[0];
  const outputFile = join(process.cwd(), `${branchName}-all-changes.patch`);
  
  log(`\n${"=".repeat(70)}`, colors.blue);
  log("Branch Transition Tool - Git Changes Extraction", colors.blue);
  log(`${"=".repeat(70)}\n`, colors.blue);
  
  info(`Branch: ${branchName}`);
  info(`Repository: ${REPO_URL}`);
  info(`Output: ${outputFile}\n`);
  
  try {
    // Preventive cleanup
    await cleanup();
    
    // Search for branch in active branches
    let commitHash = await findActiveBranch(branchName);
    
    // If not found, search in history
    if (!commitHash) {
      commitHash = await findBranchInHistory(branchName);
    }
    
    if (!commitHash) {
      error(`Branch "${branchName}" not found in either active branches or history`);
      console.log("\nSuggestions:");
      console.log("- Verify that the branch name is correct");
      console.log("- Make sure the branch exists in the repository");
      console.log("- If the branch was deleted long ago, it might not be in the history anymore\n");
      await cleanup();
      process.exit(1);
    }
    
    // If needed, clone the repository (if we haven't done it yet)
    if (!existsSync(TEMP_DIR)) {
      info("Cloning repository for patch extraction...");
      await $`git clone --depth=1000 ${REPO_URL} ${TEMP_DIR}`;
    }
    
    // Fetch specific commit if needed
    try {
      await $`git -C ${TEMP_DIR} fetch origin ${commitHash!}`;
    } catch (e) {
      // The commit might already be present
    }
    
    // Find the original branch commit (handles merge commits)
    const originalCommit = await findOriginalBranchCommit(commitHash!);
    
    // Extract the patch
    const patchContent = await extractPatch(branchName, originalCommit);
    
    // Save the file
    info(`Saving patch file: ${outputFile}`);
    await Bun.write(outputFile, patchContent);
    
    // Statistics
    const lines = patchContent.split("\n").length;
    const size = (patchContent.length / 1024).toFixed(2);
    
    console.log("");
    success("Patch extracted successfully!");
    log(`\n${"=".repeat(70)}`, colors.green);
    log("STATISTICS", colors.green);
    log(`${"=".repeat(70)}`, colors.green);
    console.log(`Lines: ${lines}`);
    console.log(`Size: ${size} KB`);
    console.log(`File: ${outputFile}`);
    log(`${"=".repeat(70)}\n`, colors.green);
    
    // Final cleanup
    await cleanup();
    
  } catch (e: any) {
    console.log("");
    error(`Operation failed: ${e.message}`);
    await cleanup();
    process.exit(1);
  }
}

// Run the program
main();

