//! Group naming utilities.
//!
//! Generates group names from member names using consistent formatting rules.
//! Uses the `human_name` crate for proper name parsing, handling international
//! name particles (de, van, von, etc.) and various input formats.

use super::slug::slugify;
use crate::generated::types::RosterMember;
use std::collections::HashSet;

/// Maximum number of surnames to include before truncating with "+N".
const MAX_SURNAMES: usize = 5;

/// Parsed name components for group naming.
struct ParsedName {
    given: String,
    surname: String,
}

/// Convert sortable name format ("Last, First") to display format ("First Last").
///
/// LMS systems use sortable format (e.g., "Jong, Stijn de" or "Smith, Alice").
/// This converts to display format so `human_name` can parse it correctly.
/// Names without a comma are returned unchanged.
fn sortable_to_display(name: &str) -> String {
    let Some(comma_pos) = name.find(',') else {
        return name.to_string();
    };

    let before_comma = name[..comma_pos].trim();
    let after_comma = name[comma_pos + 1..].trim();

    if after_comma.is_empty() {
        before_comma.to_string()
    } else {
        format!("{} {}", after_comma, before_comma)
    }
}

/// Parse a name into given name and surname using `human_name`.
///
/// Handles international name particles (de, van, von, ter, etc.) and
/// various input formats including "First Last" and "Last, First".
/// Falls back to simple first/last word splitting for unparseable names.
fn parse_name(name: &str) -> ParsedName {
    // Convert sortable format to display format for consistent parsing
    let display_name = sortable_to_display(name);
    if let Some(parsed) = human_name::Name::parse(&display_name) {
        ParsedName {
            given: parsed.given_name().unwrap_or("").to_string(),
            surname: parsed.surname().to_string(),
        }
    } else {
        // Fallback for mononyms and other unparseable names
        let first = display_name.split_whitespace().next().unwrap_or("");
        let last = display_name.split_whitespace().last().unwrap_or("");
        ParsedName {
            given: first.to_string(),
            surname: if last == first {
                String::new()
            } else {
                last.to_string()
            },
        }
    }
}

/// Generate a group name from member(s).
///
/// # Naming Rules
/// - 1 member: `firstname_lastname` (e.g., `alice_smith`, `stijn_de-jong`)
/// - 2-5 members: all surnames with dashes (e.g., `smith-jones-lee`)
/// - 6+ members: 5 surnames + remainder (e.g., `smith-jones-lee-patel-chen-+2`)
///
/// All names are slugified (lowercase, ASCII, no special chars).
pub fn generate_group_name(members: &[&RosterMember]) -> String {
    match members.len() {
        0 => String::from("empty-group"),
        1 => {
            let member = members[0];
            let parsed = parse_name(&member.name);
            let first = slugify(&parsed.given);
            let last = slugify(&parsed.surname);
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
                    let surname = slugify(&parse_name(&m.name).surname);
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
                    let surname = slugify(&parse_name(&m.name).surname);
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
    fn test_single_member_dutch_prefix() {
        let stijn = make_member("Stijn de Jong");
        let name = generate_group_name(&[&stijn]);
        assert_eq!(name, "stijn_de-jong");
    }

    #[test]
    fn test_single_member_sortable_format() {
        // Canvas sortable_name format: "Last, First Prefix"
        let stijn = make_member("Jong, Stijn de");
        let name = generate_group_name(&[&stijn]);
        assert_eq!(name, "stijn_de-jong");
    }

    #[test]
    fn test_single_member_van_der() {
        let anna = make_member("Anna van der Berg");
        let name = generate_group_name(&[&anna]);
        assert_eq!(name, "anna_van-der-berg");
    }

    #[test]
    fn test_single_member_von() {
        let karl = make_member("Karl von Müller");
        let name = generate_group_name(&[&karl]);
        assert_eq!(name, "karl_von-muller");
    }

    #[test]
    fn test_single_member_mononym() {
        let mono = make_member("Madonna");
        let name = generate_group_name(&[&mono]);
        assert_eq!(name, "madonna");
    }

    #[test]
    fn test_two_members() {
        let alice = make_member("Alice Smith");
        let bob = make_member("Bob Jones");
        let name = generate_group_name(&[&alice, &bob]);
        assert_eq!(name, "smith-jones");
    }

    #[test]
    fn test_two_members_with_prefix() {
        let stijn = make_member("Stijn de Jong");
        let anna = make_member("Anna van der Berg");
        let name = generate_group_name(&[&stijn, &anna]);
        assert_eq!(name, "de-jong-van-der-berg");
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

    #[test]
    fn test_sortable_to_display() {
        assert_eq!(sortable_to_display("Jong, Stijn de"), "Stijn de Jong");
        assert_eq!(
            sortable_to_display("Berg, Anna van der"),
            "Anna van der Berg"
        );
        assert_eq!(sortable_to_display("Smith, Alice"), "Alice Smith");
        assert_eq!(sortable_to_display("Müller, Karl von"), "Karl von Müller");

        // No comma — unchanged
        assert_eq!(sortable_to_display("Alice Smith"), "Alice Smith");

        // Trailing comma
        assert_eq!(sortable_to_display("Smith,"), "Smith");
    }
}
