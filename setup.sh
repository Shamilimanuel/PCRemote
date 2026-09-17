#!/usr/bin/env bash
#
# Reveille agent installer for macOS and Linux.
#
# The companion to setup.ps1, and deliberately the same shape: one command,
# no arguments, no administrator rights for the install itself, and a menu
# rather than a silent reinstall if you run it twice.
#
#   curl -fsSL github.com/Shamilimanuel/PCRemote/raw/main/setup.sh | bash
#
set -euo pipefail

REPO="Shamilimanuel/PCRemote"
BRANCH="main"
MIN_NODE_MAJOR=20

case "$(uname -s)" in
  Darwin) OS="macos"; INSTALL_DIR="$HOME/Library/Application Support/Reveille" ;;
  Linux)  OS="linux"; INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/reveille" ;;
  *) echo "Reveille has no agent for $(uname -s). Windows, macOS and Linux only." >&2; exit 1 ;;
esac

# ------------------------------------------------------------------ output --

# tput rather than raw escape codes: it knows when output is not a terminal and
# quietly produces nothing, so piping this somewhere stays readable.
if [ -t 1 ] && command -v tput >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
  C_DIM="$(tput dim)";    C_CYAN="$(tput setaf 6)"; C_GREEN="$(tput setaf 2)"
  C_YELLOW="$(tput setaf 3)"; C_BOLD="$(tput bold)";    C_OFF="$(tput sgr0)"
else
  C_DIM=""; C_CYAN=""; C_GREEN=""; C_YELLOW=""; C_BOLD=""; C_OFF=""
fi

step() { printf '  %s%s%s\n' "$C_CYAN"   "$1" "$C_OFF"; }
ok()   { printf '  %s%s%s\n' "$C_GREEN"  "$1" "$C_OFF"; }
warn() { printf '  %s%s%s\n' "$C_YELLOW" "$1" "$C_OFF"; }
dim()  { printf '  %s%s%s\n' "$C_DIM"    "$1" "$C_OFF"; }
die()  { printf '\n  %s%s%s\n\n' "$C_YELLOW" "$1" "$C_OFF" >&2; exit 1; }

banner() {
  printf '\n%s%s' "$C_BOLD" "$C_CYAN"
  # A quoted heredoc, so the backslashes in the lettering are just characters
  # and there is no printf format string to fight with.
  cat <<'ART'
      ____                _ _ _
     |  _ \ _____   _____(_) | | ___
     | |_) / _ \ \ / / _ \ | | |/ _ \
     |  _ <  __/\ V /  __/ | | |  __/
     |_| \_\___| \_/ \___|_|_|_|\___|
ART
  printf '%s\n' "$C_OFF"
  dim "  wake and control this machine from your phone"
  printf '\n'
}

# -------------------------------------------------------------------- node --

node_version() { node --version 2>/dev/null | sed 's/^v//'; }
node_major()   { node_version | cut -d. -f1; }

install_node() {
  # Only package managers the user already chose to have. Installing a package
  # manager in order to install Node would be a bigger decision than this
  # script should be making on someone's behalf.
  if [ "$OS" = macos ] && command -v brew >/dev/null 2>&1; then
    step "Installing Node.js via Homebrew..."
    brew install node
  elif command -v apt-get >/dev/null 2>&1; then
    step "Installing Node.js via apt (this asks for your password)..."
    sudo apt-get update -qq && sudo apt-get install -y nodejs npm
  elif command -v dnf >/dev/null 2>&1; then
    step "Installing Node.js via dnf (this asks for your password)..."
    sudo dnf install -y nodejs
  elif command -v pacman >/dev/null 2>&1; then
    step "Installing Node.js via pacman (this asks for your password)..."
    sudo pacman -S --noconfirm nodejs npm
  else
    die "Install Node.js $MIN_NODE_MAJOR or newer first, then run this again:
    https://nodejs.org  (take the LTS download)"
  fi
}

resolve_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node_major)"
    if [ -n "$major" ] && [ "$major" -ge "$MIN_NODE_MAJOR" ]; then
      dim "Node.js $(node_version)"
      return 0
    fi
    warn "Node.js $(node_version) is too old ($MIN_NODE_MAJOR or newer needed)."
  else
    step "Node.js is not installed. It is what runs the agent."
  fi

  install_node

  command -v node >/dev/null 2>&1 || die "Node.js was installed but this shell cannot see it yet.
  Close this terminal, open a new one, and run the same command again."
  [ "$(node_major)" -ge "$MIN_NODE_MAJOR" ] \
    || die "Node.js $(node_version) is still too old. Take the LTS build from https://nodejs.org"
  ok "Node.js $(node_version)"
}

