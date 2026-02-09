//! Group naming utilities.
//!
//! Generates group names from member names using consistent formatting rules.

use super::slug::slugify;
use crate::generated::types::RosterMember;
use std::collections::HashSet;

/// Maximum number of surnames to include before truncating with "+N".
const MAX_SURNAMES: usize = 5;

/// Extract the first word from a name (typically first name).
fn first_word(name: &str) -> &str {
    name.split_whitespace().next().unwrap_or("")
}

/// Extract the last word from a name (typically last name/surname).
fn last_word(name: &str) -> &str {
    name.split_whitespace().last().unwrap_or("")
}

/// Generate a group name from member(s).
///
/// # Naming Rules
/// - 1 member: `firstname_lastname` (e.g., `alice_smith`)
/// - 2-5 members: all surnames with dashes (e.g., `smith-jones-lee`)
/// - 6+ members: 5 surnames + remainder (e.g., `smith-jones-lee-patel-chen-+2`)
///
/// All names are slugified (lowercase, ASCII, no special chars).
pub fn generate_group_name(members: &[&RosterMember]) -> String {
    match members.len() {
        0 => String::from("empty-group"),
        1 => {
            let member = members[0];
            let first = slugify(first_word(&member.name));
            let last = slugify(last_word(&member.name));
            if first.is_empty() && last.is_empty() {
                // Fallback for empty/unparseable names
                format!("member-{}", short_id(&member.id.0))
            } else if first.is_empty() {
                last
            } else if last.is_empty() {
                first
            } else {
                format!("{}_{}", first, last)
            }
        }
        n if n <= MAX_SURNAMES => {
            let surnames: Vec<String> = members
                .iter()
                .map(|m| {
                    let surname = slugify(last_word(&m.name));
                    if surname.is_empty() {
                        short_id(&m.id.0)
                    } else {
                        surname
                    }
                })
                .collect();
            surnames.join("-")
        }
        n => {
            let surnames: Vec<String> = members
                .iter()
                .take(MAX_SURNAMES)
                .map(|m| {
                    let surname = slugify(last_word(&m.name));
                    if surname.is_empty() {
                        short_id(&m.id.0)
                    } else {
                        surname
                    }
                })
                .collect();
            let remainder = n - MAX_SURNAMES;
            format!("{}-+{}", surnames.join("-"), remainder)
        }
    }
}

/// Generate a short ID suffix from a UUID (first 4 hex chars).
fn short_id(id: &str) -> String {
    // UUIDs are formatted as xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    // Take first 4 chars (before first hyphen)
    id.chars()
        .filter(|c| c.is_ascii_hexdigit())
        .take(4)
        .collect::<String>()
        .to_lowercase()
}

/// Resolve a name collision by appending a suffix.
///
/// # Rules
/// - For individuals (single member): append `_<short_id>` (e.g., `alice_smith_a1b2`)
/// - For groups: append incrementing `-N` suffix (e.g., `smith-jones-2`)
pub fn resolve_collision(
    base_name: &str,
    existing_names: &HashSet<String>,
    member_id: Option<&str>,
) -> String {
    // For individuals with a member_id, use the ID suffix
    if let Some(id) = member_id {
        let suffix = short_id(id);
        let new_name = format!("{}_{}", base_name, suffix);
        if !existing_names.contains(&new_name) {
            return new_name;
        }
        // If still collides (unlikely), fall through to numeric suffix
    }

    // For groups or if ID suffix still collides, use numeric suffix
    let mut counter = 2;
    loop {
        let new_name = format!("{}-{}", base_name, counter);
        if !existing_names.contains(&new_name) {
            return new_name;
        }
        counter += 1;
        // Safety limit to prevent infinite loop
        if counter > 1000 {
            // Last resort: use random suffix
            return format!(
                "{}-{}",
                base_name,
                uuid::Uuid::new_v4().to_string().split('-').next().unwrap()
            );
        }
    }
}

