use super::types::{AssignmentId, GroupId, StudentId};

const ID_LENGTH: usize = 21;
const ID_ALPHABET: [char; 64] = [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I',
    'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'a', 'b',
    'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u',
    'v', 'w', 'x', 'y', 'z', '_', '-',
];

fn generate_id() -> String {
    nanoid::nanoid!(ID_LENGTH, &ID_ALPHABET)
}

pub fn generate_student_id() -> StudentId {
    StudentId(generate_id())
}

pub fn generate_assignment_id() -> AssignmentId {
    AssignmentId(generate_id())
}

pub fn generate_group_id() -> GroupId {
    GroupId(generate_id())
}

pub fn generate_group_set_id() -> String {
    generate_id()
}

#[cfg(test)]
mod tests {
    use super::{
        generate_assignment_id, generate_group_id, generate_group_set_id, generate_student_id,
    };

    #[test]
    fn ids_have_expected_length_and_charset() {
        let ids = [
            generate_student_id().to_string(),
            generate_assignment_id().to_string(),
            generate_group_id().to_string(),
            generate_group_set_id(),
        ];

        for id in ids {
            assert_eq!(id.len(), 21);
            assert!(id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'));
        }
    }
}
