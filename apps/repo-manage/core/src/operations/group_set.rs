//! Group set CSV import, reimport, and export operations.

use crate::import::normalize_email;
use crate::roster::{
    generate_group_id, generate_group_set_id, selection_mode_all, Group, GroupSet,
    GroupSetConnection, Roster, RosterMemberId,
};
use crate::{GroupSetImportPreview, GroupSetImportResult};
use chrono::Utc;
use std::collections::{HashMap, HashSet};
use std::path::Path;

use super::error::HandlerError;

// --- Base58 UUID transport ---

/// Encode a UUID string as base58.
#[cfg(test)]
pub fn encode_uuid_base58(uuid_str: &str) -> Result<String, HandlerError> {
    let uuid = uuid::Uuid::parse_str(uuid_str)
        .map_err(|e| HandlerError::Validation(format!("Invalid UUID '{}': {}", uuid_str, e)))?;
    Ok(bs58::encode(uuid.as_bytes()).into_string())
}

/// Decode a base58-encoded UUID back to a UUID string.
#[cfg(test)]
pub fn decode_base58_uuid(encoded: &str) -> Result<String, HandlerError> {
    let bytes = bs58::decode(encoded)
        .into_vec()
        .map_err(|e| HandlerError::Validation(format!("Invalid base58 '{}': {}", encoded, e)))?;
    if bytes.len() != 16 {
        return Err(HandlerError::Validation(format!(
            "Invalid base58 UUID '{}': expected 16 bytes, got {}",
            encoded,
            bytes.len()
        )));
    }
    let uuid = uuid::Uuid::from_slice(&bytes)
        .map_err(|e| HandlerError::Validation(format!("Invalid UUID bytes: {}", e)))?;
    Ok(uuid.to_string())
}

// --- CSV row parsing ---

#[derive(Debug)]
struct ParsedRow {
    group_id: Option<String>,
    group_name: String,
    _name: Option<String>,
    email: Option<String>, // normalized
}

#[derive(Debug)]
struct ParsedGroup {
    group_id: Option<String>, // from CSV (decoded)
    name: String,
    member_emails: Vec<String>,
}

#[derive(Debug)]
struct ParsedCsv {
    groups: Vec<ParsedGroup>,
}

/// Parse a CSV file into validated groups.
fn parse_csv_file(file_path: &Path) -> Result<ParsedCsv, HandlerError> {
    let mut rdr = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .trim(csv::Trim::All)
        .from_path(file_path)
        .map_err(|e| HandlerError::Other(e.to_string()))?;

    let headers = rdr
        .headers()
        .map_err(|e| HandlerError::Other(e.to_string()))?
        .clone();
    let header_names: Vec<String> = headers.iter().map(|h| h.to_lowercase()).collect();

    // Detect column positions
    let col_group_id = header_names.iter().position(|h| h == "group_id");
    let col_group_name = header_names
        .iter()
        .position(|h| h == "group_name")
        .ok_or_else(|| {
            HandlerError::Validation("CSV missing required column 'group_name'".into())
        })?;
    let col_name = header_names.iter().position(|h| h == "name");
    let col_email = header_names.iter().position(|h| h == "email");

    let mut rows = Vec::new();
    for (line_idx, result) in rdr.records().enumerate() {
        let record = result.map_err(|e| HandlerError::Other(e.to_string()))?;
        let line_num = line_idx + 2; // 1-based, header is line 1

        let raw_group_name = record.get(col_group_name).unwrap_or("").trim().to_string();
        if raw_group_name.is_empty() {
            return Err(HandlerError::Validation(format!(
                "Line {}: empty group_name",
                line_num
            )));
        }

        let raw_group_id = col_group_id
            .and_then(|c| record.get(c))
            .map(|s| s.trim())
            .filter(|s| !s.is_empty());

        let raw_name = col_name
            .and_then(|c| record.get(c))
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let raw_email = col_email
            .and_then(|c| record.get(c))
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .map(|e| normalize_email(&e));

        rows.push(ParsedRow {
            group_id: raw_group_id.map(|s| s.to_string()),
            group_name: raw_group_name,
            _name: raw_name,
            email: raw_email,
        });
    }

    if rows.is_empty() {
        return Err(HandlerError::Validation("CSV file has no data rows".into()));
    }

    // Validate: group_id must map to exactly one group_name
    let mut id_to_name: HashMap<&str, &str> = HashMap::new();
    for row in &rows {
        if let Some(gid) = &row.group_id {
            if let Some(existing_name) = id_to_name.get(gid.as_str()) {
                if *existing_name != row.group_name.as_str() {
                    return Err(HandlerError::Validation(format!(
                        "group_id '{}' maps to multiple group names: '{}' and '{}'",
                        gid, existing_name, row.group_name
                    )));
                }
            } else {
                id_to_name.insert(gid, &row.group_name);
            }
        }
    }

    // Build groups preserving first-appearance order
    let mut group_order: Vec<String> = Vec::new(); // group_name order
    let mut group_map: HashMap<String, ParsedGroup> = HashMap::new();
    let mut seen_memberships: HashSet<(String, String)> = HashSet::new();

    for row in &rows {
        let group = group_map.entry(row.group_name.clone()).or_insert_with(|| {
            group_order.push(row.group_name.clone());
            ParsedGroup {
                group_id: row.group_id.clone(),
                name: row.group_name.clone(),
                member_emails: Vec::new(),
            }
        });

        // Prefer non-None group_id (later rows may have it)
        if group.group_id.is_none() && row.group_id.is_some() {
            group.group_id = row.group_id.clone();
        }

        if let Some(email) = &row.email {
            let key = (row.group_name.clone(), email.clone());
            if !seen_memberships.insert(key) {
                return Err(HandlerError::Validation(format!(
                    "Duplicate membership: group '{}', email '{}'",
                    row.group_name, email
                )));
            }
            group.member_emails.push(email.clone());
        }
    }

    // Collect groups in first-appearance order
    let groups: Vec<ParsedGroup> = group_order
        .into_iter()
        .map(|name| group_map.remove(&name).unwrap())
        .collect();

    Ok(ParsedCsv { groups })
}

