use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;

/// Merge JSON from disk with defaults before deserializing, so missing fields get defaults
/// without requiring #[serde(default)] on every field.
pub fn merge_with_defaults<T>(raw: &Value) -> Result<T, serde_json::Error>
where
    T: Default + Serialize + DeserializeOwned,
{
    // Defaults from Rust type
    let mut merged = serde_json::to_value(T::default())?;
    merge_values(&mut merged, raw);
    serde_json::from_value(merged)
}

fn merge_values(target: &mut Value, src: &Value) {
    match (target, src) {
        (Value::Object(t), Value::Object(s)) => {
            for (k, v) in s {
                match t.get_mut(k) {
                    Some(tv) => merge_values(tv, v),
                    None => {
                        t.insert(k.clone(), v.clone());
                    }
                }
            }
        }
        (Value::Array(t_arr), Value::Array(s_arr)) => {
            *t_arr = s_arr.clone();
        }
        (t, s) => {
            *t = s.clone();
        }
    }
}