# ---------------------------------------------------------------- download --

get_files() {
  local tmp source sha
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  step "Downloading the agent..."
  curl -fsSL "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" -o "$tmp/src.tar.gz" \
    || die "Could not download the agent. Check your internet connection."
  tar -xzf "$tmp/src.tar.gz" -C "$tmp"

  source="$(find "$tmp" -maxdepth 2 -type d -name back-end | head -1)"
  [ -n "$source" ] || die "The download did not contain the agent. Try again."

  mkdir -p "$INSTALL_DIR"
  # Copy over the top: this replaces the code and leaves node_modules and the
  # saved config alone, so an update keeps the pairing token it already has.
  ( cd "$source" && tar -cf - . ) | ( cd "$INSTALL_DIR" && tar -xf - )

  # Record which commit this copy came from. The agent compares it against main
  # to notice when the machine half has fallen behind -- it is fetched from a
  # branch, not a release, so a commit is the only honest version it has. Same
  # file setup.ps1 writes, read by the same code.
  #
  # The response is compact JSON on one line, and it mentions several shas --
  # the tree, the parents, every changed file. sed is greedy, so matching the
  # line as a whole would return the last of them. Splitting on commas first
  # puts each field on its own line, and the commit's own sha is the first.
  sha="$(curl -fsSL -H 'User-Agent: reveille-setup' \
          "https://api.github.com/repos/$REPO/commits/$BRANCH" 2>/dev/null \
          | tr ',' '\n' \
          | sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([0-9a-f]\{40\}\)".*/\1/p' \
          | head -1)"
  if [ -n "$sha" ]; then
    printf '{"sha":"%s","installedAt":"%s"}\n' \
      "$sha" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$INSTALL_DIR/installed.json"
  else
    dim "could not record the installed version (update checks will stay quiet)"
  fi

  dim "installed to $INSTALL_DIR"
}

# --------------------------------------------------------------- autostart --

LAUNCH_AGENT="$HOME/Library/LaunchAgents/sh.reveille.agent.plist"
SYSTEMD_UNIT="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/reveille.service"