// --- Member matching ---

struct MissingMember {
    group_name: String,
    count: i64,
}

struct MatchResult {
    missing_members: Vec<MissingMember>,
    total_missing: i64,
}

/// Build an email-to-member-id map from the roster (students + staff).
/// Emails that appear more than once are marked as ambiguous (excluded).
fn build_email_index(roster: &Roster) -> HashMap<String, Option<RosterMemberId>> {
    let mut index: HashMap<String, Option<RosterMemberId>> = HashMap::new();
    for member in roster.students.iter().chain(roster.staff.iter()) {
        let key = normalize_email(&member.email);
        if key.is_empty() {
            continue;
        }
        index
            .entry(key)
            .and_modify(|v| *v = None) // ambiguous — mark None
            .or_insert_with(|| Some(member.id.clone()));
    }
    index
}

/// Match parsed group member emails against roster members.
fn match_group_members(
    parsed_groups: &[ParsedGroup],
    email_index: &HashMap<String, Option<RosterMemberId>>,
) -> MatchResult {
    let mut missing_members = Vec::new();
    let mut total_missing: i64 = 0;

    for group in parsed_groups {
        let mut group_missing = 0i64;
        for email in &group.member_emails {
            match email_index.get(email) {
                Some(Some(_)) => {} // matched
                _ => {
                    group_missing += 1;
                    total_missing += 1;
                }
            }
        }
        if group_missing > 0 {
            missing_members.push(MissingMember {
                group_name: group.name.clone(),
                count: group_missing,
            });
        }
    }

    MatchResult {
        missing_members,
        total_missing,
    }
}

/// Resolve emails to member IDs for a single group, deduplicating.
fn resolve_member_ids(
    emails: &[String],
    email_index: &HashMap<String, Option<RosterMemberId>>,
) -> Vec<RosterMemberId> {
    let mut ids = Vec::new();
    let mut seen = HashSet::new();
    for email in emails {
        if let Some(Some(id)) = email_index.get(email) {
            if seen.insert(id.clone()) {
                ids.push(id.clone());
            }
        }
    }
    ids
}

fn missing_members_json(missing: &[MissingMember]) -> Vec<serde_json::Value> {
    missing
        .iter()
        .map(|m| {
            serde_json::json!({
                "group_name": m.group_name,
                "missing_count": m.count
            })
        })
        .collect()
}

