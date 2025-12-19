# canvas-lms

Async Rust client for the Canvas LMS API.

## Installation

```toml
[dependencies]
canvas-lms = "0.1"
tokio = { version = "1.0", features = ["full"] }
```

## Usage

```rust
use canvas_lms::CanvasClient;
use lms_common::LmsClient;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = CanvasClient::new(
        "https://canvas.instructure.com",
        "your_access_token"
    )?;

    let courses = client.get_courses().await?;
    for course in courses {
        println!("{}", course.name);
    }

    Ok(())
}
```

## API Coverage

- Courses (list, get)
- Groups (list for course)
- Users (list for course, get current user)
- Assignments (list for course)
- Automatic pagination
- Token validation

## Token Generation

1. Log in to Canvas → Account → Settings
2. Scroll to "Approved Integrations" → "+ New Access Token"
3. Generate and copy the token

## License

MIT OR Apache-2.0
