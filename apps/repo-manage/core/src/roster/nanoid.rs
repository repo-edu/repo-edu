//! ID generation utilities.
//!
//! Uses UUID v4 for new stable identifiers (RosterMemberId, Group.id, GroupSet.id)
//! and nanoid for legacy compatibility (AssignmentId).

use super::types::AssignmentId;
use crate::generated::types::RosterMemberId;

const ID_LENGTH: usize = 21;
const ID_ALPHABET: [char; 64] = [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I',
    'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'a', 'b',
    'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u',
    'v', 'w', 'x', 'y', 'z', '_', '-',
];

fn generate_nanoid() -> String {
    nanoid::nanoid!(ID_LENGTH, &ID_ALPHABET)
}

/// Generate a new UUID v4 string.
pub fn generate_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Generate a new roster member ID (UUID).
pub fn generate_roster_member_id() -> RosterMemberId {
    RosterMemberId(generate_uuid())
}

/// Generate a new group ID (UUID string).
pub fn generate_group_id() -> String {
    generate_uuid()
}

/// Generate a new group set ID (UUID string).
pub fn generate_group_set_id() -> String {
    generate_uuid()
}

/// Generate a new assignment ID (nanoid for backward compatibility).
pub fn generate_assignment_id() -> AssignmentId {
    AssignmentId(generate_nanoid())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uuid_ids_are_valid_uuid_format() {
        let member_id = generate_roster_member_id();
        assert!(uuid::Uuid::parse_str(&member_id.0).is_ok());

        let group_id = generate_group_id();
        assert!(uuid::Uuid::parse_str(&group_id).is_ok());

        let group_set_id = generate_group_set_id();
        assert!(uuid::Uuid::parse_str(&group_set_id).is_ok());
    }

    #[test]
    fn assignment_ids_have_expected_length_and_charset() {
        let id = generate_assignment_id().0;
        assert_eq!(id.len(), 21);
        assert!(id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'));
    }
}
