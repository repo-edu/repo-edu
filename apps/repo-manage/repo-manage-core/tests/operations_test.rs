//! Integration tests for core operations
//!
//! These tests verify the orchestration logic in the setup module,
//! using LocalAPI for filesystem-based testing without network calls.

use repo_manage_core::{
    platform::{LocalAPI, Platform, PlatformAPI},
    setup::{clone_template, create_student_repos, push_to_repo, setup_teams},
    types::{StudentTeam, TeamPermission, TemplateRepo},
};
use std::fs;
use std::path::Path;
use tempfile::TempDir;

// ============================================================================
// Test Helpers
// ============================================================================

/// Create a minimal git repository with one commit
fn create_test_git_repo(path: &Path) -> git2::Repository {
    let repo = git2::Repository::init(path).expect("Failed to init repo");

    let mut config = repo.config().unwrap();
    config.set_str("user.name", "Test User").unwrap();
    config.set_str("user.email", "test@example.com").unwrap();

    fs::write(path.join("README.md"), "# Test Template\n").unwrap();

    let mut index = repo.index().unwrap();
    index.add_path(Path::new("README.md")).unwrap();
    index.write().unwrap();

    let tree_id = index.write_tree().unwrap();
    let sig = repo.signature().unwrap();

    {
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])
            .unwrap();
    }

    repo
}

/// Create a LocalAPI instance for testing
fn create_local_api(base_dir: &Path) -> LocalAPI {
    LocalAPI::new(
        base_dir.to_path_buf(),
        "test-org".to_string(),
        "teacher".to_string(),
    )
    .unwrap()
}

// ============================================================================
// setup_teams Tests
// ============================================================================

mod setup_teams_tests {
    use super::*;

    #[tokio::test]
    async fn creates_new_teams() {
        let temp = TempDir::new().unwrap();
        let api = create_local_api(temp.path());

        let student_teams = vec![
            StudentTeam::new(vec!["alice".into(), "bob".into()]),
            StudentTeam::new(vec!["charlie".into()]),
        ];

        let result = setup_teams(&student_teams, &api, TeamPermission::Push).await;

        assert!(result.is_ok());
        let teams = result.unwrap();
        assert_eq!(teams.len(), 2);
        assert_eq!(teams[0].members.len(), 2);
        assert_eq!(teams[1].members.len(), 1);
    }

    #[tokio::test]
    async fn preserves_existing_teams() {
        let temp = TempDir::new().unwrap();
        let api = create_local_api(temp.path());

        // Create team first
        api.create_team("alice-bob", Some(&["alice".into()]), TeamPermission::Push)
            .await
            .unwrap();

        // Setup with same team name but additional member
        let student_teams = vec![StudentTeam::with_name(
            "alice-bob".into(),
            vec!["alice".into(), "bob".into()],
        )];

        let result = setup_teams(&student_teams, &api, TeamPermission::Push).await;

        assert!(result.is_ok());
        let teams = result.unwrap();
        assert_eq!(teams.len(), 1);
        // Should have both members now
        assert_eq!(teams[0].members.len(), 2);
    }

    #[tokio::test]
    async fn handles_empty_teams_list() {
        let temp = TempDir::new().unwrap();
        let api = create_local_api(temp.path());

        let result = setup_teams(&[], &api, TeamPermission::Push).await;

        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn creates_teams_with_sorted_members() {
        let temp = TempDir::new().unwrap();
        let api = create_local_api(temp.path());

        // Members in non-alphabetical order
        let student_teams = vec![StudentTeam::new(vec![
            "charlie".into(),
            "alice".into(),
            "bob".into(),
        ])];

        let result = setup_teams(&student_teams, &api, TeamPermission::Push).await;

        assert!(result.is_ok());
        let teams = result.unwrap();
        // StudentTeam::new sorts members, so team name should be sorted
        assert_eq!(teams[0].name, "alice-bob-charlie");
    }
}

// ============================================================================
// create_student_repos Tests
// ============================================================================

mod create_student_repos_tests {
    use super::*;

