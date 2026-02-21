#!/bin/bash

# setup.sh
# Purpose: Installs dependencies and prepares the environment for the brain app on Debian.
# Usage: ./setup.sh <HOSTNAME> <REPO_URL>

set -e

APP_DIR="/var/www/brain"

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Error: Hostname and repository URL are required."
    echo "Usage: ./setup.sh <HOSTNAME> <REPO_URL>"
    exit 1
fi

HOSTNAME="$1"
REPO_URL="$2"

echo "Starting setup for Brain App..."
echo "Target Directory: $APP_DIR"
echo "Repository: $REPO_URL"
echo "Hostname: $HOSTNAME"

# Detect real user if running with sudo
REAL_USER=${SUDO_USER:-$USER}
echo "Configuring for user: $REAL_USER"

# 1. Update APT
echo "Updating apt..."
sudo apt update

# 2. Install basic tools
echo "Installing basic tools (curl, git, unzip)..."
sudo apt install -y curl git unzip

# 3. Install Node.js (v20)
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing Node.js v20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo "Node.js is already installed: $(node -v)"
fi

# 4. Install PM2
if ! command -v pm2 &> /dev/null; then
    echo "PM2 not found. Installing global PM2..."
    sudo npm install -g pm2
else
    echo "PM2 is already installed: $(pm2 -v)"
fi

# 5. Configure PM2 Log Management
echo "Configuring PM2 Log Rotation for $REAL_USER..."
# Clean up temp directory to avoid permission issues if previously installed by root
rm -rf /tmp/pm2-logrotate
# Install pm2-logrotate for the specific user
sudo -u "$REAL_USER" pm2 install pm2-logrotate || true
# Configure settings
sudo -u "$REAL_USER" pm2 set pm2-logrotate:max_size 10M
sudo -u "$REAL_USER" pm2 set pm2-logrotate:retain 7
sudo -u "$REAL_USER" pm2 set pm2-logrotate:compress true
sudo -u "$REAL_USER" pm2 set pm2-logrotate:rotateInterval '0 0 * * *'

# Ensure PM2 starts on boot
echo "Configuring PM2 Startup..."
# Generate and execute startup script for the specific user
# This command generates the startup script (e.g., systemd) and we execute it via eval or piping
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u "$REAL_USER" --hp "/home/$REAL_USER" | sudo bash

# 6. Install Caddy
if ! command -v caddy &> /dev/null; then
    echo "Caddy not found. Installing Caddy..."
    sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
    sudo apt update
    sudo apt install -y caddy
else
    echo "Caddy is already installed: $(caddy version)"
fi

# 7. Clone Repository
if [ ! -d "$APP_DIR" ]; then
    echo "App directory $APP_DIR does not exist. Cloning repository..."
    sudo mkdir -p "$(dirname "$APP_DIR")"
    sudo chown -R "$REAL_USER":"$REAL_USER" "$(dirname "$APP_DIR")"

    git clone "$REPO_URL" "$APP_DIR"
    echo "Repository cloned."
else
    echo "App directory exists at $APP_DIR. Skipping clone."
fi

# 8. Setup Caddyfile (Dynamic Generation)
echo "Configuring Caddy for $HOSTNAME..."
# We use tee to write to the protected file
sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
$HOSTNAME {
    reverse_proxy localhost:3000
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }
}
EOF

echo "Reloading Caddy..."
sudo systemctl reload caddy

# 9. SSH Hardening (Disable Password Authentication)
echo "Hardening SSH security..."
# Backup sshd_config
if [ -f /etc/ssh/sshd_config ]; then
    sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak

    # Disable PasswordAuthentication
    sudo sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
    # Disable ChallengeResponseAuthentication
    sudo sed -i 's/^#\?ChallengeResponseAuthentication .*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config

    echo "Validating SSH config..."
    if sudo sshd -t; then
        echo "Restarting SSH service..."
        sudo systemctl restart ssh
    else
        echo "ERROR: SSH config is invalid. Restoring backup..."
        sudo cp /etc/ssh/sshd_config.bak /etc/ssh/sshd_config
    fi
fi

# 10. Install Fail2Ban
echo "Installing Fail2Ban..."
sudo apt install -y fail2ban

# Configure Fail2Ban local config
sudo tee /etc/fail2ban/jail.local > /dev/null <<EOF
[DEFAULT]
bantime  = 24h
findtime = 10m
maxretry = 3

[sshd]
enabled = true
EOF

echo "Restarting Fail2Ban..."
sudo systemctl restart fail2ban

# 11. Configure Unattended Upgrades
echo "Configuring Unattended Upgrades..."
sudo apt install -y unattended-upgrades
# Enable unattended-upgrades non-interactively
echo "unattended-upgrades unattended-upgrades/enable_auto_updates boolean true" | sudo debconf-set-selections
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

# 12. Configure Firewall (UFW)
echo "Configuring firewall..."
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw --force enable

# 13. Install Ollama
if ! command -v ollama &> /dev/null; then
    echo "Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
else
    echo "Ollama already installed: $(ollama --version)"
fi

# Pull embedding model
echo "Pulling nomic-embed-text:v1.5 model..."
ollama pull nomic-embed-text:v1.5

# 14. Create Upload Data Directory
DATA_DIR="/var/www/brain-data"
echo "Creating upload data directory at $DATA_DIR..."
sudo mkdir -p "$DATA_DIR/uploads"
sudo chown -R "$REAL_USER":"$REAL_USER" "$DATA_DIR"

# Final Permission Fix
echo "Ensuring file ownership for $REAL_USER..."
sudo chown -R "$REAL_USER":"$REAL_USER" "$APP_DIR"

echo "Setup completed successfully!"
