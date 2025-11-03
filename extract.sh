#!/bin/bash

# Wrapper script for Branch Transition Tool
# Usage: ./extract.sh <branch-name>

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Verify arguments
if [ $# -eq 0 ]; then
    echo -e "${RED}❌ Error: Branch name not provided${NC}"
    echo ""
    echo "Usage: ./extract.sh <branch-name>"
    echo "Example: ./extract.sh VANS-5501"
    echo ""
    exit 1
fi

# Verify that Bun is installed
if ! command -v bun &> /dev/null; then
    echo -e "${RED}❌ Error: Bun is not installed${NC}"
    echo ""
    echo "Install Bun with:"
    echo "curl -fsSL https://bun.sh/install | bash"
    echo ""
    exit 1
fi

# Get the absolute path of the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Execute the TypeScript script
echo -e "${BLUE}🚀 Branch Transition Tool${NC}"
echo ""

cd "$SCRIPT_DIR"
bun run extract-branch-changes.ts "$1"

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Operation completed successfully!${NC}"
else
    echo ""
    echo -e "${RED}❌ Operation failed (exit code: $EXIT_CODE)${NC}"
fi

exit $EXIT_CODE

