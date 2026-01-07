//! Integration tests for redu CLI
//!
//! These tests verify complete workflows and end-to-end functionality.

use assert_cmd::cargo::cargo_bin_cmd;
use assert_cmd::Command;
use predicates::prelude::*;
use std::fs;
use std::path::Path;
use tempfile::TempDir;

// ============================================================================
// Helper Functions
// ============================================================================

/// Create a CLI command with isolated config directory
fn cli() -> Command {
    let mut cmd = cargo_bin_cmd!("redu");
    // Each test gets its own unique temp directory for isolation
    let test_dir = TempDir::new().unwrap();
    let test_path = test_dir.keep();
    cmd.env("REPOBEE_CONFIG_DIR", test_path.to_str().unwrap());
    cmd
}

/// Create a CLI command with specific config directory (for tests that need to inspect it)
fn cli_with_config_dir(config_dir: &Path) -> Command {
    let mut cmd = cargo_bin_cmd!("redu");
    cmd.env("REPOBEE_CONFIG_DIR", config_dir.to_str().unwrap());
    cmd
}

/// Create a students YAML file
fn create_students_yaml(dir: &Path, content: &str) -> std::path::PathBuf {
    let path = dir.join("students.yaml");
    fs::write(&path, content).unwrap();
    path
}

// ============================================================================
// Help and Version Tests
// ============================================================================

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

// ============================================================================
// Profile Subcommand Tests
// ============================================================================

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

// ============================================================================
// Repo Subcommand Help Tests
// ============================================================================

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

// ============================================================================
// LMS Subcommand Tests
// ============================================================================

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

// ============================================================================
// Error Scenarios Tests
// ============================================================================

