#[cfg(test)]
mod smoke_tests {
    use crate::roster::*;

    #[test]
    fn smoke_roster_validation_roundtrip() {
        let member = RosterMember::new(RosterMemberDraft {
            name: "Test Student".to_string(),
            email: "test@example.com".to_string(),
            ..Default::default()
        });

        let mut roster = Roster {
            connection: None,
            students: vec![member],
            staff: Vec::new(),
            groups: Vec::new(),
            group_sets: Vec::new(),
            assignments: vec![],
        };
        ensure_system_group_sets(&mut roster);

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
        let id = generate_roster_member_id();
        assert!(uuid::Uuid::parse_str(id.as_str()).is_ok());
    }

    #[test]
    fn smoke_member_new_uses_provided_member_id() {
        let member = RosterMember::new(RosterMemberDraft {
            member_id: Some("member-123".to_string()),
            name: "Test".to_string(),
            email: "test@example.com".to_string(),
            ..Default::default()
        });
        assert_eq!(member.id.as_str(), "member-123");
    }
}