    #[tokio::test]
    async fn creates_repos_for_each_team_template_combination() {
        let temp = TempDir::new().unwrap();
        let api = create_local_api(temp.path());

        let team1 = api
            .create_team("team1", Some(&["alice".into()]), TeamPermission::Push)
            .await
            .unwrap();
        let team2 = api
            .create_team("team2", Some(&["bob".into()]), TeamPermission::Push)
            .await
            .unwrap();

        let templates = vec![
            TemplateRepo::new("hw1".into(), "url1".into()),
            TemplateRepo::new("hw2".into(), "url2".into()),
        ];

        let result = create_student_repos(&[team1, team2], &templates, &api, true).await;

        assert!(result.is_ok());
        let (created, existing) = result.unwrap();

        // 2 teams × 2 templates = 4 repos
        assert_eq!(created.len(), 4);
        assert!(existing.is_empty());

        // Verify naming convention
        let names: Vec<&str> = created.iter().map(|r| r.name.as_str()).collect();
        assert!(names.contains(&"team1-hw1"));
        assert!(names.contains(&"team1-hw2"));
        assert!(names.contains(&"team2-hw1"));
        assert!(names.contains(&"team2-hw2"));
    }

    #[tokio::test]
    async fn reports_existing_repos_separately() {
        let temp = TempDir::new().unwrap();
        let api = create_local_api(temp.path());

        let team = api
            .create_team("team1", Some(&["alice".into()]), TeamPermission::Push)
            .await
            .unwrap();

        let templates = vec![TemplateRepo::new("hw1".into(), "url".into())];

        // First creation
        let (created1, existing1) = create_student_repos(&[team.clone()], &templates, &api, true)
            .await
            .unwrap();
        assert_eq!(created1.len(), 1);
        assert!(existing1.is_empty());

        // Second creation - should report as existing
        let (created2, existing2) = create_student_repos(&[team], &templates, &api, true)
            .await
            .unwrap();
        assert!(created2.is_empty());
        assert_eq!(existing2.len(), 1);
    }

    #[tokio::test]
    async fn handles_empty_teams() {
        let temp = TempDir::new().unwrap();
        let api = create_local_api(temp.path());

        let templates = vec![TemplateRepo::new("hw1".into(), "url".into())];

        let result = create_student_repos(&[], &templates, &api, true).await;

        assert!(result.is_ok());
        let (created, existing) = result.unwrap();
        assert!(created.is_empty());
        assert!(existing.is_empty());
    }

    #[tokio::test]
    async fn handles_empty_templates() {
        let temp = TempDir::new().unwrap();
        let api = create_local_api(temp.path());

        let team = api
            .create_team("team1", Some(&["alice".into()]), TeamPermission::Push)
            .await
            .unwrap();

        let result = create_student_repos(&[team], &[], &api, true).await;

        assert!(result.is_ok());
        let (created, existing) = result.unwrap();
        assert!(created.is_empty());
        assert!(existing.is_empty());
    }

    #[tokio::test]
    async fn creates_private_repos_when_specified() {
        let temp = TempDir::new().unwrap();
        let api = create_local_api(temp.path());

        let team = api
            .create_team("team1", None, TeamPermission::Push)
            .await
            .unwrap();

        let templates = vec![TemplateRepo::new("hw1".into(), "url".into())];

        let (created, _) = create_student_repos(&[team], &templates, &api, true)
            .await
            .unwrap();

        assert!(!created[0].url.is_empty());
        // Verify repo was created in the filesystem
        let repo = api.get_repo("team1-hw1", None).await.unwrap();
        assert!(repo.private);
    }

