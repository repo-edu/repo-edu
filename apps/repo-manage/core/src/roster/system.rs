//! System group set management.
//!
//! Backend owns creation and maintenance of system group sets:
//! - "Individual Students" - one group per active student
//! - "Staff" - single group containing all staff members
//!
//! System sets are auto-maintained and cannot be edited, deleted, or have connection broken.

use std::collections::{HashMap, HashSet};

use crate::generated::types::{
    Group, GroupSet, GroupSetConnection, MemberStatus, Roster, RosterMember, RosterMemberId,
    SystemGroupSetEnsureResult,
};

use super::naming::generate_unique_group_name;
use super::nanoid::{generate_group_id, generate_group_set_id};

/// System group set type identifiers.
pub const SYSTEM_TYPE_INDIVIDUAL_STUDENTS: &str = "individual_students";
pub const SYSTEM_TYPE_STAFF: &str = "staff";

/// Fixed name for the Staff group.
pub const STAFF_GROUP_NAME: &str = "Staff";

/// Group origin values.
pub const ORIGIN_SYSTEM: &str = "system";
pub const ORIGIN_LMS: &str = "lms";
pub const ORIGIN_LOCAL: &str = "local";

/// Ensure system group sets exist and are properly synchronized with the roster.
///
/// This is the single public entrypoint for system set management. It:
/// 1. Creates/repairs system group sets (Individual Students + Staff)
/// 2. Syncs system groups with roster membership
/// 3. Cleans up stale member IDs from all groups
///
/// Safe to call on every profile load and after roster sync/import.
pub fn ensure_system_group_sets(roster: &mut Roster) -> SystemGroupSetEnsureResult {
    let mut result = SystemGroupSetEnsureResult {
        group_sets: Vec::new(),
        groups_upserted: Vec::new(),
        deleted_group_ids: Vec::new(),
    };

    // Phase 1: Ensure system sets exist and sync system groups
    let phase1_result = ensure_system_sets_internal(roster);
    result.group_sets = phase1_result.group_sets;
    result.groups_upserted.extend(phase1_result.groups_upserted);
    result
        .deleted_group_ids
        .extend(phase1_result.deleted_group_ids);

    // Phase 2: Clean up stale memberships in all groups
    let phase2_modified = cleanup_stale_memberships(roster);
    result.groups_upserted.extend(phase2_modified);

    result
}

/// Internal Phase 1: Create and repair system group sets.
fn ensure_system_sets_internal(roster: &mut Roster) -> SystemGroupSetEnsureResult {
    let mut result = SystemGroupSetEnsureResult {
        group_sets: Vec::new(),
        groups_upserted: Vec::new(),
        deleted_group_ids: Vec::new(),
    };

    // Ensure Individual Students system set
    let (indiv_set, indiv_groups, indiv_deleted) = ensure_individual_students_set(roster);
    result.group_sets.push(indiv_set);
    result.groups_upserted.extend(indiv_groups);
    result.deleted_group_ids.extend(indiv_deleted);

    // Ensure Staff system set
    let (staff_set, staff_groups, staff_deleted) = ensure_staff_set(roster);
    result.group_sets.push(staff_set);
    result.groups_upserted.extend(staff_groups);
    result.deleted_group_ids.extend(staff_deleted);

    result
}

