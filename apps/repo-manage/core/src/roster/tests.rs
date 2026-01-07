#[cfg(test)]
mod smoke_tests {
    use crate::roster::*;

    #[test]
    fn smoke_roster_validation_roundtrip() {
        let student = Student::new(StudentDraft {
            name: "Test Student".to_string(),
            email: "test@example.com".to_string(),
            ..Default::default()
        });

        let roster = Roster {
            students: vec![student],
            assignments: vec![],
            source: None,
        };

        let result = validate_roster(&roster);
        assert!(!result.has_blocking_issues());
    }

    #[test]
    fn smoke_slugification() {
        assert_eq!(slugify("Test Assignment"), "test-assignment");
        assert_eq!(slugify("Müller"), "muller");
        assert_eq!(slugify("C++"), "c");
    }

    #[test]
    fn smoke_id_generation() {
        let id = generate_student_id();
        assert_eq!(id.as_str().len(), 21);
        assert!(id
            .as_str()
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'));
    }
}
