#!/bin/bash

# scripts/deploy/setup.sh
# Purpose: Orchestrates the setup on a remote server by copying scripts and running them.
# Usage: ./scripts/deploy/setup.sh [USER@HOST]

set -e

# Read config from .deploy file
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [ -f "$PROJECT_ROOT/.deploy" ]; then
    source "$PROJECT_ROOT/.deploy"
fi

HOST=${1:-"$DEPLOY_HOST"}

if [ -z "$HOST" ]; then
    echo "Error: No host specified and DEPLOY_HOST not set in .deploy file."
    echo "Usage: ./scripts/deploy/setup.sh [USER@HOST]"
    echo "Or create a .deploy file in the project root."
    exit 1
fi

REPO_URL=${REPO_URL:-"git@github.com:arunoda/brain.git"}

echo "Setting up Brain App on $HOST..."

# 1. Copy deploy script
echo "Copying deploy script..."
scp scripts/deploy/deploy.sh "$HOST:~/deploy.sh"

# 2. Copy setup script
echo "Copying setup script..."
scp scripts/deploy/remote-setup.sh "$HOST:~/setup.sh"

# 3. Execute setup script remotely, passing hostname and repo URL
echo "Executing setup script on remote host..."
ssh "$HOST" "chmod +x ~/deploy.sh ~/setup.sh && ~/setup.sh '$HOST' '$REPO_URL'"

echo "Remote setup initiated!"
