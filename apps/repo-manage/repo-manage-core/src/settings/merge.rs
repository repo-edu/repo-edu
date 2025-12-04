use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;

/// Result of merging settings with defaults
#[derive(Debug, Clone)]
pub struct MergeResult<T> {
    pub value: T,
    pub warnings: Vec<String>,
}

/// Merge JSON from disk with defaults before deserializing, so missing fields get defaults
/// without requiring #[serde(default)] on every field.
pub fn merge_with_defaults<T>(raw: &Value) -> Result<T, serde_json::Error>
where
    T: Default + Serialize + DeserializeOwned,
{
    let result = merge_with_defaults_warned(raw)?;
    Ok(result.value)
}

/// Merge JSON from disk with defaults, returning warnings for unknown fields.
/// Unknown fields are stripped from the result.
pub fn merge_with_defaults_warned<T>(raw: &Value) -> Result<MergeResult<T>, serde_json::Error>
where
    T: Default + Serialize + DeserializeOwned,
{
    // Defaults from Rust type
    let mut merged = serde_json::to_value(T::default())?;
    let mut warnings = Vec::new();
    merge_values_warned(&mut merged, raw, String::new(), &mut warnings);
    let value = serde_json::from_value(merged)?;
    Ok(MergeResult { value, warnings })
}

fn merge_values_warned(target: &mut Value, src: &Value, path: String, warnings: &mut Vec<String>) {
    match (target, src) {
        (Value::Object(t), Value::Object(s)) => {
            for (k, v) in s {
                let field_path = if path.is_empty() {
                    k.clone()
                } else {
                    format!("{}.{}", path, k)
                };
                match t.get_mut(k) {
                    Some(tv) => merge_values_warned(tv, v, field_path, warnings),
                    None => {
                        // Unknown field - warn and skip (don't insert)
                        warnings.push(format!("Unknown field '{}' (removed)", field_path));
                    }
                }
            }
        }
        (Value::Array(t_arr), Value::Array(s_arr)) => {
            *t_arr = s_arr.clone();
        }
        (t, s) => {
            // Null means "use default" - don't replace
            if s.is_null() {
                return;
            }
            // Check type compatibility
            if !types_compatible(t, s) {
                warnings.push(format!(
                    "Invalid value for '{}': expected {}, got {} (using default)",
                    path,
                    type_name(t),
                    type_name(s)
                ));
                // Keep default value (don't assign)
            } else {
                *t = s.clone();
            }
        }
    }
}

/// Check if two JSON values have compatible types
fn types_compatible(expected: &Value, actual: &Value) -> bool {
    match (expected, actual) {
        (Value::Null, Value::Null) => true,
        (Value::Bool(_), Value::Bool(_)) => true,
        (Value::Number(_), Value::Number(_)) => true,
        (Value::String(_), Value::String(_)) => true,
        (Value::Array(_), Value::Array(_)) => true,
        (Value::Object(_), Value::Object(_)) => true,
        _ => false,
    }
}

/// Get a human-readable type name for a JSON value
fn type_name(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};
    use serde_json::json;

    #[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
    struct TestSettings {
        name: String,
        count: u32,
        enabled: bool,
        nested: NestedSettings,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    struct NestedSettings {
        value: String,
        flag: bool,
    }

    impl Default for NestedSettings {
        fn default() -> Self {
            Self {
                value: "default_value".to_string(),
                flag: false,
            }
        }
    }

    #[test]
    fn test_merge_valid_settings() {
        let raw = json!({
            "name": "test",
            "count": 42,
            "enabled": true,
            "nested": {
                "value": "custom",
                "flag": true
            }
        });

        let result: MergeResult<TestSettings> = merge_with_defaults_warned(&raw).unwrap();

        assert_eq!(result.value.name, "test");
        assert_eq!(result.value.count, 42);
        assert!(result.value.enabled);
        assert_eq!(result.value.nested.value, "custom");
        assert!(result.value.nested.flag);
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn test_merge_missing_fields_use_defaults() {
        let raw = json!({
            "name": "partial"
        });

        let result: MergeResult<TestSettings> = merge_with_defaults_warned(&raw).unwrap();

        assert_eq!(result.value.name, "partial");
        assert_eq!(result.value.count, 0); // default
        assert!(!result.value.enabled); // default
        assert_eq!(result.value.nested.value, "default_value"); // default
        assert!(result.warnings.is_empty()); // missing fields don't warn
    }

    #[test]
    fn test_merge_unknown_field_warns_and_strips() {
        let raw = json!({
            "name": "test",
            "unknown_field": "should warn"
        });

        let result: MergeResult<TestSettings> = merge_with_defaults_warned(&raw).unwrap();

        assert_eq!(result.value.name, "test");
        assert_eq!(result.warnings.len(), 1);
        assert!(result.warnings[0].contains("Unknown field 'unknown_field'"));
        assert!(result.warnings[0].contains("removed"));
    }

    #[test]
    fn test_merge_nested_unknown_field_warns() {
        let raw = json!({
            "nested": {
                "value": "test",
                "typo_field": "oops"
            }
        });

        let result: MergeResult<TestSettings> = merge_with_defaults_warned(&raw).unwrap();

        assert_eq!(result.value.nested.value, "test");
        assert_eq!(result.warnings.len(), 1);
        assert!(result.warnings[0].contains("Unknown field 'nested.typo_field'"));
    }

    #[test]
    fn test_merge_wrong_type_warns_and_uses_default() {
        let raw = json!({
            "name": "test",
            "count": "not a number",  // should be u32
            "enabled": "yes"          // should be bool
        });

        let result: MergeResult<TestSettings> = merge_with_defaults_warned(&raw).unwrap();

        assert_eq!(result.value.name, "test");
        assert_eq!(result.value.count, 0); // default because type mismatch
        assert!(!result.value.enabled); // default because type mismatch
        assert_eq!(result.warnings.len(), 2);
        assert!(result.warnings.iter().any(|w| w.contains("count")));
        assert!(result.warnings.iter().any(|w| w.contains("enabled")));
    }

    #[test]
    fn test_merge_null_value_uses_default() {
        let raw = json!({
            "name": null,
            "count": null
        });

        let result: MergeResult<TestSettings> = merge_with_defaults_warned(&raw).unwrap();

        // null values are treated as "use default" - no warnings, default values used
        assert!(result.warnings.is_empty());
        assert_eq!(result.value.name, ""); // default empty string
        assert_eq!(result.value.count, 0); // default 0
    }

    #[test]
    fn test_merge_multiple_issues() {
        let raw = json!({
            "name": "test",
            "count": "wrong",
            "unknown1": true,
            "nested": {
                "unknown2": 123
            }
        });

        let result: MergeResult<TestSettings> = merge_with_defaults_warned(&raw).unwrap();

        assert_eq!(result.warnings.len(), 3);
        assert!(result.warnings.iter().any(|w| w.contains("count")));
        assert!(result.warnings.iter().any(|w| w.contains("unknown1")));
        assert!(result
            .warnings
            .iter()
            .any(|w| w.contains("nested.unknown2")));
    }
}