#[test]
fn test_no_command_shows_usage() {
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

// ============================================================================
// Global Options Tests
// ============================================================================

#[test]
fn test_markdown_help() {
    cli()
        .arg("--markdown-help")
        .assert()
        .success()
        .stdout(predicate::str::contains("# Command-Line Help for `redu`"));
}

// ============================================================================
// Repo Verify Integration Tests (with mocked server)
// ============================================================================

mod repo_verify_tests {
    use super::*;

    fn gitlab_user_json(username: &str) -> String {
        format!(r#"{{"id":1,"username":"{}"}}"#, username)
    }

    fn gitlab_group_json(id: u64, name: &str) -> String {
        format!(
            r#"{{"id":{},"name":"{}","path":"{}","full_path":"{}"}}"#,
            id, name, name, name
        )
    }

    fn gitlab_members_json(usernames: &[&str]) -> String {
        let members: Vec<String> = usernames
            .iter()
            .map(|u| format!(r#"{{"username":"{}","access_level":30}}"#, u))
            .collect();
        format!("[{}]", members.join(","))
    }

    #[test]
    fn verify_gitlab_success() {
        let mut server = mockito::Server::new();
        let base_url = format!("{}/api/v4", server.url());

        let _user_mock = server
            .mock("GET", "/api/v4/user")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(gitlab_user_json("testuser"))
            .create();

        let _group_mock = server
            .mock("GET", "/api/v4/groups/test-org")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(gitlab_group_json(1, "test-org"))
            .create();

        let _members_mock = server
            .mock("GET", "/api/v4/groups/1/members/all")
            .match_query(mockito::Matcher::Any)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(gitlab_members_json(&["testuser"]))
            .create();

        let temp = TempDir::new().unwrap();

        cli_with_config_dir(temp.path())
            .arg("repo")
            .arg("verify")
            .arg("--platform")
            .arg("gitlab")
            .env("REPOBEE_BASE_URL", &base_url)
            .env("REPOBEE_TOKEN", "test-token")
            .env("REPOBEE_ORG", "test-org")
            .env("REPOBEE_USER", "testuser")
            .assert()
            .success()
            .stdout(predicate::str::contains("Verify platform"));
    }

    #[test]
    fn verify_gitlab_invalid_token() {
        let mut server = mockito::Server::new();
        let base_url = format!("{}/api/v4", server.url());

        let _user_mock = server
            .mock("GET", "/api/v4/user")
            .with_status(401)
            .with_body("Unauthorized")
            .create();

        let temp = TempDir::new().unwrap();

        cli_with_config_dir(temp.path())
            .arg("repo")
            .arg("verify")
            .arg("--platform")
            .arg("gitlab")
            .env("REPOBEE_BASE_URL", &base_url)
            .env("REPOBEE_TOKEN", "bad-token")
            .env("REPOBEE_ORG", "test-org")
            .env("REPOBEE_USER", "testuser")
            .assert()
            .failure()
            .stderr(predicate::str::contains("Verification failed"));
    }

    #[test]
    fn verify_gitlab_org_not_found() {
        let mut server = mockito::Server::new();
        let base_url = format!("{}/api/v4", server.url());

        let _user_mock = server
            .mock("GET", "/api/v4/user")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(gitlab_user_json("testuser"))
            .create();

        let _group_mock = server
            .mock("GET", "/api/v4/groups/nonexistent")
            .with_status(404)
            .with_body("Not found")
            .create();

        let temp = TempDir::new().unwrap();

        cli_with_config_dir(temp.path())
            .arg("repo")
            .arg("verify")
            .arg("--platform")
            .arg("gitlab")
            .env("REPOBEE_BASE_URL", &base_url)
            .env("REPOBEE_TOKEN", "test-token")
            .env("REPOBEE_ORG", "nonexistent")
            .env("REPOBEE_USER", "testuser")
            .assert()
            .failure();
    }
}

// ============================================================================
// Repo Setup Integration Tests (with Local platform)
// ============================================================================

mod repo_setup_tests {
    use super::*;

    #[test]
    fn setup_with_local_platform_parses_yaml_teams() {
        let temp = TempDir::new().unwrap();
        let base_dir = temp.path().join("repos");
        let work_dir = temp.path().join("work");

        // Create students YAML
        let students_yaml = create_students_yaml(
            temp.path(),
            r#"
- members:
    - alice
    - bob
  name: team-alpha
- members:
    - charlie
  name: team-beta
"#,
        );

        // This test verifies YAML parsing and CLI argument handling.
        // The setup will fail to clone templates (no template repos exist),
        // but we verify the CLI correctly parses and displays teams.
        cli_with_config_dir(temp.path())
            .arg("repo")
            .arg("setup")
            .arg("--platform")
            .arg("local")
            .arg("--template")
            .arg("assignment1")
            .arg("--teams-file")
            .arg(students_yaml.to_str().unwrap())
            .arg("--work-dir")
            .arg(work_dir.to_str().unwrap())
            .env("REPOBEE_BASE_URL", base_dir.to_str().unwrap())
            .env("REPOBEE_ORG", "course")
            .env("REPOBEE_USER", "teacher")
            .assert()
            .stdout(predicate::str::contains("RepoBee Setup"))
            .stdout(predicate::str::contains("Teams: 2"));
    }

    #[test]
    fn setup_with_inline_teams() {
        let temp = TempDir::new().unwrap();
        let base_dir = temp.path().join("repos");
        let work_dir = temp.path().join("work");

        // This test verifies inline team parsing via --team arguments.
        // The setup will fail to clone templates, but we verify the CLI
        // correctly parses teams from command line arguments.
        cli_with_config_dir(temp.path())
            .arg("repo")
            .arg("setup")
            .arg("--platform")
            .arg("local")
            .arg("--template")
            .arg("hw1")
            .arg("--team")
            .arg("team1:alice,bob")
            .arg("--team")
            .arg("team2:charlie")
            .arg("--work-dir")
            .arg(work_dir.to_str().unwrap())
            .env("REPOBEE_BASE_URL", base_dir.to_str().unwrap())
            .env("REPOBEE_ORG", "course")
            .env("REPOBEE_USER", "teacher")
            .assert()
            .stdout(predicate::str::contains("Teams: 2"));
    }

    #[test]
    fn setup_fails_without_teams() {
        let temp = TempDir::new().unwrap();
        let base_dir = temp.path().join("repos");
        let work_dir = temp.path().join("work");

        // When no teams are provided and the default yaml_file doesn't exist,
        // CLI should fail with a file read error (default config has yaml_file="students.yaml")
        cli_with_config_dir(temp.path())
            .arg("repo")
            .arg("setup")
            .arg("--platform")
            .arg("local")
            .arg("--template")
            .arg("hw1")
            .arg("--work-dir")
            .arg(work_dir.to_str().unwrap())
            .env("REPOBEE_BASE_URL", base_dir.to_str().unwrap())
            .env("REPOBEE_ORG", "course")
            .env("REPOBEE_USER", "teacher")
            .assert()
            .failure()
            .stderr(predicate::str::contains("Failed to read teams file"));
    }

    #[test]
    fn setup_fails_with_invalid_yaml_file() {
        let temp = TempDir::new().unwrap();
        let base_dir = temp.path().join("repos");
        let work_dir = temp.path().join("work");

        cli_with_config_dir(temp.path())
            .arg("repo")
            .arg("setup")
            .arg("--platform")
            .arg("local")
            .arg("--template")
            .arg("hw1")
            .arg("--teams-file")
            .arg("/nonexistent/students.yaml")
            .arg("--work-dir")
            .arg(work_dir.to_str().unwrap())
            .env("REPOBEE_BASE_URL", base_dir.to_str().unwrap())
            .env("REPOBEE_ORG", "course")
            .env("REPOBEE_USER", "teacher")
            .assert()
            .failure()
            .stderr(predicate::str::contains("Failed to read teams file"));
    }

    #[test]
    fn setup_multiple_templates() {
        let temp = TempDir::new().unwrap();
        let base_dir = temp.path().join("repos");
        let work_dir = temp.path().join("work");

        // This test verifies multiple template arguments are parsed correctly.
        // The setup will fail to clone templates, but we verify the CLI
        // correctly displays all specified templates.
        cli_with_config_dir(temp.path())
            .arg("repo")
            .arg("setup")
            .arg("--platform")
            .arg("local")
            .arg("--template")
            .arg("hw1")
            .arg("--template")
            .arg("hw2")
            .arg("--template")
            .arg("hw3")
            .arg("--team")
            .arg("alice")
            .arg("--work-dir")
            .arg(work_dir.to_str().unwrap())
            .env("REPOBEE_BASE_URL", base_dir.to_str().unwrap())
            .env("REPOBEE_ORG", "course")
            .env("REPOBEE_USER", "teacher")
            .assert()
            .stdout(predicate::str::contains("Templates:"))
            .stdout(predicate::str::contains("hw1"))
            .stdout(predicate::str::contains("hw2"))
            .stdout(predicate::str::contains("hw3"));
    }
}

// ============================================================================
// Repo Setup with Mocked GitLab
// ============================================================================

mod repo_setup_gitlab_tests {
    use super::*;

    fn gitlab_user_json(username: &str) -> String {
        format!(r#"{{"id":1,"username":"{}"}}"#, username)
    }

    fn gitlab_group_json(id: u64, name: &str) -> String {
        format!(
            r#"{{"id":{},"name":"{}","path":"{}","full_path":"{}"}}"#,
            id, name, name, name
        )
    }

    fn gitlab_members_json(usernames: &[&str]) -> String {
        let members: Vec<String> = usernames
            .iter()
            .map(|u| format!(r#"{{"username":"{}","access_level":30}}"#, u))
            .collect();
        format!("[{}]", members.join(","))
    }

    #[test]
    fn setup_gitlab_parses_args_and_verifies_platform() {
        let mut server = mockito::Server::new();
        let base_url = server.url();
        let api_url = format!("{}/api/v4", base_url);

        // Mock user verification
        let _user_mock = server
            .mock("GET", "/api/v4/user")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(gitlab_user_json("teacher"))
            .create();

        // Mock group lookup
        let _group_mock = server
            .mock("GET", "/api/v4/groups/course")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(gitlab_group_json(1, "course"))
            .create();

        // Mock members lookup
        let _members_mock = server
            .mock("GET", "/api/v4/groups/1/members/all")
            .match_query(mockito::Matcher::Any)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(gitlab_members_json(&["teacher"]))
            .create();

        let temp = TempDir::new().unwrap();
        let work_dir = temp.path().join("work");

        // This test verifies the CLI correctly parses args and performs platform verification.
        // The setup will fail when trying to clone templates (mockito doesn't support git),
        // but we verify the initial setup steps work correctly.
        cli_with_config_dir(temp.path())
            .arg("repo")
            .arg("setup")
            .arg("--platform")
            .arg("gitlab")
            .arg("--template")
            .arg("hw1")
            .arg("--team")
            .arg("alice")
            .arg("--work-dir")
            .arg(work_dir.to_str().unwrap())
            .env("REPOBEE_BASE_URL", &api_url)
            .env("REPOBEE_TOKEN", "test-token")
            .env("REPOBEE_ORG", "course")
            .env("REPOBEE_USER", "teacher")
            .assert()
            .stdout(predicate::str::contains("RepoBee Setup"))
            .stdout(predicate::str::contains("Platform: Some(GitLab)"))
            .stdout(predicate::str::contains("Platform verified"));
    }

    #[test]
    fn setup_gitlab_fails_without_token() {
        let temp = TempDir::new().unwrap();
        let work_dir = temp.path().join("work");

        cli_with_config_dir(temp.path())
            .arg("repo")
            .arg("setup")
            .arg("--platform")
            .arg("gitlab")
            .arg("--template")
            .arg("hw1")
            .arg("--team")
            .arg("alice")
            .arg("--work-dir")
            .arg(work_dir.to_str().unwrap())
            .env("REPOBEE_BASE_URL", "https://gitlab.example.com")
            .env("REPOBEE_ORG", "course")
            .env("REPOBEE_USER", "teacher")
            // No REPOBEE_TOKEN
            .assert()
            .failure()
            .stderr(predicate::str::contains("Token required"));
    }
}

// ============================================================================
// Environment Variable Configuration Tests
// ============================================================================

mod env_config_tests {
    use super::*;

    #[test]
    fn config_from_env_vars() {
        let temp = TempDir::new().unwrap();

        // Just verify the CLI accepts env vars (even if verify fails due to no server)
        cli_with_config_dir(temp.path())
            .arg("repo")
            .arg("verify")
            .arg("--platform")
            .arg("gitlab")
            .env("REPOBEE_BASE_URL", "https://gitlab.example.com/api/v4")
            .env("REPOBEE_TOKEN", "test-token")
            .env("REPOBEE_ORG", "my-org")
            .env("REPOBEE_USER", "my-user")
            .assert()
            .failure() // Will fail because can't connect, but that's expected
            .stdout(predicate::str::contains("Verifying platform"));
    }
}
