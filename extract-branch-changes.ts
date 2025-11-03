#!/usr/bin/env bun

import { $ } from "bun";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";

// Repository URL
const REPO_URL = "https://github.com/testpointcorp/vansah-jirapluginapp";

// Get the default branch of the repository
async function getDefaultBranch(): Promise<string> {
  try {
    const result = await $`git ls-remote --symref ${REPO_URL} HEAD`.text();
    const match = result.match(/ref: refs\/heads\/(\S+)/);
    if (match) {
      const defaultBranch = match[1];
      info(`Default branch: ${defaultBranch}`);
      return defaultBranch;
    }
  } catch (e) {
    // Fallback to common defaults
  }
  // Try common defaults in order
  return "main";
}

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
    
    // Clone repository with sufficient depth
    info("Cloning repository...");
    const defaultBranch = await getDefaultBranch();
    try {
      await $`git clone --depth=5000 --branch=${defaultBranch} ${REPO_URL} ${TEMP_DIR}`;
    } catch (e) {
      await $`git clone --depth=5000 ${REPO_URL} ${TEMP_DIR}`;
    }
    
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

// Find the base commit (where the branch separated from default branch)
async function findBaseCommit(branchCommit: string): Promise<string> {
  try {
    const defaultBranch = await getDefaultBranch();
    
    // Try to find merge-base with default branch
    try {
      const baseCommit = await $`git -C ${TEMP_DIR} merge-base ${branchCommit} origin/${defaultBranch}`.text();
      return baseCommit.trim();
    } catch (e) {
      // Try with HEAD
      try {
        const baseCommit = await $`git -C ${TEMP_DIR} merge-base ${branchCommit} HEAD`.text();
        return baseCommit.trim();
      } catch (e2) {
        // Try finding the first commit in the branch by going back through parents
        info("Using alternative method to find base commit...");
        const allCommits = await $`git -C ${TEMP_DIR} rev-list ${branchCommit}`.text();
        const commits = allCommits.trim().split("\n");
        // Return the parent of the oldest commit in this branch
        if (commits.length > 1) {
          return commits[commits.length - 2]; // Parent of the first commit
        }
        throw new Error("Could not determine base commit");
      }
    }
  } catch (e) {
    warning("Unable to determine base commit, using parent commit");
    try {
      const parent = await $`git -C ${TEMP_DIR} rev-parse ${branchCommit}^`.text();
      return parent.trim();
    } catch (e2) {
      // If even parent fails, this is the first commit
      warning("Branch appears to have no parent, showing all changes");
      return "4b825dc642cb6eb9a060e54bf8d69288fbee4904"; // Git empty tree
    }
  }
}

// Extract complete diff with metadata
async function extractPatch(branchName: string, branchRef: string, branchCommit: string): Promise<string> {
  try {
    info("Extracting complete diff with metadata...");
    
    // Find base commit using the branch reference
    let baseCommit = await findBaseCommit(branchRef);
    info(`Base commit: ${baseCommit.substring(0, 8)}`);
    info(`Branch reference: ${branchRef}`);
    
    // Check if base commit equals branch commit (already merged case)
    const branchCommitFull = await $`git -C ${TEMP_DIR} rev-parse ${branchRef}`.text();
    const baseCommitFull = await $`git -C ${TEMP_DIR} rev-parse ${baseCommit}`.text();
    
    if (branchCommitFull.trim() === baseCommitFull.trim()) {
      warning("Branch appears to be already merged. Using alternative method...");
      // Find the first merge commit or use last N commits
      try {
        // Get all commits in the branch (first-parent only for linear history)
        const allCommits = await $`git -C ${TEMP_DIR} log --first-parent --oneline ${branchRef}`.text();
        const commits = allCommits.trim().split("\n");
        info(`Branch has ${commits.length} commits in first-parent history`);
        
        // Use a heuristic: find the first merge commit or take up to 50 commits
        let commitLimit = Math.min(50, commits.length);
        for (let i = 0; i < commits.length && i < 100; i++) {
          const commit = commits[i].split(" ")[0];
          const parents = await $`git -C ${TEMP_DIR} rev-list --parents -n 1 ${commit}`.text();
          if (parents.trim().split(" ").length > 2) {
            // Found a merge commit, use the commit before it
            commitLimit = i;
            break;
          }
        }
        
        if (commitLimit > 0 && commitLimit < commits.length) {
          baseCommit = commits[commitLimit].split(" ")[0];
          info(`Using commit ${commitLimit} as base: ${baseCommit}`);
        }
      } catch (e) {
        warning("Could not determine branch start point");
      }
    }
    
    // Generate patch with format-patch to get all metadata
    info("Generating patch file...");
    
    // Count commits in the branch
    const commitCount = await $`git -C ${TEMP_DIR} rev-list --count ${baseCommit}..${branchRef}`.text();
    info(`Found ${commitCount.trim()} commit(s) in the branch`);
    
    // Get commit information in the branch
    const commitLog = await $`git -C ${TEMP_DIR} log --pretty=format:"Author: %an <%ae>%nDate: %ad%nCommit: %H%n%n%s%n%n%b%n" --date=iso ${baseCommit}..${branchRef}`.text();
    
    // Get complete diff
    const diff = await $`git -C ${TEMP_DIR} diff ${baseCommit}..${branchRef}`.text();
    
    // Get stats about changes
    const stats = await $`git -C ${TEMP_DIR} diff --stat ${baseCommit}..${branchRef}`.text();
    
    // Compose complete patch file
    const patchContent = `Branch: ${branchName}
Repository: ${REPO_URL}
Base Commit: ${baseCommit}
Branch Commit: ${branchCommit}
Total Commits: ${commitCount.trim()}
Generated: ${new Date().toISOString()}

================================================================================
COMMIT HISTORY
================================================================================

${commitLog}

================================================================================
STATISTICS
================================================================================

${stats}

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
    
    // Track if branch is active (not deleted)
    const isActiveBranch = commitHash !== null;
    
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
      const defaultBranch = await getDefaultBranch();
      try {
        await $`git clone --depth=5000 --branch=${defaultBranch} ${REPO_URL} ${TEMP_DIR}`;
      } catch (e) {
        await $`git clone --depth=5000 ${REPO_URL} ${TEMP_DIR}`;
      }
    }
    
    // Fetch the complete branch history (not just the commit)
    if (isActiveBranch) {
      info(`Fetching complete branch history for "${branchName}"...`);
      try {
        // Fetch the branch with its full history
        await $`git -C ${TEMP_DIR} fetch origin ${branchName}:refs/remotes/origin/${branchName}`;
      } catch (e) {
        warning("Could not fetch branch, trying with commit hash");
        await $`git -C ${TEMP_DIR} fetch origin ${commitHash!}`;
      }
    } else {
      // For deleted branches, try to fetch the specific commit
      try {
        await $`git -C ${TEMP_DIR} fetch origin ${commitHash!}`;
      } catch (e) {
        // The commit might already be present
      }
    }
    
    // Find the original branch commit (handles merge commits)
    const originalCommit = await findOriginalBranchCommit(commitHash!);
    
    // Extract the patch
    // For active branches, use the branch reference; for deleted ones, use commit hash
    const branchRef = isActiveBranch ? `origin/${branchName}` : originalCommit;
    const patchContent = await extractPatch(branchName, branchRef, originalCommit);
    
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

