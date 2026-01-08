use crate::roster::{
    validate_assignment as validate_assignment_core, validate_roster as validate_roster_core,
    AssignmentId, Roster,
};
use crate::{GitIdentityMode, ValidationResult};

use super::error::HandlerError;

pub fn validate_roster(roster: &Roster) -> Result<ValidationResult, HandlerError> {
    Ok(validate_roster_core(roster))
}

pub fn validate_assignment(
    roster: &Roster,
    assignment_id: &AssignmentId,
    identity_mode: GitIdentityMode,
) -> Result<ValidationResult, HandlerError> {
    Ok(validate_assignment_core(
        roster,
        assignment_id,
        identity_mode,
    ))
}