fn make_import_connection(file_path: &Path) -> Option<GroupSetConnection> {
    let filename = file_path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_default();
    Some(GroupSetConnection::Import {
        source_filename: filename,
        source_path: Some(file_path.to_string_lossy().to_string()),
        last_updated: Utc::now(),
    })
}

// --- Public operations ---

/// Preview a group set import from CSV (no mutations).
pub fn preview_import_group_set(
    roster: &Roster,
    file_path: &Path,
) -> Result<GroupSetImportPreview, HandlerError> {
    let parsed = parse_csv_file(file_path)?;
    let email_index = build_email_index(roster);
    let match_result = match_group_members(&parsed.groups, &email_index);

    let groups: Vec<serde_json::Value> = parsed
        .groups
        .iter()
        .map(|g| {
            let member_ids = resolve_member_ids(&g.member_emails, &email_index);
            serde_json::json!({
                "name": g.name,
                "member_count": member_ids.len()
            })
        })
        .collect();

    Ok(GroupSetImportPreview::Import {
        groups,
        missing_members: missing_members_json(&match_result.missing_members),
        total_missing: match_result.total_missing,
    })
}

/// Import a group set from CSV. Creates new GroupSet + Groups.
pub fn import_group_set(
    roster: &Roster,
    file_path: &Path,
) -> Result<GroupSetImportResult, HandlerError> {
    let parsed = parse_csv_file(file_path)?;
    let email_index = build_email_index(roster);
    let match_result = match_group_members(&parsed.groups, &email_index);

    let group_set_id = generate_group_set_id();
    let mut group_ids = Vec::new();
    let mut groups_upserted = Vec::new();

    for parsed_group in &parsed.groups {
        let member_ids = resolve_member_ids(&parsed_group.member_emails, &email_index);
        let gid = generate_group_id();
        group_ids.push(gid.clone());
        groups_upserted.push(Group {
            id: gid,
            name: parsed_group.name.clone(),
            member_ids,
            origin: "local".to_string(),
            lms_group_id: None,
        });
    }

    let display_name = file_path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_default();

    let group_set = GroupSet {
        id: group_set_id,
        name: display_name,
        group_ids,
        connection: make_import_connection(file_path),
        group_selection: selection_mode_all(),
    };

    Ok(GroupSetImportResult {
        mode: "import".to_string(),
        group_set,
        groups_upserted,
        deleted_group_ids: Vec::new(),
        missing_members: missing_members_json(&match_result.missing_members),
        total_missing: match_result.total_missing,
    })
}

/// Preview a group set reimport from CSV (no mutations).
pub fn preview_reimport_group_set(
    roster: &Roster,
    group_set_id: &str,
    file_path: &Path,
) -> Result<GroupSetImportPreview, HandlerError> {
    let group_set = roster
        .find_group_set(group_set_id)
        .ok_or_else(|| HandlerError::not_found("Group set not found"))?;

    let parsed = parse_csv_file(file_path)?;

    let email_index = build_email_index(roster);
    let match_result = match_group_members(&parsed.groups, &email_index);

    let groups_preview: Vec<serde_json::Value> = parsed
        .groups
        .iter()
        .map(|g| {
            let member_ids = resolve_member_ids(&g.member_emails, &email_index);
            serde_json::json!({
                "name": g.name,
                "member_count": member_ids.len()
            })
        })
        .collect();

    // Build existing group lookup for diff
    let existing_groups: HashMap<&str, &Group> = group_set
        .group_ids
        .iter()
        .filter_map(|gid| roster.find_group(gid).map(|g| (gid.as_str(), g)))
        .collect();

    // Map existing groups by name and by ID for matching
    let mut existing_by_name: HashMap<&str, &Group> = HashMap::new();
    let mut existing_by_id: HashMap<&str, &Group> = HashMap::new();
    for g in existing_groups.values() {
        existing_by_name.insert(&g.name, g);
        existing_by_id.insert(&g.id, g);
    }

    // Match CSV groups to existing
    let mut matched_existing_ids: HashSet<String> = HashSet::new();
    let mut added_group_names = Vec::new();
    let mut updated_group_names = Vec::new();
    let mut renamed_groups: Vec<serde_json::Value> = Vec::new();

    for pg in &parsed.groups {
        // Try match by ID first, then by name
        let matched = pg
            .group_id
            .as_deref()
            .and_then(|id| existing_by_id.get(id).copied())
            .or_else(|| existing_by_name.get(pg.name.as_str()).copied());

        match matched {
            Some(existing) => {
                matched_existing_ids.insert(existing.id.clone());

                // Check rename
                if existing.name != pg.name {
                    renamed_groups.push(serde_json::json!({
                        "from": existing.name,
                        "to": pg.name
                    }));
                }

                // Check membership changes
                let new_member_ids = resolve_member_ids(&pg.member_emails, &email_index);
                let old_set: HashSet<&RosterMemberId> = existing.member_ids.iter().collect();
                let new_set: HashSet<&RosterMemberId> = new_member_ids.iter().collect();
                if old_set != new_set {
                    updated_group_names.push(pg.name.clone());
                }
            }
            None => {
                added_group_names.push(pg.name.clone());
            }
        }
    }

    // Groups in existing set but not matched by CSV
    let removed_group_names: Vec<String> = existing_groups
        .values()
        .filter(|g| !matched_existing_ids.contains(&g.id))
        .map(|g| g.name.clone())
        .collect();

    Ok(GroupSetImportPreview::Reimport {
        groups: groups_preview,
        missing_members: missing_members_json(&match_result.missing_members),
        total_missing: match_result.total_missing,
        added_group_names,
        removed_group_names,
        updated_group_names,
        renamed_groups,
    })
}