    #[tokio::test]
    async fn assigns_repos_to_teams() {
        let temp = TempDir::new().unwrap();
        let api = create_local_api(temp.path());

        let team = api
            .create_team("team1", Some(&["alice".into()]), TeamPermission::Push)
            .await
            .unwrap();

        let templates = vec![TemplateRepo::new("hw1".into(), "url".into())];

        create_student_repos(&[team.clone()], &templates, &api, true)
            .await
            .unwrap();

        // Verify team assignment
        let team_repos = api.get_team_repos(&team).await.unwrap();
        assert_eq!(team_repos.len(), 1);
        assert_eq!(team_repos[0].name, "team1-hw1");
    }
}

// ============================================================================
// clone_template Tests
// ============================================================================

mod clone_template_tests {
    use super::*;

    #[test]
    fn clones_local_file_url_repo() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("source");
        let dest = temp.path().join("dest");

        fs::create_dir_all(&source).unwrap();
        create_test_git_repo(&source);

        let url = format!("file://{}", source.display());
        let result = clone_template(&url, &dest, None);

        assert!(result.is_ok());
        assert!(dest.join("README.md").exists());

        // Verify content
        let content = fs::read_to_string(dest.join("README.md")).unwrap();
        assert!(content.contains("Test Template"));
    }

    #[test]
    fn fails_on_nonexistent_repo() {
        let temp = TempDir::new().unwrap();
        let dest = temp.path().join("dest");

        let result = clone_template("file:///nonexistent/repo", &dest, None);

        assert!(result.is_err());
    }

    #[test]
    fn fails_if_destination_exists_with_content() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("source");
        let dest = temp.path().join("dest");

        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&dest).unwrap();
        // Add a file to make destination non-empty (git2 may allow cloning into empty dirs)
        fs::write(dest.join("existing.txt"), "existing content").unwrap();
        create_test_git_repo(&source);

        let url = format!("file://{}", source.display());
        let result = clone_template(&url, &dest, None);

        assert!(result.is_err());
    }

    #[test]
    fn clones_with_full_history() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("source");
        let dest = temp.path().join("dest");

        fs::create_dir_all(&source).unwrap();
        let repo = create_test_git_repo(&source);

        // Add a second commit
        fs::write(source.join("file2.txt"), "Second file\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("file2.txt")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = repo.signature().unwrap();
        let parent = repo.head().unwrap().peel_to_commit().unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "Second commit", &tree, &[&parent])
            .unwrap();

        let url = format!("file://{}", source.display());
        clone_template(&url, &dest, None).unwrap();

        // Verify both files exist
        assert!(dest.join("README.md").exists());
        assert!(dest.join("file2.txt").exists());

        // Verify commit history
        let cloned = git2::Repository::open(&dest).unwrap();
        let mut revwalk = cloned.revwalk().unwrap();
        revwalk.push_head().unwrap();
        let commit_count = revwalk.count();
        assert_eq!(commit_count, 2);
    }
}

// ============================================================================
// push_to_repo Tests
// ============================================================================

mod push_to_repo_tests {
    use super::*;

    #[test]
    fn pushes_to_bare_repo() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("source");
        let dest = temp.path().join("dest.git");

        fs::create_dir_all(&source).unwrap();
        create_test_git_repo(&source);
        git2::Repository::init_bare(&dest).unwrap();

        let dest_url = format!("file://{}", dest.display());
        let result = push_to_repo(&source, &dest_url, None);

        assert!(result.is_ok());

        // Verify the bare repo has the commit
        let bare = git2::Repository::open(&dest).unwrap();
        assert!(bare.head().is_ok());

