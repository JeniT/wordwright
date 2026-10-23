#!/usr/bin/env bash
# Prepares a fresh Ubuntu 24.04 server for Wordwright. The setup wizard (deploy/setup-wizard.sh) copies this to the
# server and runs it for you; it is a separate file so you can read exactly what runs as root before it does.
#
#   sudo ./server-setup.sh base     an app user, Docker, a firewall, automatic security updates
#   sudo ./server-setup.sh harden   no root login and no passwords over SSH (do this AFTER you have logged in as the app user)
#   sudo ./server-setup.sh timer    a nightly database backup (runs ~/wordwright/backup.sh as the app user)
#
# Each part can be run again safely. APP_USER is the account that runs the app (default: wordwright).
set -euo pipefail

APP_USER="${APP_USER:-wordwright}"
[[ "$APP_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || { echo "APP_USER must be a plain lower-case user name." >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || { echo "Run this as root (sudo)." >&2; exit 1; }

base() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl ufw unattended-upgrades rsync

  # The account that runs the app. It logs in with the same key root does (the key you gave UpCloud).
  if ! id "$APP_USER" >/dev/null 2>&1; then
    adduser --disabled-password --gecos "" "$APP_USER"
  fi
  install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
  # Only the first time: a rerun must not undo keys you have since added to or removed from the app user. Every key
  # in root's file gets this account (and sudo, below), so keep root's file to your own keys.
  if [ ! -s "/home/$APP_USER/.ssh/authorized_keys" ]; then
    install -m 600 -o "$APP_USER" -g "$APP_USER" /root/.ssh/authorized_keys "/home/$APP_USER/.ssh/authorized_keys"
    echo "Copied these keys from root to $APP_USER (remove any that are not yours):"
    ssh-keygen -lf "/home/$APP_USER/.ssh/authorized_keys"
  fi
  # No password to type (there is none), so sudo is passwordless for this one key-only account. The file is checked
  # before it is put in place: a broken file in sudoers.d would stop sudo working for everyone.
  sudoers_tmp=$(mktemp)
  echo "$APP_USER ALL=(ALL) NOPASSWD:ALL" > "$sudoers_tmp"
  visudo -cf "$sudoers_tmp" >/dev/null
  install -m 440 -o root -g root "$sudoers_tmp" "/etc/sudoers.d/90-$APP_USER"
  rm -f "$sudoers_tmp"

  # Docker from Docker's own repository (Ubuntu's packages lag behind).
  if ! command -v docker >/dev/null 2>&1; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
  usermod -aG docker "$APP_USER"
  # Docker's own docker-ce packages are not part of the security updates below: update them yourself now and then
  # (sudo apt-get update && sudo apt-get upgrade).

  # Firewall: SSH, and the web on 80 and 443 (443/udp is HTTP/3). SSH is allowed before it is switched on.
  # Note that ports published by Docker (compose.yaml "ports:") bypass ufw: publish only 80 and 443.
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 443/udp
  ufw --force enable

  # Security updates install themselves, and the machine restarts at 04:30 when one needs it (the containers restart too).
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF
  cat > /etc/apt/apt.conf.d/52wordwright-upgrades <<'CONF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-WithUsers "false";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
CONF

  install -d -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/wordwright"
  echo "Base setup done."
}

harden() {
  [ -s "/home/$APP_USER/.ssh/authorized_keys" ] || { echo "$APP_USER has no SSH key; run 'base' first." >&2; exit 1; }
  # "00-" sorts first, and sshd keeps the first value it sees, so this beats the cloud image's own file.
  cat > /etc/ssh/sshd_config.d/00-wordwright.conf <<'CONF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
CONF
  sshd -t  # refuses to go on if the configuration is broken
  systemctl reload ssh
  echo "Root login and passwords are now off. Your current session stays open; keep it until you have checked a new one."
}

timer() {
  cat > /etc/systemd/system/wordwright-backup.service <<CONF
[Unit]
Description=Back up the Wordwright database

[Service]
Type=oneshot
User=$APP_USER
ExecStart=/home/$APP_USER/wordwright/backup.sh
CONF
  cat > /etc/systemd/system/wordwright-backup.timer <<'CONF'
[Unit]
Description=Back up the Wordwright database every night

[Timer]
OnCalendar=*-*-* 02:30:00
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
CONF
  systemctl daemon-reload
  systemctl enable --now wordwright-backup.timer
  systemctl list-timers wordwright-backup.timer --no-pager
}

case "${1:-}" in
  base) base ;;
  harden) harden ;;
  timer) timer ;;
  *) echo "Usage: sudo $0 base|harden|timer" >&2; exit 1 ;;
esac
