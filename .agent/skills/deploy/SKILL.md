---
name: deploy
description: Deploying the Brain app to a remote Debian server.
---

# Deployment

## Configuration

All deploy scripts read from a `.deploy` file in the project root (git-ignored):

```bash
DEPLOY_HOST="your-server.example.com"
REPO_URL="git@github.com:your-org/brain.git"
```

## Scripts

| Script | Purpose |
|---|---|
| `deploy-now` | Quick deploy: SSH into server and run `~/deploy.sh` |
| `scripts/deploy/setup.sh` | Initial server setup: copies scripts and runs remote setup |
| `scripts/deploy/deploy.sh` | Runs on server: git pull, npm ci, build, PM2 restart |
| `scripts/deploy/remote-setup.sh` | Runs on server: installs Node, PM2, Caddy, Ollama, etc. |

## How It Works

### Initial Setup (`scripts/deploy/setup.sh`)

Run once from your local machine to provision a new server:

```bash
./scripts/deploy/setup.sh              # uses .deploy config
./scripts/deploy/setup.sh user@host    # override host
```

This copies `deploy.sh` and `remote-setup.sh` to the server and executes setup, which:
- Installs Node.js v20, PM2, Caddy
- Clones the repo to `/var/www/brain`
- Configures Caddy reverse proxy with auto-TLS for the hostname
- Hardens SSH, installs Fail2Ban, configures UFW firewall
- Installs Ollama with `nomic-embed-text:v1.5`
- Creates `/var/www/brain-data` for uploads

### Deploying Updates (`deploy-now`)

Run from your local machine to deploy the latest `main` branch:

```bash
./deploy-now                # uses .deploy config
./deploy-now user@host      # override host
```

The remote `deploy.sh` does: `git fetch` → `git reset --hard origin/main` → `npm ci` → `npm run build` → `pm2 restart brain`.

## Prerequisites

1. **Any VM** running a Debian-based OS (e.g., Ubuntu, Debian) with SSH access and sudo privileges.
2. **SSH deploy key** on the server for GitHub repo access (read-only).
3. **DNS A record** pointing your domain at the server's static IP — or use the server's IP address directly. Note: Caddy's auto-TLS only works with a domain name; using a raw IP serves over HTTP only.
4. **`.env.local`** on the server at `/var/www/brain/.env.local` with API keys and `JWT_SECRET`.

## Git Authorization (Deploy Key)

On the server, generate a deploy key and add the public key to GitHub → repo Settings → Deploy Keys:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/brain_deploy_key -N "" -C "brain-deploy"
cat ~/.ssh/brain_deploy_key.pub  # add this to GitHub

cat >> ~/.ssh/config << 'EOF'
Host github.com
    IdentityFile ~/.ssh/brain_deploy_key
EOF
chmod 600 ~/.ssh/config
```

## Key Paths on Server

- **App**: `/var/www/brain`
- **Data**: `/var/www/brain-data`
- **Caddy config**: `/etc/caddy/Caddyfile`
- **PM2 logs**: `~/.pm2/logs/`
- **Env vars**: `/var/www/brain/.env.local`

## Monitoring

```bash
pm2 status          # process status
pm2 logs brain      # live logs
ls -lh ~/.pm2/logs/ # past logs
```
