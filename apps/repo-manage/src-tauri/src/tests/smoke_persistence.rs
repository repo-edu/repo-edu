#[cfg(test)]
mod smoke_tests {
    use repo_manage_core::roster::{Roster, Student, StudentDraft};
    use repo_manage_core::{CourseInfo, SettingsManager};

    #[tokio::test]
    async fn smoke_profile_roster_roundtrip() {
        let temp_dir = tempfile::tempdir().unwrap();
        let manager = SettingsManager::new_with_dir(temp_dir.path().to_path_buf()).unwrap();

        let course = CourseInfo {
            id: "123".into(),
            name: "Test Course".into(),
        };
        let _profile = manager
            .create_profile("test-profile", course.clone())
            .unwrap();

        let student = Student::new(StudentDraft {
            name: "Test Student".to_string(),
            email: "test@example.com".to_string(),
            ..Default::default()
        });
        let roster = Roster {
            students: vec![student.clone()],
            assignments: vec![],
            source: None,
        };

        manager.save_roster("test-profile", &roster).unwrap();

        let loaded = manager.load_roster("test-profile").unwrap();
        assert!(loaded.is_some());
        assert_eq!(loaded.unwrap().students.len(), 1);

        manager.delete_profile("test-profile").unwrap();
        let loaded_after = manager.load_roster("test-profile").unwrap();
        assert!(loaded_after.is_none());
    }
}
