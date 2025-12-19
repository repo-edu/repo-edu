# lms-client

Unified Rust client for Learning Management Systems with runtime LMS selection.

## Installation

```toml
[dependencies]
lms-client = "0.1"
tokio = { version = "1.0", features = ["full"] }
```

## Usage

```rust
use lms_client::{LmsClient, LmsAuth, LmsType};
use lms_common::LmsClient as _;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Choose LMS type at runtime
    let client = LmsClient::new(
        LmsType::Canvas,  // or LmsType::Moodle
        LmsAuth::Token {
            url: "https://canvas.example.edu".to_string(),
            token: "your_token".to_string(),
        }
    )?;

    // Same API regardless of LMS type
    let courses = client.get_courses().await?;
    for course in courses {
        println!("{}", course.name);
    }

    Ok(())
}
```

## Features

- Runtime LMS selection (Canvas or Moodle)
- Unified interface across platforms
- Re-exports platform-specific clients for direct access

## License

MIT OR Apache-2.0
