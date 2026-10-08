#!/usr/bin/env bash
# Builds the agent downloads: the agent, its packages already installed, and
# Node.js itself -- so installing Reveille needs nothing installed first.
#
#   tools/bundle-agent.sh [output-folder]
#
# Run by .github/workflows/agent.yml on Linux; it needs curl, python3, zip,
# tar, xz and sha256sum.
#
# Node is the official build from nodejs.org, checked against Node's own
# SHASUMS256.txt before it is used. On Windows that matters for more than
# safety: node.exe is signed by the OpenJS Foundation, which is what lets it
# run on a PC with Smart App Control switched on. A program we compiled
# ourselves would be unsigned, and blocked.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$root/dist/agent}"
# Absolute, because the packing below runs from inside each package folder.
mkdir -p "$out"
out="$(cd "$out" && pwd)"
major="${NODE_MAJOR:-24}"
sha="${GITHUB_SHA:-$(git -C "$root" rev-parse HEAD)}"

# The newest release of this Node line, so security fixes arrive with the next
# build rather than waiting for someone to bump a number.
version="$(curl -fsSL https://nodejs.org/dist/index.json | python3 -c "
import json, sys
print(next(r['version'] for r in json.load(sys.stdin) if r['version'].startswith('v$major.')))")"
dist="https://nodejs.org/dist/$version"
echo "Node $version, agent $sha"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
rm -rf "$out"
mkdir -p "$out"
curl -fsSL "$dist/SHASUMS256.txt" -o "$work/SHASUMS256.txt"

# The agent, with its production packages, once for every target -- they are
# all plain JavaScript, so the same node_modules runs everywhere.
app="$work/app"
mkdir -p "$app"
cp -R "$root/back-end/." "$app/"
rm -rf "$app/node_modules" "$app/config.json" "$app/installed.json" "$app/update-state.json" "$app/.gitignore" \
  "$app/activity.json" "$app/schedules.json" "$app/apps.json" "$app/test"
(cd "$app" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
# Command shims for npm scripts: symlinks on Linux, useless on Windows, and
# nothing here runs them.
rm -rf "$app/node_modules/.bin"

built="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

for spec in win-x64:zip win-arm64:zip darwin-arm64:tar.gz darwin-x64:tar.gz linux-x64:tar.xz linux-arm64:tar.xz; do
  target="${spec%%:*}"
  ext="${spec#*:}"
  file="node-$version-$target.$ext"

  curl -fsSL "$dist/$file" -o "$work/$file"
  (cd "$work" && grep "  $file\$" SHASUMS256.txt | sha256sum -c --quiet -)

  pkg="$work/pkg-$target"
  cp -R "$app" "$pkg"
  mkdir -p "$pkg/licenses" "$work/x-$target"
  # Node, renamed reveille(.exe), so that what people see in Task Manager's
  # Details, in Activity Monitor and in their firewall rules is Reveille.
  # Renaming leaves the OpenJS Foundation's signature intact -- a signature
  # covers the contents, not the name -- so Smart App Control still lets it
  # run. Changing what is inside (its description, its publisher) would break
  # the signature, so Task Manager's Processes tab still calls it Node.js.
  if [ "$ext" = zip ]; then
    unzip -q "$work/$file" -d "$work/x-$target"
    cp "$work/x-$target/node-$version-$target/node.exe" "$pkg/reveille.exe"
  else
    tar -xf "$work/$file" -C "$work/x-$target"
    cp "$work/x-$target/node-$version-$target/bin/node" "$pkg/reveille"
    chmod +x "$pkg/reveille"
  fi
  # Node's licence travels with Node, as its licence asks.
  cp "$work/x-$target/node-$version-$target/LICENSE" "$pkg/licenses/node.txt"

  printf '{\n  "sha": "%s",\n  "node": "%s",\n  "target": "%s",\n  "builtAt": "%s"\n}\n' \
    "$sha" "$version" "$target" "$built" > "$pkg/version.json"

  name="reveille-agent-$target"
  if [ "$ext" = zip ]; then
    (cd "$pkg" && zip -qr -X "$out/$name.zip" .)
  else
    tar -czf "$out/$name.tar.gz" -C "$pkg" .
  fi
  echo "  $name: $(du -h "$out/$name".* | cut -f1)"
done

# What the installer and the agent compare against to know there is an update.
printf '{\n  "sha": "%s",\n  "node": "%s",\n  "builtAt": "%s"\n}\n' "$sha" "$version" "$built" > "$out/version.json"
(cd "$out" && sha256sum reveille-agent-* version.json > SHA256SUMS)
cat "$out/SHA256SUMS"
