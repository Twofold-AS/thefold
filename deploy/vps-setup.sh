#!/bin/bash
set -e
echo "=== TheFold VPS Setup (Hostinger KVM 4 / Ubuntu 24.04) ==="

# --- Security ---
apt update && apt upgrade -y
apt install -y ufw fail2ban git curl

# Firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow 2222/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# SSH hardening
sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config
sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# Fail2ban
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
port = 2222
maxretry = 3
bantime = 3600
EOF
systemctl enable --now fail2ban

# --- Non-root user ---
adduser --disabled-password --gecos "" thefold
usermod -aG sudo,docker thefold
echo "thefold ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/thefold

# --- Docker ---
curl -fsSL https://get.docker.com | bash
systemctl enable docker

# --- Caddy ---
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# --- Encore CLI ---
curl -L https://encore.dev/install.sh | bash

# --- Auto updates ---
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

echo ""
echo "✅ Done. Next:"
echo "  1. Copy SSH key to /home/thefold/.ssh/authorized_keys"
echo "  2. su - thefold"
echo "  3. git clone your repo"
echo "  4. cp .env.example .env && nano .env"
echo "  5. encore build docker thefold:latest --config infra-config.json"
echo "  6. docker compose up -d"
echo "  7. cp deploy/caddy/Caddyfile /etc/caddy/Caddyfile"
echo "  8. systemctl restart caddy"