        // Verify we can read the commit
        let head = bare.head().unwrap();
        let commit = head.peel_to_commit().unwrap();
        assert_eq!(commit.message().unwrap(), "Initial commit");
    }

    #[test]
    fn fails_on_invalid_source() {
        let temp = TempDir::new().unwrap();
        let dest = temp.path().join("dest.git");
        git2::Repository::init_bare(&dest).unwrap();

        let dest_url = format!("file://{}", dest.display());
        let result = push_to_repo(Path::new("/nonexistent/repo"), &dest_url, None);

        assert!(result.is_err());
    }

    #[test]
    fn pushes_current_branch() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("source");
        let dest = temp.path().join("dest.git");

        fs::create_dir_all(&source).unwrap();
        create_test_git_repo(&source);
        git2::Repository::init_bare(&dest).unwrap();

        let dest_url = format!("file://{}", dest.display());
        push_to_repo(&source, &dest_url, None).unwrap();

        // Verify the branch name
        let bare = git2::Repository::open(&dest).unwrap();
        let head = bare.head().unwrap();
        let branch_name = head.shorthand().unwrap();
        // Should be "main" or "master" depending on git config
        assert!(branch_name == "main" || branch_name == "master");
    }
}

// ============================================================================
// Full Workflow Tests
// ============================================================================

mod workflow_tests {
    use super::*;

    #[tokio::test]
    async fn complete_setup_workflow_with_local_api() {
        let base_dir = TempDir::new().unwrap();
        let work_dir = TempDir::new().unwrap();

        // Create template repo
        let template_path = work_dir.path().join("template");
        fs::create_dir_all(&template_path).unwrap();
        create_test_git_repo(&template_path);

        // Setup LocalAPI
        let api = Platform::local(
            base_dir.path().to_path_buf(),
            "course-org".into(),
            "teacher".into(),
        )
        .unwrap();

        let student_teams = vec![
            StudentTeam::new(vec!["alice".into(), "bob".into()]),
            StudentTeam::new(vec!["charlie".into()]),
        ];

        // Step 1: Setup teams
        let teams = setup_teams(&student_teams, &api, TeamPermission::Push)
            .await
            .unwrap();
        assert_eq!(teams.len(), 2);

        // Step 2: Create student repos
        let templates = vec![TemplateRepo::new("assignment1".into(), "dummy-url".into())];

        let (created, existing) = create_student_repos(&teams, &templates, &api, true)
            .await
            .unwrap();

        assert_eq!(created.len(), 2); // 2 teams × 1 template
        assert!(existing.is_empty());

        // Verify repo naming follows convention
        assert!(created.iter().any(|r| r.name == "alice-bob-assignment1"));
        assert!(created.iter().any(|r| r.name == "charlie-assignment1"));
    }

    #[tokio::test]
    async fn idempotent_setup_reports_existing() {
        let base_dir = TempDir::new().unwrap();
        let api = create_local_api(base_dir.path());

        let student_teams = vec![StudentTeam::new(vec!["alice".into()])];

        let teams = setup_teams(&student_teams, &api, TeamPermission::Push)
            .await
            .unwrap();

        let templates = vec![TemplateRepo::new("hw".into(), "url".into())];

        // First run
        let (created1, existing1) = create_student_repos(&teams, &templates, &api, true)
            .await
            .unwrap();
        assert_eq!(created1.len(), 1);
        assert!(existing1.is_empty());

        // Second run - idempotent
        let teams2 = setup_teams(&student_teams, &api, TeamPermission::Push)
            .await
            .unwrap();
        let (created2, existing2) = create_student_repos(&teams2, &templates, &api, true)
            .await
            .unwrap();
        assert!(created2.is_empty());
        assert_eq!(existing2.len(), 1);
    }

    #[tokio::test]
    async fn multiple_templates_create_multiple_repos_per_team() {
        let base_dir = TempDir::new().unwrap();
        let api = create_local_api(base_dir.path());

        let student_teams = vec![StudentTeam::new(vec!["alice".into()])];

        let teams = setup_teams(&student_teams, &api, TeamPermission::Push)
            .await
            .unwrap();

        let templates = vec![
            TemplateRepo::new("hw1".into(), "url1".into()),
            TemplateRepo::new("hw2".into(), "url2".into()),
            TemplateRepo::new("hw3".into(), "url3".into()),
        ];

        let (created, _) = create_student_repos(&teams, &templates, &api, true)
            .await
            .unwrap();

        assert_eq!(created.len(), 3);
        assert!(created.iter().any(|r| r.name == "alice-hw1"));
        assert!(created.iter().any(|r| r.name == "alice-hw2"));
        assert!(created.iter().any(|r| r.name == "alice-hw3"));
    }

