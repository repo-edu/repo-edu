pub use crate::generated::types::{
    CloneParams, CommandResult, ConfigParams, GenerateFilesParams, GetGroupCategoriesParams,
    GroupCategory, SetupParams, VerifyCourseParams, VerifyCourseResult,
};

impl From<repo_manage_core::GroupCategory> for GroupCategory {
    fn from(gc: repo_manage_core::GroupCategory) -> Self {
        GroupCategory {
            id: gc.id,
            name: gc.name,
            role: gc.role,
            self_signup: gc.self_signup,
            course_id: gc.course_id,
            group_limit: gc.group_limit,
        }
    }
}
