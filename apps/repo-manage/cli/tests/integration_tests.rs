use assert_cmd::Command;
use predicates::prelude::*;

fn cli() -> Command {
    Command::new(env!("CARGO_BIN_EXE_redu"))
}

mod help_tests {
    use super::*;

    #[test]
    fn test_help() {
        cli()
            .arg("--help")
            .assert()
            .success()
            .stdout(predicate::str::contains(
                "Repository management for education",
            ));
    }

    #[test]
    fn test_version() {
        cli().arg("--version").assert().success();
    }

    #[test]
    fn test_markdown_help() {
        cli()
            .arg("--markdown-help")
            .assert()
            .success()
            .stdout(predicate::str::contains(
                "Repository management for education",
            ));
    }
}

mod profile_tests {
    use super::*;

    #[test]
    fn test_profile_list_help() {
        cli().args(["profile", "list", "--help"]).assert().success();
    }

    #[test]
    fn test_profile_subcommands() {
        cli()
            .args(["profile", "--help"])
            .assert()
            .success()
            .stdout(predicate::str::contains("list"))
            .stdout(predicate::str::contains("active"))
            .stdout(predicate::str::contains("show"))
            .stdout(predicate::str::contains("load"));
    }
}

mod roster_tests {
    use super::*;

    #[test]
    fn test_roster_show_help() {
        cli()
            .args(["roster", "show", "--help"])
            .assert()
            .success()
            .stdout(predicate::str::contains("--students"))
            .stdout(predicate::str::contains("--assignments"));
    }
}

mod lms_tests {
    use super::*;

    #[test]
    fn test_lms_subcommands() {
        cli()
            .args(["lms", "--help"])
            .assert()
            .success()
            .stdout(predicate::str::contains("verify"))
            .stdout(predicate::str::contains("import-students"))
            .stdout(predicate::str::contains("import-groups"));
    }

    #[test]
    fn test_lms_import_groups_requires_assignment() {
        cli()
            .args(["lms", "import-groups"])
            .assert()
            .failure()
            .stderr(predicate::str::contains("--assignment"));
    }
}

mod git_tests {
    use super::*;

    #[test]
    fn test_git_verify_help() {
        cli()
            .args(["git", "verify", "--help"])
            .assert()
            .success()
            .stdout(predicate::str::contains("--profile"));
    }
}

mod repo_tests {
    use super::*;

    #[test]
    fn test_repo_subcommands() {
        cli()
            .args(["repo", "--help"])
            .assert()
            .success()
            .stdout(predicate::str::contains("create"))
            .stdout(predicate::str::contains("clone"))
            .stdout(predicate::str::contains("delete"));
    }

    #[test]
    fn test_repo_create_requires_assignment() {
        cli()
            .args(["repo", "create"])
            .assert()
            .failure()
            .stderr(predicate::str::contains("--assignment"));
    }

    #[test]
    fn test_repo_clone_requires_assignment() {
        cli()
            .args(["repo", "clone"])
            .assert()
            .failure()
            .stderr(predicate::str::contains("--assignment"));
    }

    #[test]
    fn test_repo_delete_requires_assignment() {
        cli()
            .args(["repo", "delete"])
            .assert()
            .failure()
            .stderr(predicate::str::contains("--assignment"));
    }

    #[test]
    fn test_repo_clone_help() {
        cli()
            .args(["repo", "clone", "--help"])
            .assert()
            .success()
            .stdout(predicate::str::contains("--assignment"))
            .stdout(predicate::str::contains("--target"))
            .stdout(predicate::str::contains("--layout"));
    }

    #[test]
    fn test_repo_create_dry_run_option() {
        cli()
            .args(["repo", "create", "--help"])
            .assert()
            .success()
            .stdout(predicate::str::contains("--dry-run"));
    }
}

mod validate_tests {
    use super::*;

    #[test]
    fn test_validate_requires_assignment() {
        cli()
            .args(["validate"])
            .assert()
            .failure()
            .stderr(predicate::str::contains("--assignment"));
    }

    #[test]
    fn test_validate_help() {
        cli()
            .args(["validate", "--help"])
            .assert()
            .success()
            .stdout(predicate::str::contains("--assignment"))
            .stdout(predicate::str::contains("--profile"));
    }
}
