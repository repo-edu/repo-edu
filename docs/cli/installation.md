# CLI Installation

## From Release Binary

Download the pre-built binary for your platform from the [GitHub Releases](https://github.com/repo-edu/repo-edu/releases) page.

### macOS / Linux

```bash
# Download and extract (adjust version and platform as needed)
curl -LO https://github.com/repo-edu/repo-edu/releases/latest/download/redu-macos-arm64.tar.gz
tar xzf redu-macos-arm64.tar.gz

# Move to a directory in your PATH
sudo mv redu /usr/local/bin/

# Verify installation
redu --version
```

### Windows

1. Download `redu-windows-x64.zip` from the releases page
2. Extract to a folder (e.g., `C:\Program Files\repo-edu\`)
3. Add the folder to your system PATH
4. Open a new terminal and run `redu --version`

## From Source

Build the CLI from source using Cargo:

```bash
# Clone the repository
git clone https://github.com/repo-edu/repo-edu.git
cd repo-edu

# Build release binary
cargo build --release -p repo-manage-cli

# The binary is at target/release/redu
./target/release/redu --version

# Optionally install to ~/.cargo/bin
cargo install --path apps/repo-manage/cli
```

## Verify Installation

```bash
redu --version
# repo-manage-cli x.y.z

redu --help
# Shows available commands
```
