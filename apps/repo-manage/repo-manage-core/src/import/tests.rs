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
}
