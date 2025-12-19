//! Integration tests for redu CLI
//!
//! These tests verify complete workflows and end-to-end functionality.

use assert_cmd::cargo::cargo_bin_cmd;
use assert_cmd::Command;
use predicates::prelude::*;
use tempfile::TempDir;

// ===== Helper Functions =====

fn cli() -> Command {
    let mut cmd = cargo_bin_cmd!("redu");
    // Each test gets its own unique temp directory for isolation
    let test_dir = TempDir::new().unwrap();
    let test_path = test_dir.keep();
    cmd.env("REPOBEE_CONFIG_DIR", test_path.to_str().unwrap());
    cmd
}

// ===== Help and Version Tests =====

#[test]
fn test_help_flag() {
    cli()
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("Usage:"))
        .stdout(predicate::str::contains("Commands:"));
}

#[test]
fn test_version_flag() {
    cli().arg("--version").assert().success();
}

// ===== Profile Subcommand Tests =====

#[test]
fn test_profile_help() {
    cli()
        .arg("profile")
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("Profile management"))
        .stdout(predicate::str::contains("list"))
        .stdout(predicate::str::contains("show"))
        .stdout(predicate::str::contains("load"));
}

#[test]
fn test_profile_list() {
    cli()
        .arg("profile")
        .arg("list")
        .assert()
        .success()
        .stdout(predicate::str::contains("Available profiles"));
}

#[test]
fn test_profile_active() {
    cli()
        .arg("profile")
        .arg("active")
        .assert()
        .success()
        .stdout(predicate::str::contains("profile").or(predicate::str::contains("No active")));
}

#[test]
fn test_profile_show() {
    cli()
        .arg("profile")
        .arg("show")
        .assert()
        .success()
        .stdout(predicate::str::contains("Current Configuration"));
}

// ===== Repo Subcommand Tests =====

#[test]
fn test_repo_help() {
    cli()
        .arg("repo")
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("Repository operations"))
        .stdout(predicate::str::contains("setup"))
        .stdout(predicate::str::contains("verify"))
        .stdout(predicate::str::contains("clone"));
}

#[test]
fn test_repo_setup_help() {
    cli()
        .arg("repo")
        .arg("setup")
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("Set up student repositories"))
        .stdout(predicate::str::contains("--platform"))
        .stdout(predicate::str::contains("--template"));
}

#[test]
fn test_repo_verify_help() {
    cli()
        .arg("repo")
        .arg("verify")
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("Verify git platform"));
}

#[test]
fn test_repo_clone_help() {
    cli()
        .arg("repo")
        .arg("clone")
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("Clone student repositories"));
}

// ===== LMS Subcommand Tests =====

#[test]
fn test_lms_help() {
    cli()
        .arg("lms")
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("LMS operations"))
        .stdout(predicate::str::contains("verify"))
        .stdout(predicate::str::contains("generate"));
}

#[test]
fn test_lms_verify_help() {
    cli()
        .arg("lms")
        .arg("verify")
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("Verify LMS course"));
}

#[test]
fn test_lms_generate_help() {
    cli()
        .arg("lms")
        .arg("generate")
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("Generate student files"));
}

// ===== Error Scenarios Tests =====

#[test]
fn test_no_command_shows_usage() {
    // Running without any command shows usage and exits with success
    cli()
        .assert()
        .success()
        .stdout(predicate::str::contains("Usage:"));
}

#[test]
fn test_invalid_subcommand() {
    cli()
        .arg("nonexistent")
        .assert()
        .failure()
        .stderr(predicate::str::contains("unrecognized subcommand"));
}

// ===== Global Options Tests =====

#[test]
fn test_markdown_help() {
    cli()
        .arg("--markdown-help")
        .assert()
        .success()
        .stdout(predicate::str::contains("# Command-Line Help for `redu`"));
}
