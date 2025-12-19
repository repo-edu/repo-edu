//! Example demonstrating the unified LMS client with runtime selection
//!
//! This example shows how to use the same code to interact with different
//! LMS platforms (Canvas, Moodle) by selecting the type at runtime.
//!
//! Run with environment variables:
//! ```bash
//! # Canvas example
//! LMS_TYPE=canvas LMS_URL=https://canvas.tue.nl LMS_TOKEN=your_token \
//!     cargo run --example unified_client
//!
//! # Moodle example
//! LMS_TYPE=moodle LMS_URL=https://moodle.edu LMS_TOKEN=your_token \
//!     cargo run --example unified_client
//!
//! ```

use lms_client::{LmsAuth, LmsClient, LmsType};
use lms_common::LmsClient as _;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Read configuration from environment
    let lms_type_str = env::var("LMS_TYPE").unwrap_or_else(|_| "canvas".to_string());
    let url = env::var("LMS_URL").expect("LMS_URL must be set");

    println!("=== Unified LMS Client Example ===\n");
    println!("LMS Type: {}", lms_type_str);
    println!("URL: {}\n", url);

    // Parse LMS type
    let lms_type = match lms_type_str.to_lowercase().as_str() {
        "canvas" => LmsType::Canvas,
        "moodle" => LmsType::Moodle,
        _ => {
            eprintln!("Unknown LMS type: {}", lms_type_str);
            eprintln!("Valid types: canvas, moodle");
            std::process::exit(1);
        }
    };

    let token = env::var("LMS_TOKEN").expect("LMS_TOKEN must be set for Canvas/Moodle");
    let auth = LmsAuth::Token { url, token };

    // Create unified client - same code regardless of LMS type!
    println!("Creating {} client...", lms_type.as_str());
    let client = LmsClient::new(lms_type, auth)?;
    println!("✓ Client created successfully\n");

    // Get courses - same method works for all LMS types
    println!("Fetching courses...");
    match client.get_courses().await {
        Ok(courses) => {
            println!("✓ Found {} courses\n", courses.len());

            for (i, course) in courses.iter().take(5).enumerate() {
                println!("{}. {} (ID: {})", i + 1, course.name, course.id);

                if let Some(code) = &course.course_code {
                    println!("   Code: {}", code);
                }

                // Get groups for this course
                match client.get_groups(&course.id).await {
                    Ok(groups) => {
                        println!("   Groups: {}", groups.len());
                        for group in groups.iter().take(3) {
                            println!("     - {}", group.name);
                        }
                    }
                    Err(e) => {
                        println!("   Groups: Error - {}", e);
                    }
                }

                // Get assignments for this course
                match client.get_assignments(&course.id).await {
                    Ok(assignments) => {
                        println!("   Assignments: {}", assignments.len());
                        for assignment in assignments.iter().take(3) {
                            println!("     - {}", assignment.name);
                        }
                    }
                    Err(e) => {
                        println!("   Assignments: Error - {}", e);
                    }
                }

                println!();
            }

            if courses.len() > 5 {
                println!("... and {} more courses", courses.len() - 5);
            }
        }
        Err(e) => {
            eprintln!("✗ Error fetching courses: {}", e);
            std::process::exit(1);
        }
    }

    println!("\n=== Success! ===");
    println!(
        "The same code worked with {} - no LMS-specific logic needed!",
        lms_type.as_str()
    );

    Ok(())
}