/// Ensure the Individual Students system group set exists and is synced.
fn ensure_individual_students_set(roster: &mut Roster) -> (GroupSet, Vec<Group>, Vec<String>) {
    let mut groups_upserted = Vec::new();
    let mut deleted_group_ids = Vec::new();

    // Find or create the system set, tracking its index
    let set_idx = match roster
        .group_sets
        .iter()
        .position(|gs| is_system_set(gs, SYSTEM_TYPE_INDIVIDUAL_STUDENTS))
    {
        Some(idx) => idx,
        None => {
            let new_set = GroupSet {
                id: generate_group_set_id(),
                name: "Individual Students".to_string(),
                group_ids: Vec::new(),
                connection: Some(make_system_connection(SYSTEM_TYPE_INDIVIDUAL_STUDENTS)),
            };
            roster.group_sets.push(new_set);
            roster.group_sets.len() - 1
        }
    };

    // Get active students
    let active_students: Vec<&RosterMember> = roster
        .students
        .iter()
        .filter(|s| s.status == MemberStatus::Active)
        .collect();

    // Build map of existing system groups by single member_id
    let set_group_ids: HashSet<String> = roster.group_sets[set_idx]
        .group_ids
        .iter()
        .cloned()
        .collect();
    let mut existing_by_member: HashMap<String, usize> = HashMap::new();
    for (idx, group) in roster.groups.iter().enumerate() {
        if group.origin == ORIGIN_SYSTEM
            && group.member_ids.len() == 1
            && set_group_ids.contains(&group.id)
        {
            existing_by_member.insert(group.member_ids[0].0.clone(), idx);
        }
    }

    // Track which groups are still needed
    let mut needed_group_ids: HashSet<String> = HashSet::new();
    let mut existing_names: HashSet<String> = roster
        .groups
        .iter()
        .filter(|g| set_group_ids.contains(&g.id))
        .map(|g| g.name.clone())
        .collect();

    // Process each active student
    for student in active_students {
        if let Some(&group_idx) = existing_by_member.get(&student.id.0) {
            // Group exists - update name if needed.
            // Remove current name from collision set so a group doesn't collide with itself.
            let group = &mut roster.groups[group_idx];
            existing_names.remove(&group.name);
            let expected_name = generate_unique_group_name(&[student], &existing_names);
            if group.name != expected_name {
                group.name = expected_name.clone();
                groups_upserted.push(group.clone());
            }
            existing_names.insert(expected_name);
            needed_group_ids.insert(group.id.clone());
        } else {
            // Create new group for this student
            let name = generate_unique_group_name(&[student], &existing_names);
            existing_names.insert(name.clone());
            let new_group = Group {
                id: generate_group_id(),
                name,
                member_ids: vec![student.id.clone()],
                origin: ORIGIN_SYSTEM.to_string(),
                lms_group_id: None,
            };
            needed_group_ids.insert(new_group.id.clone());
            groups_upserted.push(new_group.clone());
            roster.groups.push(new_group);
        }
    }

    // Remove groups for students that are no longer active
    let old_group_ids: Vec<String> = roster.group_sets[set_idx].group_ids.clone();
    for group_id in old_group_ids {
        if !needed_group_ids.contains(&group_id) {
            if let Some(idx) = roster.groups.iter().position(|g| g.id == group_id) {
                let removed = roster.groups.remove(idx);
                deleted_group_ids.push(removed.id.clone());
                // Remove from all group sets that reference it
                for gs in &mut roster.group_sets {
                    gs.group_ids.retain(|id| id != &removed.id);
                }
            }
        }
    }

    // Update the set's group_ids
    roster.group_sets[set_idx].group_ids = needed_group_ids.into_iter().collect();

    (
        roster.group_sets[set_idx].clone(),
        groups_upserted,
        deleted_group_ids,
    )
}

/// Ensure the Staff system group set exists and is synced.
fn ensure_staff_set(roster: &mut Roster) -> (GroupSet, Vec<Group>, Vec<String>) {
    let mut groups_upserted = Vec::new();
    let deleted_group_ids = Vec::new();

    // Find or create the system set, tracking its index
    let set_idx = match roster
        .group_sets
        .iter()
        .position(|gs| is_system_set(gs, SYSTEM_TYPE_STAFF))
    {
        Some(idx) => idx,
        None => {
            let new_set = GroupSet {
                id: generate_group_set_id(),
                name: "Staff".to_string(),
                group_ids: Vec::new(),
                connection: Some(make_system_connection(SYSTEM_TYPE_STAFF)),
            };
            roster.group_sets.push(new_set);
            roster.group_sets.len() - 1
        }
    };

    // Get active staff members
    let active_staff: Vec<RosterMemberId> = roster
        .staff
        .iter()
        .filter(|s| s.status == MemberStatus::Active)
        .map(|s| s.id.clone())
        .collect();

    // Snapshot the set's group_ids for lookup
    let set_group_ids: HashSet<String> = roster.group_sets[set_idx]
        .group_ids
        .iter()
        .cloned()
        .collect();

    // Find or create the Staff group
    let existing_staff_group = roster.groups.iter_mut().find(|g| {
        g.origin == ORIGIN_SYSTEM && g.name == STAFF_GROUP_NAME && set_group_ids.contains(&g.id)
    });

    if let Some(group) = existing_staff_group {
        // Update membership
        if group.member_ids != active_staff {
            group.member_ids = active_staff;
            groups_upserted.push(group.clone());
        }
    } else {
        // Create new Staff group
        let new_group = Group {
            id: generate_group_id(),
            name: STAFF_GROUP_NAME.to_string(),
            member_ids: active_staff,
            origin: ORIGIN_SYSTEM.to_string(),
            lms_group_id: None,
        };
        roster.group_sets[set_idx]
            .group_ids
            .push(new_group.id.clone());
        groups_upserted.push(new_group.clone());
        roster.groups.push(new_group);
    }

    (
        roster.group_sets[set_idx].clone(),
        groups_upserted,
        deleted_group_ids,
    )
}

