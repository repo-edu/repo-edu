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
  base_url="https://github.com/$REPO/releases/download/${version}"

  printf "Installing redu %s (%s/%s)...\n" "$version" "$platform" "$arch"

  mkdir -p "$INSTALL_DIR"

  tmp_binary="${INSTALL_DIR}/redu.tmp.$$"
  tmp_checksum="${INSTALL_DIR}/redu.sha256.tmp.$$"
  trap 'rm -f "$tmp_binary" "$tmp_checksum"' EXIT

  download "${base_url}/${asset}" "$tmp_binary"
  download "${base_url}/${asset}.sha256" "$tmp_checksum"

  # Validate that the downloaded binary is not an HTML error page
  if head -c 15 "$tmp_binary" | grep -qi '<!doctype\|<html'; then
    printf "Download returned an HTML error page instead of a binary.\n" >&2
    exit 1
  fi

  # Extract expected hash from checksum file (format: "hash  filename")
  expected_hash=$(cut -d' ' -f1 < "$tmp_checksum")
  verify_checksum "$tmp_binary" "$expected_hash"

  chmod +x "$tmp_binary"
  mv "$tmp_binary" "${INSTALL_DIR}/redu"

  printf "Installed redu to %s/redu\n" "$INSTALL_DIR"

  case ":$PATH:" in
    *":$INSTALL_DIR:"*) ;;
    *) printf "\nAdd %s to your PATH:\n  export PATH=\"%s:\$PATH\"\n" "$INSTALL_DIR" "$INSTALL_DIR" ;;
  esac

  "${INSTALL_DIR}/redu" --version
}

main