    #[test]
    fn clone_and_push_workflow() {
        let temp = TempDir::new().unwrap();

        // Create source template
        let template_dir = temp.path().join("template");
        fs::create_dir_all(&template_dir).unwrap();
        create_test_git_repo(&template_dir);

        // Clone template to work directory
        let work_dir = temp.path().join("work");
        let template_url = format!("file://{}", template_dir.display());
        clone_template(&template_url, &work_dir, None).unwrap();

        // Create destination bare repo (simulating student repo)
        let student_repo = temp.path().join("student.git");
        git2::Repository::init_bare(&student_repo).unwrap();

        // Push to student repo
        let student_url = format!("file://{}", student_repo.display());
        push_to_repo(&work_dir, &student_url, None).unwrap();

        // Verify student repo has content
        let bare = git2::Repository::open(&student_repo).unwrap();
        let head = bare.head().unwrap();
        let commit = head.peel_to_commit().unwrap();
        assert_eq!(commit.message().unwrap(), "Initial commit");
    }
}

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

mod edge_cases {
    use super::*;

    #[tokio::test]
    async fn team_names_with_special_characters() {
        let temp = TempDir::new().unwrap();
        let api = create_local_api(temp.path());

        // Team name derived from member names with hyphens
        let student_teams = vec![StudentTeam::new(vec![
            "alice-smith".into(),
            "bob-jones".into(),
        ])];

        let result = setup_teams(&student_teams, &api, TeamPermission::Push).await;

        assert!(result.is_ok());
        let teams = result.unwrap();
        // Name should be sorted: alice-smith-bob-jones
        assert_eq!(teams[0].name, "alice-smith-bob-jones");
    }

    #[tokio::test]
    async fn single_member_team() {
        let temp = TempDir::new().unwrap();
        let api = create_local_api(temp.path());

        let student_teams = vec![StudentTeam::new(vec!["solo-student".into()])];

        let teams = setup_teams(&student_teams, &api, TeamPermission::Push)
            .await
            .unwrap();

        assert_eq!(teams.len(), 1);
        assert_eq!(teams[0].name, "solo-student");
        assert_eq!(teams[0].members.len(), 1);
    }

    #[tokio::test]
    async fn large_number_of_teams() {
        let temp = TempDir::new().unwrap();
        let api = create_local_api(temp.path());

        // Create 50 teams
        let student_teams: Vec<StudentTeam> = (0..50)
            .map(|i| StudentTeam::new(vec![format!("student{}", i)]))
            .collect();

        let teams = setup_teams(&student_teams, &api, TeamPermission::Push)
            .await
            .unwrap();

        assert_eq!(teams.len(), 50);
    }

    #[tokio::test]
    async fn repos_persist_across_api_instances() {
        let temp = TempDir::new().unwrap();

        // First API instance creates repo
        {
            let api = create_local_api(temp.path());
            let team = api
                .create_team("team1", None, TeamPermission::Push)
                .await
                .unwrap();
            let templates = vec![TemplateRepo::new("hw1".into(), "url".into())];
            create_student_repos(&[team], &templates, &api, true)
                .await
                .unwrap();
        }

        // Second API instance should see the repo
        {
            let api = create_local_api(temp.path());
            let repos = api.get_repos(None).await.unwrap();
            assert_eq!(repos.len(), 1);
            assert_eq!(repos[0].name, "team1-hw1");
        }
    }
}