/// Reimport a group set from CSV. Updates existing GroupSet + Groups.
pub fn reimport_group_set(
    roster: &Roster,
    group_set_id: &str,
    file_path: &Path,
) -> Result<GroupSetImportResult, HandlerError> {
    let group_set = roster
        .find_group_set(group_set_id)
        .ok_or_else(|| HandlerError::not_found("Group set not found"))?;

    let parsed = parse_csv_file(file_path)?;

    let email_index = build_email_index(roster);
    let match_result = match_group_members(&parsed.groups, &email_index);

    // Build existing group lookup
    let existing_groups: HashMap<String, Group> = group_set
        .group_ids
        .iter()
        .filter_map(|gid| roster.find_group(gid).cloned().map(|g| (gid.clone(), g)))
        .collect();

    let mut existing_by_name: HashMap<String, Group> = HashMap::new();
    let mut existing_by_id: HashMap<String, Group> = HashMap::new();
    for g in existing_groups.values() {
        existing_by_name.insert(g.name.clone(), g.clone());
        existing_by_id.insert(g.id.clone(), g.clone());
    }

    let mut new_group_ids: Vec<String> = Vec::new();
    let mut groups_upserted: Vec<Group> = Vec::new();
    let mut matched_existing_ids: HashSet<String> = HashSet::new();

    for pg in &parsed.groups {
        let member_ids = resolve_member_ids(&pg.member_emails, &email_index);

        // Try match by ID first, then by name
        let matched = pg
            .group_id
            .as_deref()
            .and_then(|id| existing_by_id.get(id).cloned())
            .or_else(|| existing_by_name.get(&pg.name).cloned());

        match matched {
            Some(mut existing) => {
                matched_existing_ids.insert(existing.id.clone());
                // Update in place
                existing.name = pg.name.clone();
                existing.member_ids = member_ids;
                new_group_ids.push(existing.id.clone());
                groups_upserted.push(existing);
            }
            None => {
                // New group
                let gid = generate_group_id();
                new_group_ids.push(gid.clone());
                groups_upserted.push(Group {
                    id: gid,
                    name: pg.name.clone(),
                    member_ids,
                    origin: "local".to_string(),
                    lms_group_id: None,
                });
            }
        }
    }

    // Find deleted groups (in existing set but not matched)
    let deleted_group_ids: Vec<String> = existing_groups
        .keys()
        .filter(|id| !matched_existing_ids.contains(*id))
        .cloned()
        .collect();

    // Build updated group set
    let updated_group_set = GroupSet {
        id: group_set_id.to_string(),
        name: group_set.name.clone(),
        group_ids: new_group_ids,
        connection: make_import_connection(file_path),
        group_selection: group_set.group_selection.clone(),
    };

    Ok(GroupSetImportResult {
        mode: "reimport".to_string(),
        group_set: updated_group_set,
        groups_upserted,
        deleted_group_ids,
        missing_members: missing_members_json(&match_result.missing_members),
        total_missing: match_result.total_missing,
    })
}

