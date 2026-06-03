#!/bin/sh
set -e

REPO="repo-edu/repo-edu"
INSTALL_DIR="${REDU_INSTALL_DIR:-$HOME/.local/bin}"

detect_platform() {
  os=$(uname -s)
  case "$os" in
    Darwin) echo "darwin" ;;
    Linux) echo "linux" ;;
    *) printf "Unsupported OS: %s\n" "$os" >&2; exit 1 ;;
  esac
}

detect_arch() {
  arch=$(uname -m)
  case "$arch" in
    x86_64|amd64) echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    *) printf "Unsupported architecture: %s\n" "$arch" >&2; exit 1 ;;
  esac
}

resolve_version() {
  if [ -n "${REDU_VERSION:-}" ]; then
    echo "$REDU_VERSION"
    return
  fi

  tag=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep '"tag_name"' \
    | head -1 \
    | sed 's/.*"tag_name": *"//;s/".*//')

  if [ -z "$tag" ]; then
    printf "Failed to resolve latest version.\n" >&2
    exit 1
  fi

  echo "$tag"
}

download() {
  url=$1
  dest=$2
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$dest" "$url"
  else
    printf "Neither curl nor wget found. Install one and retry.\n" >&2
    exit 1
  fi
}

checksum_for_asset() {
  asset_name=$1
  checksum_file=$2
  awk -v expected="$asset_name" '
    NF >= 1 {
      filename = $2
      sub(/^\*/, "", filename)
      if ($1 ~ /^[0-9a-fA-F]{64}$/ && filename == expected) {
        print $1
        found = 1
        exit
      }
    }
    END {
      if (!found) exit 1
    }
  ' "$checksum_file"
}

verify_checksum() {
  file=$1
  expected_hash=$2

  if command -v sha256sum >/dev/null 2>&1; then
    actual_hash=$(sha256sum "$file" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    actual_hash=$(shasum -a 256 "$file" | awk '{print $1}')
  else
    printf "Cannot compute SHA-256: neither sha256sum nor shasum found.\n" >&2
    exit 1
  fi

  if [ "$actual_hash" != "$expected_hash" ]; then
    printf "Checksum mismatch!\n  Expected: %s\n  Actual:   %s\n" "$expected_hash" "$actual_hash" >&2
    rm -f "$file"
    exit 1
  fi
}

main() {
  platform=$(detect_platform)
  arch=$(detect_arch)

  if [ "$platform" = "darwin" ] && [ "$arch" = "x64" ]; then
    printf "Intel Macs are not supported. redu requires Apple Silicon (arm64).\n" >&2
    exit 1
  fi

  version=$(resolve_version)
  asset="redu-${platform}-${arch}"
  notice_asset="${asset}.third-party-notices.txt"
  base_url="https://github.com/$REPO/releases/download/${version}"

  printf "Installing redu %s (%s/%s)...\n" "$version" "$platform" "$arch"

  mkdir -p "$INSTALL_DIR"

  tmp_binary="${INSTALL_DIR}/redu.tmp.$$"
  tmp_checksum="${INSTALL_DIR}/redu.sha256.tmp.$$"
  tmp_notice="${INSTALL_DIR}/redu.third-party-notices.tmp.$$"
  dest_binary="${INSTALL_DIR}/redu"
  dest_notice="${INSTALL_DIR}/redu.third-party-notices.txt"
  backup_binary="${dest_binary}.old.$$"
  backup_notice="${dest_notice}.old.$$"
  trap 'rm -f "$tmp_binary" "$tmp_checksum" "$tmp_notice" "$backup_binary" "$backup_notice"' EXIT

  download "${base_url}/${asset}" "$tmp_binary"
  download "${base_url}/${asset}.sha256" "$tmp_checksum"
  download "${base_url}/${notice_asset}" "$tmp_notice"

  # Validate that the downloaded binary is not an HTML error page
  if head -c 15 "$tmp_binary" | grep -qi '<!doctype\|<html'; then
    printf "Download returned an HTML error page instead of a binary.\n" >&2
    exit 1
  fi
  if head -c 15 "$tmp_notice" | grep -qi '<!doctype\|<html'; then
    printf "Download returned an HTML error page instead of a notice file.\n" >&2
    exit 1
  fi

  # Extract expected hashes from checksum file entries (format: "hash  filename")
  expected_binary_hash=$(checksum_for_asset "$asset" "$tmp_checksum") || {
    printf "Checksum file is missing an entry for %s.\n" "$asset" >&2
    exit 1
  }
  expected_notice_hash=$(checksum_for_asset "$notice_asset" "$tmp_checksum") || {
    printf "Checksum file is missing an entry for %s.\n" "$notice_asset" >&2
    exit 1
  }
  verify_checksum "$tmp_binary" "$expected_binary_hash"
  verify_checksum "$tmp_notice" "$expected_notice_hash"

  chmod +x "$tmp_binary"

  binary_backed_up=0
  notice_backed_up=0
  binary_installed=0
  notice_installed=0

  if [ -e "$dest_binary" ]; then
    if mv "$dest_binary" "$backup_binary"; then
      binary_backed_up=1
    else
      printf "Failed to back up existing redu binary.\n" >&2
      exit 1
    fi
  fi
  if [ -e "$dest_notice" ]; then
    if mv "$dest_notice" "$backup_notice"; then
      notice_backed_up=1
    else
      if [ "$binary_backed_up" -eq 1 ]; then mv "$backup_binary" "$dest_binary"; fi
      printf "Failed to back up existing redu third-party notices.\n" >&2
      exit 1
    fi
  fi

  if mv "$tmp_binary" "$dest_binary"; then
    binary_installed=1
  else
    if [ "$binary_backed_up" -eq 1 ]; then mv "$backup_binary" "$dest_binary"; fi
    if [ "$notice_backed_up" -eq 1 ]; then mv "$backup_notice" "$dest_notice"; fi
    printf "Failed to install redu binary.\n" >&2
    exit 1
  fi

  if mv "$tmp_notice" "$dest_notice"; then
    notice_installed=1
  else
    if [ "$binary_installed" -eq 1 ]; then rm -f "$dest_binary"; fi
    if [ "$notice_installed" -eq 1 ]; then rm -f "$dest_notice"; fi
    if [ "$binary_backed_up" -eq 1 ]; then mv "$backup_binary" "$dest_binary"; fi
    if [ "$notice_backed_up" -eq 1 ]; then mv "$backup_notice" "$dest_notice"; fi
    printf "Failed to install redu third-party notices.\n" >&2
    exit 1
  fi

  rm -f "$backup_binary" "$backup_notice"

  printf "Installed redu to %s/redu\n" "$INSTALL_DIR"

  case ":$PATH:" in
    *":$INSTALL_DIR:"*) ;;
    *) printf "\nAdd %s to your PATH:\n  export PATH=\"%s:\$PATH\"\n" "$INSTALL_DIR" "$INSTALL_DIR" ;;
  esac

  "${INSTALL_DIR}/redu" --version
}

main
