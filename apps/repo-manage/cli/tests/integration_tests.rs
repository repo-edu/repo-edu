//! Integration tests for redu CLI.

use assert_cmd::cargo::cargo_bin_cmd;
use assert_cmd::Command;
use predicates::prelude::*;
use repo_manage_core::roster::{Assignment, Group, GroupDraft, Roster, Student, StudentDraft};
use repo_manage_core::{ProfileSettings, SettingsManager};
use std::path::Path;
use tempfile::TempDir;

fn cli() -> Command {
    let mut cmd = cargo_bin_cmd!("redu");
    let test_dir = TempDir::new().unwrap();
    let test_path = test_dir.keep();
    cmd.env("REPOBEE_CONFIG_DIR", test_path.to_str().unwrap());
    cmd
}

fn cli_with_config_dir(config_dir: &Path) -> Command {
    let mut cmd = cargo_bin_cmd!("redu");
    cmd.env("REPOBEE_CONFIG_DIR", config_dir.to_str().unwrap());
    cmd
}

fn setup_profile(config_dir: &Path, name: &str) {
    let manager = SettingsManager::new_with_dir(config_dir.to_path_buf()).unwrap();
    let mut settings = ProfileSettings::default();
    settings.course.id = "cs101".to_string();
    settings.course.name = "Intro to CS".to_string();
    settings.operations.target_org = "course-org".to_string();
    settings.operations.repo_name_template = "{assignment}-{group}".to_string();
    settings.git_connection = Some("git-default".to_string());

    manager.save_profile_settings(name, &settings).unwrap();
    manager.set_active_profile(name).unwrap();
}

fn setup_roster(config_dir: &Path, name: &str) {
    let manager = SettingsManager::new_with_dir(config_dir.to_path_buf()).unwrap();
    let mut roster = Roster::empty();

    let alice = Student::new(StudentDraft {
        name: "Alice".to_string(),
        email: "alice@example.com".to_string(),
        student_number: None,
        git_username: Some("alice-gh".to_string()),
        lms_user_id: None,
        custom_fields: std::collections::HashMap::new(),
    });
    let bob = Student::new(StudentDraft {
        name: "Bob".to_string(),
        email: "bob@example.com".to_string(),
        student_number: None,
        git_username: None,
        lms_user_id: None,
        custom_fields: std::collections::HashMap::new(),
    });

    let mut assignment = Assignment::new("task-1", None);
    let group = Group::new(GroupDraft {
        name: "team-alpha".to_string(),
        member_ids: vec![alice.id.clone(), bob.id.clone()],
    });
    assignment.groups.push(group);

    roster.students.push(alice);
    roster.students.push(bob);
    roster.assignments.push(assignment);

    manager.save_roster(name, &roster).unwrap();
}

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

#[test]
fn test_no_command_shows_usage() {
    cli()
        .assert()
        .success()
        .stdout(predicate::str::contains("Usage:"));
}

#[test]
fn test_markdown_help() {
    cli()
        .arg("--markdown-help")
        .assert()
        .success()
        .stdout(predicate::str::contains("# Command-Line Help for `redu`"));
}

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
fn test_profile_list_no_profiles() {
    cli()
        .arg("profile")
        .arg("list")
        .assert()
        .success()
        .stdout(predicate::str::contains("No profiles configured."));
}

#[test]
fn test_profile_active_no_active() {
    cli()
        .arg("profile")
        .arg("active")
        .assert()
        .success()
        .stdout(predicate::str::contains("No active profile"));
}

#[test]
fn test_profile_show_requires_active() {
    cli()
        .arg("profile")
        .arg("show")
        .assert()
        .failure()
        .stderr(predicate::str::contains("No active profile"));
}

#[test]
fn test_profile_show_with_active() {
    let temp = TempDir::new().unwrap();
    setup_profile(temp.path(), "default");

    cli_with_config_dir(temp.path())
        .arg("profile")
        .arg("show")
        .assert()
        .success()
        .stdout(predicate::str::contains("Profile: default"))
        .stdout(predicate::str::contains("Course: Intro to CS (cs101)"))
        .stdout(predicate::str::contains("Target org: course-org"))
        .stdout(predicate::str::contains(
            "Repo template: {assignment}-{group}",
        ));
}

#[test]
fn test_roster_show_with_details() {
    let temp = TempDir::new().unwrap();
    setup_profile(temp.path(), "default");
    setup_roster(temp.path(), "default");

    cli_with_config_dir(temp.path())
        .arg("--profile")
        .arg("default")
        .arg("roster")
        .arg("show")
        .arg("--students")
        .arg("--assignments")
        .assert()
        .success()
        .stdout(predicate::str::contains("Roster Summary"))
        .stdout(predicate::str::contains("Students: 2"))
        .stdout(predicate::str::contains("Assignments: 1"))
        .stdout(predicate::str::contains("Students (2):"))
        .stdout(predicate::str::contains("alice@example.com"))
        .stdout(predicate::str::contains("team-alpha"));
}

#[test]
fn test_roster_help() {
    cli()
        .arg("roster")
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("Show roster information"))
        .stdout(predicate::str::contains("show"));
}

#[test]
fn test_lms_help() {
    cli()
        .arg("lms")
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("LMS operations"))
        .stdout(predicate::str::contains("verify"))
        .stdout(predicate::str::contains("import-students"))
        .stdout(predicate::str::contains("import-groups"));
}

#[test]
fn test_git_help() {
    cli()
        .arg("git")
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("Git platform operations"))
        .stdout(predicate::str::contains("verify"));
}

#[test]
fn test_repo_help() {
    cli()
        .arg("repo")
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("Repository operations"))
        .stdout(predicate::str::contains("create"))
        .stdout(predicate::str::contains("clone"))
        .stdout(predicate::str::contains("delete"));
}

#[test]
fn test_validate_help() {
    cli()
        .arg("validate")
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("Validate assignment readiness"))
        .stdout(predicate::str::contains("--assignment"));
}

#[test]
fn test_invalid_subcommand() {
    cli()
        .arg("nonexistent")
        .assert()
        .failure()
        .stderr(predicate::str::contains("unrecognized subcommand"));
}