/// Internal Phase 2: Remove stale member IDs from all groups.
///
/// Removes member IDs from all groups when:
/// - The member no longer exists in the roster (deleted)
/// - The member has status != "active" (dropped or incomplete)
fn cleanup_stale_memberships(roster: &mut Roster) -> Vec<Group> {
    let mut modified = Vec::new();

    // Build set of valid (active) member IDs
    let valid_member_ids: HashSet<String> = roster
        .students
        .iter()
        .chain(roster.staff.iter())
        .filter(|m| m.status == MemberStatus::Active)
        .map(|m| m.id.0.clone())
        .collect();

    // Clean up each non-system group
    for group in &mut roster.groups {
        // Skip system groups - they're already handled by Phase 1
        if group.origin == ORIGIN_SYSTEM {
            continue;
        }

        let original_len = group.member_ids.len();
        group
            .member_ids
            .retain(|id| valid_member_ids.contains(&id.0));

        if group.member_ids.len() != original_len {
            modified.push(group.clone());
        }
    }

    modified
}

/// Check if a group set is a system set with the specified type.
fn is_system_set(group_set: &GroupSet, system_type: &str) -> bool {
    if let Some(conn) = &group_set.connection {
        // Parse the connection value to check kind and system_type
        if let Some(obj) = conn.value.as_object() {
            if obj.get("kind").and_then(|v| v.as_str()) == Some("system") {
                return obj.get("system_type").and_then(|v| v.as_str()) == Some(system_type);
            }
        }
    }
    false
}

/// Create a system connection value.
fn make_system_connection(system_type: &str) -> GroupSetConnection {
    GroupSetConnection {
        value: serde_json::json!({
            "kind": "system",
            "system_type": system_type
        }),
    }
}

/// Find the system group set by type.
pub fn find_system_set<'a>(roster: &'a Roster, system_type: &str) -> Option<&'a GroupSet> {
    roster
        .group_sets
        .iter()
        .find(|gs| is_system_set(gs, system_type))
}

