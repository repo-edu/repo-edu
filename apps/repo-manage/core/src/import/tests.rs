#[cfg(test)]
mod smoke_tests {
    use super::super::{normalize_email, parse_git_usernames_csv, parse_students_csv};

    #[test]
    fn smoke_csv_student_import() {
        let csv_content = "name,email,student_number\nJohn Doe,john@example.com,12345\n";
        let result = parse_students_csv(csv_content.as_bytes()).unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "John Doe");
        assert_eq!(result[0].email, "john@example.com");
    }

    #[test]
    fn smoke_email_normalization() {
        assert_eq!(normalize_email("  John@EXAMPLE.com  "), "john@example.com");
    }

    #[test]
    fn smoke_git_username_csv() {
        let csv_content = "email,git_username\njohn@example.com,johndoe\n";
        let entries = parse_git_usernames_csv(csv_content.as_bytes()).unwrap();

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].email, "john@example.com");
        assert_eq!(entries[0].git_username, "johndoe");
    }

    #[test]
    fn parse_students_csv_accepts_missing_email() {
        let csv_content = "id,name,email,status\nmember-1,No Email,,dropped\n";
        let result = parse_students_csv(csv_content.as_bytes()).unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].member_id.as_deref(), Some("member-1"));
        assert_eq!(result[0].name, "No Email");
        assert_eq!(result[0].email, "");
    }

    #[test]
    fn parse_students_csv_still_requires_name() {
        let csv_content = "id,name,email\nmember-1,,x@example.com\n";
        let result = parse_students_csv(csv_content.as_bytes());
        assert!(result.is_err());
        let message = result.unwrap_err().to_string();
        assert!(message.contains("Missing required fields in rows"));
    }
}