register_autostart() {
  local node_bin
  node_bin="$(command -v node)"

  if [ "$OS" = macos ]; then
    step "Setting it to start when you log in..."
    mkdir -p "$(dirname "$LAUNCH_AGENT")"
    cat > "$LAUNCH_AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>sh.reveille.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>$node_bin</string>
    <string>$INSTALL_DIR/src/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>$INSTALL_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
PLIST
    launchctl unload "$LAUNCH_AGENT" 2>/dev/null || true
    launchctl load "$LAUNCH_AGENT"
    ok "It will start when you log in."
    return 0
  fi

  if ! command -v systemctl >/dev/null 2>&1; then
    warn "No systemd here, so it cannot be started for you automatically."
    dim "Start it yourself with:  node '$INSTALL_DIR/src/index.js'"
    return 0
  fi

  step "Setting it to start when you log in..."
  mkdir -p "$(dirname "$SYSTEMD_UNIT")"
  cat > "$SYSTEMD_UNIT" <<UNIT
[Unit]
Description=Reveille agent
After=network-online.target

[Service]
ExecStart=$node_bin $INSTALL_DIR/src/index.js
WorkingDirectory=$INSTALL_DIR
Restart=on-failure

[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload
  systemctl --user enable --now reveille.service
  ok "It will start when you log in."
}

stop_agent() {
  if [ "$OS" = macos ]; then
    launchctl unload "$LAUNCH_AGENT" 2>/dev/null || true
  else
    systemctl --user disable --now reveille.service 2>/dev/null || true
  fi
}

# ------------------------------------------------------------------ remove --

remove_all() {
  step "Removing Reveille..."
  stop_agent
  rm -f "$LAUNCH_AGENT" "$SYSTEMD_UNIT"
  if command -v systemctl >/dev/null 2>&1; then
    systemctl --user daemon-reload 2>/dev/null || true
  fi
  rm -rf "$INSTALL_DIR"
  printf '\n'
  ok "Reveille removed."
  dim "The app on your phone can be uninstalled the normal way."
  printf '\n'
}

# ------------------------------------------------------------------ token --

# Throws away the pairing token and issues a new one. The companion to
# Reset-Token in setup.ps1.
#
# Worth having because the token is the whole of the security model: whoever
# holds it can shut this machine down. Before this, changing it meant editing
# config.json by hand, so in practice nobody ever did -- a token that had been
# seen by someone else stayed valid forever.
reset_token() {
  local config="$INSTALL_DIR/config.json"
  [ -f "$config" ] || { warn "There is no pairing code here yet; install first."; return 1; }

  printf '\n'
  warn "This replaces the pairing code on this machine."
  dim  "Every phone already paired with it stops working until it scans the new"
  dim  "code. That is exactly what makes it useful if the old one has been seen"
  dim  "by someone else."
  printf '\n'

  local answer=""
  if [ -r /dev/tty ]; then
    read -r -p "  Type yes to continue: " answer < /dev/tty
  fi
  if [ "$(printf '%s' "$answer" | tr -d '[:space:]')" != "yes" ]; then
    dim "Left alone."
    return 1
  fi

  # 24 random bytes as hex, matching generateToken in back-end/src/config.js.
  # node is already a requirement, so use it rather than hoping for openssl.
  local token
  token="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')" \
    || { warn "Could not generate a new code."; return 1; }

  node -e '
    const fs = require("fs");
    const [file, token] = process.argv.slice(1);
    const config = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
    config.token = token;
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n", "utf8");
  ' "$config" "$token" || { warn "config.json could not be rewritten."; return 1; }

  ok "New pairing code issued."

  step "Restarting so the new code takes effect..."
  if [ "$OS" = macos ]; then
    launchctl unload "$LAUNCH_AGENT" 2>/dev/null || true
    launchctl load "$LAUNCH_AGENT" 2>/dev/null || true
  elif command -v systemctl >/dev/null 2>&1; then
    systemctl --user restart reveille.service 2>/dev/null || true
  fi
  sleep 2
  return 0
}

# -------------------------------------------------------------------- menu --

# Shown when an install already exists. The one-line command is the only thing
# anyone memorises, so it has to be the way in to everything -- not just a
# first install.
show_menu() {
  local sha choice
  printf '  %sReveille is already installed here:%s\n' "$C_BOLD" "$C_OFF"
  dim "$INSTALL_DIR"
  if [ -f "$INSTALL_DIR/installed.json" ]; then
    sha="$(sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([0-9a-f]\{7\}\).*/\1/p' \
           "$INSTALL_DIR/installed.json" | head -1)"
    [ -n "$sha" ] && dim "version $sha"
  fi
  printf '\n'
  printf '   %s1%s  Update to the latest version\n' "$C_BOLD" "$C_OFF"
  printf '   %s2%s  Repair  %s(reinstall, re-register, restart)%s\n' "$C_BOLD" "$C_OFF" "$C_DIM" "$C_OFF"
  printf '   %s3%s  Show the pairing code\n' "$C_BOLD" "$C_OFF"
  printf '   %s4%s  New pairing code  %s(revokes the old one)%s\n' "$C_BOLD" "$C_OFF" "$C_DIM" "$C_OFF"
  printf '   %s5%s  Remove Reveille\n' "$C_BOLD" "$C_OFF"
  printf '   %sQ%s  Quit\n' "$C_BOLD" "$C_OFF"
  printf '\n'

  # Read from the terminal rather than stdin: run through a pipe, stdin is the
  # script itself, and reading it here would swallow the rest of the file.
  if [ -r /dev/tty ]; then
    read -r -p "  Choose: " choice < /dev/tty || choice="Q"
  else
    choice="Q"
  fi

  case "$(printf '%s' "$choice" | tr -d '[:space:]')" in
    1) echo update ;;
    2) echo repair ;;
    3) echo pair ;;
    4) echo rotate ;;
    5) echo remove ;;
    *) echo quit ;;
  esac
}

# -------------------------------------------------------------------- main --

banner
resolve_node

# node_modules, not package.json: the files are copied into place before npm
# runs, so a run that died during npm leaves a folder that looks installed but
# cannot start. That person wants the install to finish, not a menu.
if [ -f "$INSTALL_DIR/package.json" ] && [ -d "$INSTALL_DIR/node_modules" ]; then
  case "$(show_menu)" in
    quit)   printf '\n'; exit 0 ;;
    remove) remove_all; exit 0 ;;
    pair)   ( cd "$INSTALL_DIR" && node pair.js ); exit 0 ;;
    rotate) if reset_token; then ( cd "$INSTALL_DIR" && node pair.js ); fi; exit 0 ;;
    *)      printf '\n' ;;
  esac
fi

stop_agent
get_files

step "Installing what it needs..."
( cd "$INSTALL_DIR" && npm install --omit=dev --no-audit --no-fund --loglevel=error >/dev/null ) \
  || die "npm install failed. Check your internet connection and try again."

register_autostart

printf '\n'
ok "Reveille is ready."
printf '\n'
( cd "$INSTALL_DIR" && node pair.js )
printf '\n'
printf '  %sTo show the pairing code again later:%s\n' "$C_BOLD" "$C_OFF"
dim "  cd '$INSTALL_DIR'; node pair.js"
printf '\n'
