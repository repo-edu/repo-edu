//! Group resolution utilities.
//!
//! Resolves groups from assignments and group sets using selection modes.

use std::collections::HashSet;

use crate::generated::types::{
    Assignment, Group, GroupSelectionMode, GroupSelectionPreview, GroupSet, PatternFilterResult,
    Roster,
};

use super::glob::{validate_glob_pattern, SimpleGlob};

/// Resolve groups for an assignment.
///
/// Returns the groups that match the assignment's group selection criteria,
/// looked up from the roster's groups array.
pub fn resolve_assignment_groups<'a>(
    roster: &'a Roster,
    assignment: &Assignment,
) -> Vec<&'a Group> {
    // Find the group set
    let group_set = match roster
        .group_sets
        .iter()
        .find(|gs| gs.id == assignment.group_set_id)
    {
        Some(gs) => gs,
        None => return Vec::new(),
    };

    resolve_groups_from_selection(roster, group_set, &assignment.group_selection)
}

/// Resolve groups from a group set using the given selection mode.
pub fn resolve_groups_from_selection<'a>(
    roster: &'a Roster,
    group_set: &GroupSet,
    selection: &GroupSelectionMode,
) -> Vec<&'a Group> {
    // Get all groups in the set
    let groups: Vec<&Group> = group_set
        .group_ids
        .iter()
        .filter_map(|id| roster.groups.iter().find(|g| &g.id == id))
        .collect();

    // Parse selection mode
    let (kind, pattern, excluded_ids) = parse_selection_mode(selection);

    // Filter by pattern if needed
    let matched: Vec<&Group> = if kind == "pattern" {
        if let Some(pat) = pattern {
            match SimpleGlob::new(&pat) {
                Ok(glob) => groups
                    .into_iter()
                    .filter(|g| glob.is_match(&g.name))
                    .collect(),
                Err(_) => Vec::new(), // Invalid pattern matches nothing
            }
        } else {
            groups
        }
    } else {
        groups
    };

    // Apply exclusions
    let excluded_set: HashSet<&str> = excluded_ids.iter().map(|s| s.as_str()).collect();
    matched
        .into_iter()
        .filter(|g| !excluded_set.contains(g.id.as_str()))
        .collect()
}

/// Preview group selection result.
///
/// Validates the selection and returns the resolved groups along with counts.
pub fn preview_group_selection(
    roster: &Roster,
    group_set_id: &str,
    selection: &GroupSelectionMode,
) -> GroupSelectionPreview {
    // Find the group set
    let group_set = match roster.group_sets.iter().find(|gs| gs.id == group_set_id) {
        Some(gs) => gs,
        None => {
            return GroupSelectionPreview {
                valid: false,
                error: Some("Group set not found".to_string()),
                group_ids: Vec::new(),
                empty_group_ids: Vec::new(),
                group_member_counts: Vec::new(),
                total_groups: 0,
                matched_groups: 0,
            };
        }
    };

    // Get all groups in the set
    let groups: Vec<&Group> = group_set
        .group_ids
        .iter()
        .filter_map(|id| roster.groups.iter().find(|g| &g.id == id))
        .collect();

    let total_groups = groups.len() as i64;

    // Parse selection mode
    let (kind, pattern, excluded_ids) = parse_selection_mode(selection);

    // Validate and apply pattern
    let (valid, error, matched_groups) = if kind == "pattern" {
        if let Some(pat) = &pattern {
            match validate_glob_pattern(pat) {
                Ok(()) => {
                    let glob = SimpleGlob::new(pat).unwrap();
                    let matched: Vec<&Group> = groups
                        .iter()
                        .filter(|g| glob.is_match(&g.name))
                        .copied()
                        .collect();
                    (true, None, matched)
                }
                Err(e) => (false, Some(e), Vec::new()),
            }
        } else {
            (false, Some("Pattern is required".to_string()), Vec::new())
        }
    } else {
        (true, None, groups.clone())
    };

    if !valid {
        return GroupSelectionPreview {
            valid: false,
            error,
            group_ids: Vec::new(),
            empty_group_ids: Vec::new(),
            group_member_counts: Vec::new(),
            total_groups,
            matched_groups: 0,
        };
    }

    let matched_count = matched_groups.len() as i64;

    // Apply exclusions
    let excluded_set: HashSet<&str> = excluded_ids.iter().map(|s| s.as_str()).collect();
    let final_groups: Vec<&Group> = matched_groups
        .into_iter()
        .filter(|g| !excluded_set.contains(g.id.as_str()))
        .collect();

    // Build result
    let group_ids: Vec<String> = final_groups.iter().map(|g| g.id.clone()).collect();
    let empty_group_ids: Vec<String> = final_groups
        .iter()
        .filter(|g| g.member_ids.is_empty())
        .map(|g| g.id.clone())
        .collect();
    let group_member_counts: Vec<serde_json::Value> = final_groups
        .iter()
        .map(|g| {
            serde_json::json!({
                "group_id": g.id,
                "member_count": g.member_ids.len()
            })
        })
        .collect();

    GroupSelectionPreview {
        valid: true,
        error: None,
        group_ids,
        empty_group_ids,
        group_member_counts,
        total_groups,
        matched_groups: matched_count,
    }
}

