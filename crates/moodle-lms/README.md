# moodle-lms

Async Rust client for the Moodle LMS Web Services API.

> **Note:** This crate has not been tested against a live Moodle instance. If you use Moodle, we'd appreciate your feedback! Please report any issues or successes at the repository.

## Installation

```toml
[dependencies]
moodle-lms = "0.1"
tokio = { version = "1.0", features = ["full"] }
```

## Usage

```rust
use moodle_lms::MoodleClient;
use lms_common::LmsClient;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = MoodleClient::new(
        "https://moodle.example.edu",
        "your_webservice_token"
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
- Users (list enrolled users)
- Assignments (list for course)
- Token validation

## Token Generation

1. Site Administration → Server → Web services → Manage tokens
2. Create a token for your user with appropriate permissions

## License

MIT OR Apache-2.0