/// Generate a unique group name, resolving collisions if needed.
pub fn generate_unique_group_name(
    members: &[&RosterMember],
    existing_names: &HashSet<String>,
) -> String {
    let base_name = generate_group_name(members);

    if !existing_names.contains(&base_name) {
        return base_name;
    }

    // For single-member groups, use member ID for collision resolution
    let member_id = if members.len() == 1 {
        Some(members[0].id.0.as_str())
    } else {
        None
    };

    resolve_collision(&base_name, existing_names, member_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generated::types::{
        EnrollmentType, GitUsernameStatus, MemberStatus, RosterMemberId,
    };

    fn make_member(name: &str) -> RosterMember {
        RosterMember {
            id: RosterMemberId(uuid::Uuid::new_v4().to_string()),
            name: name.to_string(),
            email: format!("{}@test.edu", name.to_lowercase().replace(' ', ".")),
            student_number: None,
            git_username: None,
            git_username_status: GitUsernameStatus::Unknown,
            status: MemberStatus::Active,
            lms_user_id: None,
            enrollment_type: EnrollmentType::Student,
            enrollment_display: None,
            department: None,
            institution: None,
            source: "local".to_string(),
        }
    }

    #[test]
    fn test_single_member_name() {
        let alice = make_member("Alice Smith");
        let name = generate_group_name(&[&alice]);
        assert_eq!(name, "alice_smith");
    }

    #[test]
    fn test_single_member_unicode() {
        let jose = make_member("José García");
        let name = generate_group_name(&[&jose]);
        assert_eq!(name, "jose_garcia");
    }

    #[test]
    fn test_two_members() {
        let alice = make_member("Alice Smith");
        let bob = make_member("Bob Jones");
        let name = generate_group_name(&[&alice, &bob]);
        assert_eq!(name, "smith-jones");
    }

    #[test]
    fn test_five_members() {
        let members: Vec<RosterMember> = [
            "Alice Smith",
            "Bob Jones",
            "Carol Lee",
            "David Park",
            "Eve Chen",
        ]
        .iter()
        .map(|n| make_member(n))
        .collect();
        let refs: Vec<&RosterMember> = members.iter().collect();
        let name = generate_group_name(&refs);
        assert_eq!(name, "smith-jones-lee-park-chen");
    }

    #[test]
    fn test_six_plus_members() {
        let members: Vec<RosterMember> = [
            "Alice Smith",
            "Bob Jones",
            "Carol Lee",
            "David Park",
            "Eve Chen",
            "Frank Wilson",
            "Grace Brown",
        ]
        .iter()
        .map(|n| make_member(n))
        .collect();
        let refs: Vec<&RosterMember> = members.iter().collect();
        let name = generate_group_name(&refs);
        assert_eq!(name, "smith-jones-lee-park-chen-+2");
    }

    #[test]
    fn test_collision_resolution_individual() {
        let mut existing = HashSet::new();
        existing.insert("alice_smith".to_string());

        let resolved = resolve_collision("alice_smith", &existing, Some("a1b2c3d4-xxxx-xxxx"));
        assert!(resolved.starts_with("alice_smith_"));
        assert_ne!(resolved, "alice_smith");
    }

    #[test]
    fn test_collision_resolution_group() {
        let mut existing = HashSet::new();
        existing.insert("smith-jones".to_string());

        let resolved = resolve_collision("smith-jones", &existing, None);
        assert_eq!(resolved, "smith-jones-2");

        existing.insert("smith-jones-2".to_string());
        let resolved = resolve_collision("smith-jones", &existing, None);
        assert_eq!(resolved, "smith-jones-3");
    }

    #[test]
    fn test_empty_group() {
        let name = generate_group_name(&[]);
        assert_eq!(name, "empty-group");
    }

    #[test]
    fn test_unique_name_no_collision() {
        let alice = make_member("Alice Smith");
        let existing = HashSet::new();
        let name = generate_unique_group_name(&[&alice], &existing);
        assert_eq!(name, "alice_smith");
    }

    #[test]
    fn test_unique_name_with_collision() {
        let alice = make_member("Alice Smith");
        let mut existing = HashSet::new();
        existing.insert("alice_smith".to_string());
        let name = generate_unique_group_name(&[&alice], &existing);
        assert!(name.starts_with("alice_smith_"));
        assert!(!existing.contains(&name));
    }
}