/// Check if system group sets are missing.
pub fn system_sets_missing(roster: &Roster) -> bool {
    find_system_set(roster, SYSTEM_TYPE_INDIVIDUAL_STUDENTS).is_none()
        || find_system_set(roster, SYSTEM_TYPE_STAFF).is_none()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generated::types::{EnrollmentType, GitUsernameStatus};

    fn make_student(name: &str) -> RosterMember {
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

    fn make_staff(name: &str) -> RosterMember {
        let mut member = make_student(name);
        member.enrollment_type = EnrollmentType::Teacher;
        member
    }

    fn empty_roster() -> Roster {
        Roster {
            connection: None,
            students: Vec::new(),
            staff: Vec::new(),
            groups: Vec::new(),
            group_sets: Vec::new(),
            assignments: Vec::new(),
        }
    }

    #[test]
    fn test_creates_system_sets_on_empty_roster() {
        let mut roster = empty_roster();
        let result = ensure_system_group_sets(&mut roster);

        assert_eq!(result.group_sets.len(), 2);
        assert!(find_system_set(&roster, SYSTEM_TYPE_INDIVIDUAL_STUDENTS).is_some());
        assert!(find_system_set(&roster, SYSTEM_TYPE_STAFF).is_some());
    }

    #[test]
    fn test_creates_individual_student_groups() {
        let mut roster = empty_roster();
        roster.students.push(make_student("Alice Smith"));
        roster.students.push(make_student("Bob Jones"));

        let result = ensure_system_group_sets(&mut roster);

        // Should have 2 individual student groups + 1 staff group
        assert!(result.groups_upserted.len() >= 2);

        let indiv_set = find_system_set(&roster, SYSTEM_TYPE_INDIVIDUAL_STUDENTS).unwrap();
        assert_eq!(indiv_set.group_ids.len(), 2);
    }

    #[test]
    fn test_creates_staff_group() {
        let mut roster = empty_roster();
        roster.staff.push(make_staff("Prof Smith"));
        roster.staff.push(make_staff("TA Jones"));

        ensure_system_group_sets(&mut roster);

        let staff_set = find_system_set(&roster, SYSTEM_TYPE_STAFF).unwrap();
        assert_eq!(staff_set.group_ids.len(), 1);

        // Find the staff group
        let staff_group = roster
            .groups
            .iter()
            .find(|g| g.name == STAFF_GROUP_NAME)
            .unwrap();
        assert_eq!(staff_group.member_ids.len(), 2);
    }

    #[test]
    fn test_removes_dropped_students() {
        let mut roster = empty_roster();
        let mut alice = make_student("Alice Smith");
        alice.status = MemberStatus::Dropped;
        roster.students.push(alice.clone());
        roster.students.push(make_student("Bob Jones"));

        // First call to create sets
        ensure_system_group_sets(&mut roster);

        let indiv_set = find_system_set(&roster, SYSTEM_TYPE_INDIVIDUAL_STUDENTS).unwrap();
        // Only Bob should have a group (Alice is dropped)
        assert_eq!(indiv_set.group_ids.len(), 1);
    }

    #[test]
    fn test_cleanup_stale_memberships() {
        let mut roster = empty_roster();
        let alice = make_student("Alice Smith");
        let mut bob = make_student("Bob Jones");
        bob.status = MemberStatus::Dropped;

        roster.students.push(alice.clone());
        roster.students.push(bob.clone());

        // Create a local group with both members
        roster.groups.push(Group {
            id: generate_group_id(),
            name: "test-group".to_string(),
            member_ids: vec![alice.id.clone(), bob.id.clone()],
            origin: ORIGIN_LOCAL.to_string(),
            lms_group_id: None,
        });
        roster.group_sets.push(GroupSet {
            id: generate_group_set_id(),
            name: "Test Set".to_string(),
            group_ids: vec![roster.groups[0].id.clone()],
            connection: None,
        });

        ensure_system_group_sets(&mut roster);

        // The local group should now only have Alice
        let test_group = roster
            .groups
            .iter()
            .find(|g| g.name == "test-group")
            .unwrap();
        assert_eq!(test_group.member_ids.len(), 1);
        assert_eq!(test_group.member_ids[0].0, alice.id.0);
    }

    #[test]
    fn test_idempotent() {
        let mut roster = empty_roster();
        roster.students.push(make_student("Alice Smith"));

        let result1 = ensure_system_group_sets(&mut roster);
        let result2 = ensure_system_group_sets(&mut roster);

        // Second call should not create new groups
        assert!(result2.groups_upserted.is_empty());
        assert!(result2.deleted_group_ids.is_empty());

        // Sets should be same
        assert_eq!(result1.group_sets.len(), result2.group_sets.len());
    }

    #[test]
    fn test_removes_dropped_member_from_all_group_origins() {
        let mut roster = empty_roster();
        let alice = make_student("Alice Smith");
        let mut bob = make_student("Bob Jones");
        let staff = make_staff("Prof Smith");

        // First ensure creates system sets with all active members
        roster.students.push(alice.clone());
        roster.students.push(bob.clone());
        roster.staff.push(staff.clone());

        // Create LMS-origin and local-origin groups containing bob
        roster.groups.push(Group {
            id: generate_group_id(),
            name: "lms-group".to_string(),
            member_ids: vec![alice.id.clone(), bob.id.clone()],
            origin: ORIGIN_LMS.to_string(),
            lms_group_id: Some("lms-123".to_string()),
        });
        roster.groups.push(Group {
            id: generate_group_id(),
            name: "local-group".to_string(),
            member_ids: vec![bob.id.clone(), staff.id.clone()],
            origin: ORIGIN_LOCAL.to_string(),
            lms_group_id: None,
        });
        let lms_gid = roster.groups[0].id.clone();
        let local_gid = roster.groups[1].id.clone();
        roster.group_sets.push(GroupSet {
            id: generate_group_set_id(),
            name: "User Set".to_string(),
            group_ids: vec![lms_gid.clone(), local_gid.clone()],
            connection: None,
        });

        ensure_system_group_sets(&mut roster);

        // Now drop Bob
        roster.students.iter_mut().for_each(|s| {
            if s.id == bob.id {
                s.status = MemberStatus::Dropped;
            }
        });
        bob.status = MemberStatus::Dropped;

        ensure_system_group_sets(&mut roster);

        // Bob should be removed from LMS-origin group
        let lms_group = roster.groups.iter().find(|g| g.id == lms_gid).unwrap();
        assert!(
            !lms_group.member_ids.contains(&bob.id),
            "dropped member removed from LMS group"
        );
        assert!(
            lms_group.member_ids.contains(&alice.id),
            "active member retained in LMS group"
        );

        // Bob should be removed from local-origin group
        let local_group = roster.groups.iter().find(|g| g.id == local_gid).unwrap();
        assert!(
            !local_group.member_ids.contains(&bob.id),
            "dropped member removed from local group"
        );
        assert!(
            local_group.member_ids.contains(&staff.id),
            "active staff retained in local group"
        );
    }
}