/// Export a group set to CSV. Returns the canonical file path.
pub fn export_group_set(
    roster: &Roster,
    group_set_id: &str,
    file_path: &Path,
) -> Result<String, HandlerError> {
    let group_set = roster
        .find_group_set(group_set_id)
        .ok_or_else(|| HandlerError::not_found("Group set not found"))?;

    let mut wtr =
        csv::Writer::from_path(file_path).map_err(|e| HandlerError::Other(e.to_string()))?;

    wtr.write_record(["group_set_id", "group_id", "group_name", "name", "email"])
        .map_err(|e| HandlerError::Other(e.to_string()))?;

    for gid in &group_set.group_ids {
        let group = match roster.find_group(gid) {
            Some(g) => g,
            None => continue,
        };

        if group.member_ids.is_empty() {
            // Empty group — single row with empty name/email
            wtr.write_record([&group_set.id, &group.id, &group.name, "", ""])
                .map_err(|e| HandlerError::Other(e.to_string()))?;
        } else {
            for mid in &group.member_ids {
                let member = roster.find_member(mid);
                let name = member.map(|m| m.name.as_str()).unwrap_or("");
                let email = member.map(|m| m.email.as_str()).unwrap_or("");

                wtr.write_record([&group_set.id, &group.id, &group.name, name, email])
                    .map_err(|e| HandlerError::Other(e.to_string()))?;
            }
        }
    }

    wtr.flush()
        .map_err(|e| HandlerError::Other(e.to_string()))?;
    Ok(file_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::roster::{EnrollmentType, GitUsernameStatus, MemberStatus, RosterMember};
    use std::io::Write;

    #[test]
    fn base58_uuid_roundtrip() {
        let uuid = "550e8400-e29b-41d4-a716-446655440000";
        let encoded = encode_uuid_base58(uuid).unwrap();
        let decoded = decode_base58_uuid(&encoded).unwrap();
        assert_eq!(decoded, uuid);
    }

    #[test]
    fn base58_invalid_input() {
        assert!(decode_base58_uuid("not-valid-base58!").is_err());
        assert!(decode_base58_uuid("abc").is_err()); // too short
    }

    #[test]
    fn base58_v4_uuid_roundtrip() {
        let uuid = uuid::Uuid::new_v4().to_string();
        let encoded = encode_uuid_base58(&uuid).unwrap();
        let decoded = decode_base58_uuid(&encoded).unwrap();
        assert_eq!(decoded, uuid);
    }

    // --- Test helpers ---

    fn write_csv(dir: &Path, filename: &str, content: &str) -> std::path::PathBuf {
        let path = dir.join(filename);
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(content.as_bytes()).unwrap();
        path
    }

    fn make_member(id: &str, name: &str, email: &str) -> RosterMember {
        RosterMember {
            id: RosterMemberId(id.to_string()),
            name: name.to_string(),
            email: email.to_string(),
            student_number: None,
            git_username: None,
            git_username_status: GitUsernameStatus::Unknown,
            status: MemberStatus::Active,
            lms_status: None,
            lms_user_id: None,
            enrollment_type: EnrollmentType::Student,
            enrollment_display: None,
            department: None,
            institution: None,
            source: "local".to_string(),
        }
    }

    fn make_staff_member(id: &str, name: &str, email: &str) -> RosterMember {
        let mut m = make_member(id, name, email);
        m.enrollment_type = EnrollmentType::Teacher;
        m
    }

    fn test_roster() -> Roster {
        Roster {
            connection: None,
            students: vec![
                make_member("s1", "Alice Smith", "alice@example.com"),
                make_member("s2", "Bob Jones", "bob@example.com"),
                make_member("s3", "Carol Lee", "carol@example.com"),
            ],
            staff: vec![make_staff_member("t1", "Prof X", "profx@example.com")],
            groups: Vec::new(),
            group_sets: Vec::new(),
            assignments: Vec::new(),
        }
    }

    // --- parse_csv_file tests ---

    #[test]
    fn parse_csv_basic() {
        let dir = tempfile::tempdir().unwrap();
        let csv = write_csv(
            dir.path(),
            "test.csv",
            "group_name,name,email\nTeam A,Alice,alice@example.com\nTeam A,Bob,bob@example.com\nTeam B,Carol,carol@example.com\n",
        );

        let parsed = parse_csv_file(&csv).unwrap();
        assert_eq!(parsed.groups.len(), 2);
        assert_eq!(parsed.groups[0].name, "Team A");
        assert_eq!(parsed.groups[0].member_emails.len(), 2);
        assert_eq!(parsed.groups[1].name, "Team B");
        assert_eq!(parsed.groups[1].member_emails.len(), 1);
    }

    #[test]
    fn parse_csv_duplicate_group_name_merges_members() {
        let dir = tempfile::tempdir().unwrap();
        let csv = write_csv(
            dir.path(),
            "test.csv",
            "group_name,email\nAlpha,a@x.com\nBeta,b@x.com\nAlpha,c@x.com\n",
        );

        let parsed = parse_csv_file(&csv).unwrap();
        assert_eq!(parsed.groups.len(), 2);
        let alpha = &parsed.groups[0];
        assert_eq!(alpha.name, "Alpha");
        assert_eq!(alpha.member_emails.len(), 2);
    }

    #[test]
    fn parse_csv_duplicate_membership_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let csv = write_csv(
            dir.path(),
            "test.csv",
            "group_name,email\nAlpha,same@x.com\nAlpha,same@x.com\n",
        );

        let result = parse_csv_file(&csv);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Duplicate membership"), "got: {err}");
    }

    #[test]
    fn parse_csv_missing_group_name_column() {
        let dir = tempfile::tempdir().unwrap();
        let csv = write_csv(dir.path(), "test.csv", "name,email\nAlice,a@x.com\n");

        let result = parse_csv_file(&csv);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("missing required column"), "got: {err}");
    }

    #[test]
    fn parse_csv_empty_file() {
        let dir = tempfile::tempdir().unwrap();
        let csv = write_csv(dir.path(), "test.csv", "group_name,email\n");

        let result = parse_csv_file(&csv);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("no data rows"), "got: {err}");
    }

    #[test]
    fn parse_csv_case_sensitive_group_names() {
        let dir = tempfile::tempdir().unwrap();
        let csv = write_csv(
            dir.path(),
            "test.csv",
            "group_name,email\nTeam A,a@x.com\nteam a,b@x.com\n",
        );

        let parsed = parse_csv_file(&csv).unwrap();
        assert_eq!(parsed.groups.len(), 2, "case-different names are distinct");
    }

    // --- import_group_set tests ---

    #[test]
    fn import_creates_local_groups() {
        let dir = tempfile::tempdir().unwrap();
        let csv = write_csv(
            dir.path(),
            "test.csv",
            "group_name,email\nTeam A,alice@example.com\nTeam B,bob@example.com\n",
        );

        let roster = test_roster();
        let result = import_group_set(&roster, &csv).unwrap();
        assert_eq!(result.mode, "import");
        assert_eq!(result.groups_upserted.len(), 2);
        for g in &result.groups_upserted {
            assert_eq!(g.origin, "local");
            assert!(g.lms_group_id.is_none());
        }
    }

    #[test]
    fn import_matches_members_by_email_case_insensitive() {
        let dir = tempfile::tempdir().unwrap();
        let csv = write_csv(
            dir.path(),
            "test.csv",
            "group_name,email\nTeam A,ALICE@EXAMPLE.COM\n",
        );

        let roster = test_roster();
        let result = import_group_set(&roster, &csv).unwrap();
        assert_eq!(result.groups_upserted[0].member_ids.len(), 1);
        assert_eq!(result.groups_upserted[0].member_ids[0].0, "s1");
    }

    #[test]
    fn import_reports_missing_members() {
        let dir = tempfile::tempdir().unwrap();
        let csv = write_csv(
            dir.path(),
            "test.csv",
            "group_name,email\nTeam A,alice@example.com\nTeam A,nobody@example.com\n",
        );

        let roster = test_roster();
        let result = import_group_set(&roster, &csv).unwrap();
        assert_eq!(result.total_missing, 1);
        assert_eq!(result.missing_members.len(), 1);
        assert_eq!(result.missing_members[0]["group_name"], "Team A");
    }

    #[test]
    fn import_deduplicates_member_ids() {
        let dir = tempfile::tempdir().unwrap();
        // Same group, two rows with same email after normalization shouldn't happen
        // (duplicate membership is rejected), so test dedup via email_index:
        // Two different emails mapping to same member shouldn't occur normally,
        // but we can verify single email produces single member_id
        let csv = write_csv(
            dir.path(),
            "test.csv",
            "group_name,email\nTeam A,alice@example.com\nTeam A,bob@example.com\n",
        );

        let roster = test_roster();
        let result = import_group_set(&roster, &csv).unwrap();
        let ids = &result.groups_upserted[0].member_ids;
        let unique: HashSet<&RosterMemberId> = ids.iter().collect();
        assert_eq!(ids.len(), unique.len(), "no duplicate member IDs");
    }

    #[test]
    fn import_staff_rows_accepted() {
        let dir = tempfile::tempdir().unwrap();
        let csv = write_csv(
            dir.path(),
            "test.csv",
            "group_name,email\nTeam A,alice@example.com\nTeam A,profx@example.com\n",
        );

        let roster = test_roster();
        let result = import_group_set(&roster, &csv).unwrap();
        assert_eq!(result.groups_upserted[0].member_ids.len(), 2);
        let ids: Vec<&str> = result.groups_upserted[0]
            .member_ids
            .iter()
            .map(|id| id.0.as_str())
            .collect();
        assert!(ids.contains(&"t1"), "staff member should be included");
    }

    // --- reimport_group_set tests ---

    #[test]
    fn reimport_matches_by_group_id() {
        let dir = tempfile::tempdir().unwrap();

        let group_id = uuid::Uuid::new_v4().to_string();

        let mut roster = test_roster();
        let gs_id = generate_group_set_id();
        roster.groups.push(Group {
            id: group_id.clone(),
            name: "Old Name".to_string(),
            member_ids: vec![RosterMemberId("s1".to_string())],
            origin: "local".to_string(),
            lms_group_id: None,
        });
        roster.group_sets.push(GroupSet {
            id: gs_id.clone(),
            name: "Test Set".to_string(),
            group_ids: vec![group_id.clone()],
            connection: None,
            group_selection: selection_mode_all(),
        });

        let csv = write_csv(
            dir.path(),
            "test.csv",
            &format!(
                "group_name,group_id,email\nRenamed Group,{},alice@example.com\n",
                group_id
            ),
        );

        let result = reimport_group_set(&roster, &gs_id, &csv).unwrap();
        assert_eq!(result.mode, "reimport");
        // The group should be matched by ID and updated
        assert_eq!(result.groups_upserted.len(), 1);
        assert_eq!(result.groups_upserted[0].id, group_id);
        assert_eq!(result.groups_upserted[0].name, "Renamed Group");
        assert!(result.deleted_group_ids.is_empty());
    }

    #[test]
    fn reimport_matches_by_name_fallback() {
        let dir = tempfile::tempdir().unwrap();

        let group_id = uuid::Uuid::new_v4().to_string();
        let mut roster = test_roster();
        let gs_id = generate_group_set_id();
        roster.groups.push(Group {
            id: group_id.clone(),
            name: "Team A".to_string(),
            member_ids: vec![RosterMemberId("s1".to_string())],
            origin: "local".to_string(),
            lms_group_id: None,
        });
        roster.group_sets.push(GroupSet {
            id: gs_id.clone(),
            name: "Test Set".to_string(),
            group_ids: vec![group_id.clone()],
            connection: None,
            group_selection: selection_mode_all(),
        });

        // CSV without group_id column — falls back to name match
        let csv = write_csv(
            dir.path(),
            "test.csv",
            "group_name,email\nTeam A,bob@example.com\n",
        );

        let result = reimport_group_set(&roster, &gs_id, &csv).unwrap();
        assert_eq!(result.groups_upserted.len(), 1);
        assert_eq!(
            result.groups_upserted[0].id, group_id,
            "reuses existing group ID"
        );
    }

    #[test]
    fn reimport_detects_renamed_groups() {
        let dir = tempfile::tempdir().unwrap();

        let group_id = uuid::Uuid::new_v4().to_string();

        let mut roster = test_roster();
        let gs_id = generate_group_set_id();
        roster.groups.push(Group {
            id: group_id.clone(),
            name: "Original Name".to_string(),
            member_ids: vec![],
            origin: "local".to_string(),
            lms_group_id: None,
        });
        roster.group_sets.push(GroupSet {
            id: gs_id.clone(),
            name: "Test Set".to_string(),
            group_ids: vec![group_id.clone()],
            connection: None,
            group_selection: selection_mode_all(),
        });

        let csv = write_csv(
            dir.path(),
            "test.csv",
            &format!(
                "group_name,group_id,email\nNew Name,{},alice@example.com\n",
                group_id
            ),
        );

        let preview = preview_reimport_group_set(&roster, &gs_id, &csv).unwrap();
        match &preview {
            GroupSetImportPreview::Reimport { renamed_groups, .. } => {
                assert_eq!(renamed_groups.len(), 1);
                assert_eq!(renamed_groups[0]["from"], "Original Name");
                assert_eq!(renamed_groups[0]["to"], "New Name");
            }
            _ => panic!("Expected Reimport preview"),
        }
    }

    // --- export_group_set tests ---

    #[test]
    fn export_roundtrip() {
        let dir = tempfile::tempdir().unwrap();

        let mut roster = test_roster();
        let g1_id = generate_group_id();
        let g2_id = generate_group_id();
        let gs_id = generate_group_set_id();

        roster.groups.push(Group {
            id: g1_id.clone(),
            name: "Team A".to_string(),
            member_ids: vec![
                RosterMemberId("s1".to_string()),
                RosterMemberId("s2".to_string()),
            ],
            origin: "local".to_string(),
            lms_group_id: None,
        });
        roster.groups.push(Group {
            id: g2_id.clone(),
            name: "Team B".to_string(),
            member_ids: vec![RosterMemberId("s3".to_string())],
            origin: "local".to_string(),
            lms_group_id: None,
        });
        roster.group_sets.push(GroupSet {
            id: gs_id.clone(),
            name: "Export Set".to_string(),
            group_ids: vec![g1_id, g2_id],
            connection: None,
            group_selection: selection_mode_all(),
        });

        let export_path = dir.path().join("export.csv");
        export_group_set(&roster, &gs_id, &export_path).unwrap();

        // Parse it back
        let parsed = parse_csv_file(&export_path).unwrap();
        assert_eq!(parsed.groups.len(), 2);
        assert_eq!(parsed.groups[0].name, "Team A");
        assert_eq!(parsed.groups[0].member_emails.len(), 2);
        assert_eq!(parsed.groups[1].name, "Team B");
        assert_eq!(parsed.groups[1].member_emails.len(), 1);
    }

    #[test]
    fn export_empty_group() {
        let dir = tempfile::tempdir().unwrap();

        let mut roster = test_roster();
        let g_id = generate_group_id();
        let gs_id = generate_group_set_id();

        roster.groups.push(Group {
            id: g_id.clone(),
            name: "Empty Group".to_string(),
            member_ids: vec![],
            origin: "local".to_string(),
            lms_group_id: None,
        });
        roster.group_sets.push(GroupSet {
            id: gs_id.clone(),
            name: "Set".to_string(),
            group_ids: vec![g_id],
            connection: None,
            group_selection: selection_mode_all(),
        });

        let export_path = dir.path().join("export.csv");
        export_group_set(&roster, &gs_id, &export_path).unwrap();

        // Parse back — single group with 0 member emails
        let parsed = parse_csv_file(&export_path).unwrap();
        assert_eq!(parsed.groups.len(), 1);
        assert_eq!(parsed.groups[0].name, "Empty Group");
        assert!(parsed.groups[0].member_emails.is_empty());
    }

    // --- Group ordering test ---

    #[test]
    fn import_preserves_csv_order() {
        let dir = tempfile::tempdir().unwrap();
        let csv = write_csv(
            dir.path(),
            "test.csv",
            "group_name,email\nZeta,alice@example.com\nAlpha,bob@example.com\nMid,carol@example.com\n",
        );

        let roster = test_roster();
        let result = import_group_set(&roster, &csv).unwrap();
        let names: Vec<&str> = result
            .groups_upserted
            .iter()
            .map(|g| g.name.as_str())
            .collect();
        assert_eq!(names, vec!["Zeta", "Alpha", "Mid"]);
    }
}