/// Filter values by a glob pattern.
///
/// Returns the indexes of matched values in input order.
pub fn filter_by_pattern(pattern: &str, values: &[&str]) -> PatternFilterResult {
    match validate_glob_pattern(pattern) {
        Err(e) => PatternFilterResult {
            valid: false,
            error: Some(e),
            matched_indexes: Vec::new(),
            matched_count: 0,
        },
        Ok(()) => {
            let glob = SimpleGlob::new(pattern).unwrap();
            let matched_indexes: Vec<i64> = values
                .iter()
                .enumerate()
                .filter(|(_, v)| glob.is_match(v))
                .map(|(i, _)| i as i64)
                .collect();
            let matched_count = matched_indexes.len() as i64;

            PatternFilterResult {
                valid: true,
                error: None,
                matched_indexes,
                matched_count,
            }
        }
    }
}

/// Parse a GroupSelectionMode into its components.
fn parse_selection_mode(selection: &GroupSelectionMode) -> (String, Option<String>, Vec<String>) {
    // GroupSelectionMode is a oneOf with kind=all or kind=pattern
    if let Some(obj) = selection.value.as_object() {
        let kind = obj
            .get("kind")
            .and_then(|v| v.as_str())
            .unwrap_or("all")
            .to_string();

        let pattern = obj
            .get("pattern")
            .and_then(|v| v.as_str())
            .map(String::from);

        let excluded_ids = obj
            .get("excluded_group_ids")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        (kind, pattern, excluded_ids)
    } else {
        ("all".to_string(), None, Vec::new())
    }
}

/// Create a GroupSelectionMode for "all" groups.
pub fn selection_mode_all() -> GroupSelectionMode {
    GroupSelectionMode {
        value: serde_json::json!({
            "kind": "all",
            "excluded_group_ids": []
        }),
    }
}

/// Create a GroupSelectionMode for pattern matching.
pub fn selection_mode_pattern(pattern: &str) -> GroupSelectionMode {
    GroupSelectionMode {
        value: serde_json::json!({
            "kind": "pattern",
            "pattern": pattern,
            "excluded_group_ids": []
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generated::types::RosterMemberId;
    use crate::roster::nanoid::{generate_group_id, generate_group_set_id};

    fn make_group(name: &str) -> Group {
        Group {
            id: generate_group_id(),
            name: name.to_string(),
            member_ids: vec![RosterMemberId(uuid::Uuid::new_v4().to_string())],
            origin: "local".to_string(),
            lms_group_id: None,
        }
    }

    fn make_roster_with_groups(group_names: &[&str]) -> (Roster, GroupSet) {
        let groups: Vec<Group> = group_names.iter().map(|n| make_group(n)).collect();
        let group_ids: Vec<String> = groups.iter().map(|g| g.id.clone()).collect();

        let group_set = GroupSet {
            id: generate_group_set_id(),
            name: "Test Set".to_string(),
            group_ids,
            connection: None,
        };

        let roster = Roster {
            connection: None,
            students: Vec::new(),
            staff: Vec::new(),
            groups,
            group_sets: vec![group_set.clone()],
            assignments: Vec::new(),
        };

        (roster, group_set)
    }

    #[test]
    fn test_resolve_all_groups() {
        let (roster, group_set) = make_roster_with_groups(&["1D1", "1D2", "2D1"]);
        let selection = selection_mode_all();

        let resolved = resolve_groups_from_selection(&roster, &group_set, &selection);
        assert_eq!(resolved.len(), 3);
    }

    #[test]
    fn test_resolve_pattern_groups() {
        let (roster, group_set) = make_roster_with_groups(&["1D1", "1D2", "2D1", "2D2"]);
        let selection = selection_mode_pattern("1D*");

        let resolved = resolve_groups_from_selection(&roster, &group_set, &selection);
        assert_eq!(resolved.len(), 2);
        assert!(resolved.iter().all(|g| g.name.starts_with("1D")));
    }

    #[test]
    fn test_resolve_with_exclusions() {
        let (roster, group_set) = make_roster_with_groups(&["1D1", "1D2", "1D3"]);
        let excluded_id = roster.groups[0].id.clone();

        let selection = GroupSelectionMode {
            value: serde_json::json!({
                "kind": "all",
                "excluded_group_ids": [excluded_id]
            }),
        };

        let resolved = resolve_groups_from_selection(&roster, &group_set, &selection);
        assert_eq!(resolved.len(), 2);
        assert!(resolved.iter().all(|g| g.id != excluded_id));
    }

    #[test]
    fn test_preview_valid_pattern() {
        let (roster, group_set) = make_roster_with_groups(&["1D1", "1D2", "2D1"]);
        let selection = selection_mode_pattern("1D*");

        let preview = preview_group_selection(&roster, &group_set.id, &selection);
        assert!(preview.valid);
        assert!(preview.error.is_none());
        assert_eq!(preview.group_ids.len(), 2);
        assert_eq!(preview.total_groups, 3);
        assert_eq!(preview.matched_groups, 2);
    }

    #[test]
    fn test_preview_invalid_pattern() {
        let (roster, group_set) = make_roster_with_groups(&["1D1", "1D2"]);
        let selection = selection_mode_pattern("**"); // Invalid

        let preview = preview_group_selection(&roster, &group_set.id, &selection);
        assert!(!preview.valid);
        assert!(preview.error.is_some());
        assert!(preview.group_ids.is_empty());
    }

    #[test]
    fn test_filter_by_pattern() {
        let values = vec!["1D1", "1D2", "2D1", "2D2"];
        let result = filter_by_pattern("1D*", &values);

        assert!(result.valid);
        assert_eq!(result.matched_count, 2);
        assert_eq!(result.matched_indexes, vec![0, 1]);
    }

    #[test]
    fn test_filter_by_invalid_pattern() {
        let values = vec!["a", "b", "c"];
        let result = filter_by_pattern("**", &values);

        assert!(!result.valid);
        assert!(result.error.is_some());
        assert!(result.matched_indexes.is_empty());
    }
}
