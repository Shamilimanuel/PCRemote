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

case "$(uname -s)" in
  Darwin) OS="macos"; INSTALL_DIR="$HOME/Library/Application Support/Reveille" ;;
  Linux)  OS="linux"; INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/reveille" ;;
  *) echo "Reveille has no agent for $(uname -s). Windows, macOS and Linux only." >&2; exit 1 ;;
esac

# Which download fits this machine. Each one has the agent, its packages and
# Node.js inside it, so nothing has to be installed first -- no Homebrew, no
# apt, no password.
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)                TARGET="darwin-arm64" ;;
  Darwin-x86_64)               TARGET="darwin-x64" ;;
  Linux-x86_64)                TARGET="linux-x64" ;;
  Linux-aarch64|Linux-arm64)   TARGET="linux-arm64" ;;
  *) echo "Reveille has no download for $(uname -s) on $(uname -m)." >&2; exit 1 ;;
esac

# The Node that came with Reveille, named reveille so that is what Activity
# Monitor and ps show.
NODE="$INSTALL_DIR/reveille"

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

# ---------------------------------------------------------------- download --

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

get_files() {
  local tmp base name want got
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  base="https://github.com/$REPO/releases/download/agent"
  name="reveille-agent-$TARGET.tar.gz"

  step "Downloading the agent..."
  curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS" \
    && curl -fsSL "$base/$name" -o "$tmp/$name" \
    || die "Could not download the agent. Check your internet connection."

  # Something that will start at every log in is checked before it is
  # unpacked: its fingerprint has to be the one published beside it.
  step "Checking the download..."
  want="$(grep "  $name\$" "$tmp/SHA256SUMS" | cut -d' ' -f1)"
  got="$(sha256_of "$tmp/$name")"
  [ -n "$want" ] && [ "$want" = "$got" ] \
    || die "The download did not match its published fingerprint, so it was not installed.
  Try again in a few minutes."

  step "Unpacking it..."
  mkdir -p "$tmp/stage"
  tar -xzf "$tmp/$name" -C "$tmp/stage"

  mkdir -p "$INSTALL_DIR"
  # Everything is replaced apart from what the agent keeps for its owner --
  # the pairing, the activity log, the schedules, the list of apps -- so an
  # update keeps the token the phone already has. The same list as
  # KEEP_ON_UPDATE in back-end/src/paths.js.
  find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 \
    ! -name config.json ! -name update-state.json ! -name activity.json \
    ! -name schedules.json ! -name apps.json -exec rm -rf {} +
  ( cd "$tmp/stage" && tar -cf - . ) | ( cd "$INSTALL_DIR" && tar -xf - )

  # Which build this is: the agent compares it with the release's version.json
  # to notice when it has fallen behind. Same file setup.ps1 writes.
  local sha
  sha="$(sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([0-9a-f]\{40\}\)".*/\1/p' "$INSTALL_DIR/version.json" | head -1)"
  printf '{"sha":"%s","installedAt":"%s"}\n' "$sha" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$INSTALL_DIR/installed.json"

  dim "installed to $INSTALL_DIR"
}

# --------------------------------------------------------------- autostart --

LAUNCH_AGENT="$HOME/Library/LaunchAgents/sh.reveille.agent.plist"
SYSTEMD_UNIT="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/reveille.service"

register_autostart() {
  local node_bin="$NODE"

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
    dim "Start it yourself with:  '$NODE' '$INSTALL_DIR/src/index.js'"
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
  # Reveille's own Node is right there, so use it rather than hoping for openssl.
  local token
  token="$("$NODE" -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')" \
    || { warn "Could not generate a new code."; return 1; }

  "$NODE" -e '
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

# Its own Node, not just its files: a copy from before Node came with the
# download has no node/, and the way to fix that is to update, not a menu.
if [ -f "$INSTALL_DIR/package.json" ] && [ -x "$NODE" ]; then
  case "$(show_menu)" in
    quit)   printf '\n'; exit 0 ;;
    remove) remove_all; exit 0 ;;
    pair)   ( cd "$INSTALL_DIR" && "$NODE" pair.js ); exit 0 ;;
    rotate) if reset_token; then ( cd "$INSTALL_DIR" && "$NODE" pair.js ); fi; exit 0 ;;
    *)      printf '\n' ;;
  esac
fi

stop_agent
get_files
register_autostart

printf '\n'
ok "Reveille is ready."
printf '\n'
( cd "$INSTALL_DIR" && "$NODE" pair.js )
printf '\n'
printf '  %sTo show the pairing code again later:%s\n' "$C_BOLD" "$C_OFF"
dim "  cd '$INSTALL_DIR'; ./reveille pair.js"
printf '\n'
