# Branch Transition Tool

Automatic tool to extract complete changes from Git branches, including active and deleted branches.

## 🚀 Features

- ✅ Extract changes from active branches
- ✅ Support for deleted branches (search in history)
- ✅ Automatic handling of merge commits
- ✅ Complete metadata (author, date, message)
- ✅ Full diff of all changes
- ✅ Automatic cleanup of temporary files
- ✅ Error handling with informative messages
- ✅ Colored and user-friendly output

## 📋 Requirements

- [Bun](https://bun.sh/) (JavaScript/TypeScript runtime)
- Git installed and configured

## 🔧 Installation

1. Clone or download this repository
2. Install Bun if you don't have it already:

```bash
curl -fsSL https://bun.sh/install | bash
```

3. Install dependencies:

```bash
bun install
```

## 📖 Usage

### Basic Syntax

```bash
bun run extract-branch-changes.ts <branch-name>
```

### Or using the wrapper script

```bash
./extract.sh <branch-name>
```

### Examples

```bash
# Extract changes from branch VANS-5501
bun run extract-branch-changes.ts VANS-5501

# Extract changes from a feature branch
bun run extract-branch-changes.ts feature/new-login

# Extract changes from a deleted branch
bun run extract-branch-changes.ts old-branch-name
```

### Output

The script generates a file named `<branch-name>-all-changes.patch` in the current directory containing:

1. **Information header**:
   - Branch name
   - Repository URL
   - Commit hashes (base and branch)
   - Generation date

2. **Commit history**:
   - Author and email
   - Commit date
   - Commit hash
   - Commit message
   - Full description

3. **Complete diff**:
   - All file changes
   - Added and removed lines
   - Context modifications

## 🔍 How It Works

### 1. Active Branch Search

The script first searches for the branch in the remote active branches of the repository:

```bash
git ls-remote --heads <repository-url>
```

### 2. History Search (Deleted Branches)

If the branch is not active, the script:

1. Clones the repository (shallow clone, last 1000 commits)
2. Searches in commit messages
3. Searches in merge commits
4. Searches for patterns in the branch name

### 3. Merge Commits Handling

If the found commit is a merge commit, the script:

1. Identifies the commit as a merge (>1 parent)
2. Extracts the original branch commit
3. Uses it to generate the diff

### 4. Patch Extraction

The script:

1. Finds the base commit (separation point from main/master)
2. Extracts the complete commit history
3. Generates the diff between base commit and branch commit
4. Combines everything into a formatted patch file

### 5. Cleanup

Temporary files are automatically deleted:

- On successful completion
- In case of error
- If the user interrupts execution (Ctrl+C)

## 📁 Repository Structure

```
Branch Transition Tool/
├── extract-branch-changes.ts    # Main script
├── extract.sh                   # Bash wrapper script
├── package.json                 # Project configuration
├── tsconfig.json                # TypeScript configuration
├── .gitignore                   # Git ignore file
├── LICENSE                      # MIT License
└── README.md                    # This documentation
```

## ⚙️ Configuration

### Change Repository

To use a different repository, modify the `REPO_URL` constant in `extract-branch-changes.ts`:

```typescript
const REPO_URL = "https://github.com/your-username/your-repository";
```

### History Depth

To modify the number of analyzed commits (default: 1000), change:

```typescript
await $`git clone --depth=1000 ${REPO_URL} ${TEMP_DIR}`;
```

## 🐛 Troubleshooting

### Branch not found

**Problem**: The branch is not found in either active branches or history.

**Solutions**:
- Verify the branch name spelling
- Increase clone depth (--depth=2000 or more)
- The branch might have been deleted too long ago
- Verify you have access to the repository

### Connection error

**Problem**: Cannot connect to the repository.

**Solutions**:
- Verify internet connection
- Check the repository URL
- Verify Git credentials if the repository is private
- Make sure Git is installed and configured

### Temporary files not deleted

**Problem**: The `.git-temp-clone` directory remains after execution.

**Solutions**:
- Delete manually: `rm -rf .git-temp-clone`
- Restart the script
- Verify directory permissions

### Incomplete patch

**Problem**: The patch file does not contain all expected changes.

**Solutions**:
- Verify that the base commit is correct
- The branch might have unpushed commits
- Try searching for a more specific commit

## 💡 Tips

1. **Branch Names**: Use exact names for faster results
2. **Old Branches**: For very old branches, increase clone depth
3. **Large Repositories**: The first clone might take time
4. **Slow Connection**: Repository download might take time
5. **Disk Space**: Make sure you have enough space for temporary clone

## 🔐 Security

- The script does not store credentials
- Temporary files are always deleted
- No changes are made to the remote repository
- Read-only operations only

## 📝 Technical Notes

- **Runtime**: Bun (faster than Node.js)
- **Repository**: github.com/testpointcorp/vansah-jirapluginapp
- **Temporary Directory**: `.git-temp-clone` (auto-deleted)
- **Output Format**: Unified patch with complete metadata

## 🎯 Entry Points

### Method 1: Direct (Bun)
```bash
bun run extract-branch-changes.ts VANS-5501
```

### Method 2: NPM Script
```bash
bun run extract VANS-5501
```

### Method 3: Bash Wrapper
```bash
./extract.sh VANS-5501
```

### Method 4: Direct with shebang
```bash
./extract-branch-changes.ts VANS-5501
```

## 🤝 Support

For issues or questions:

1. Verify prerequisites (Bun, Git)
2. Check colored error messages
3. Check execution logs
4. Review the "Troubleshooting" section

## 📄 License

MIT License - Free for personal and commercial use.

---

**Created for Testpoint Corp** - Git branch transition management tool
