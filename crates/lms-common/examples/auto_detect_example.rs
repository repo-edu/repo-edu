//! Example demonstrating LMS auto-detection from institution URLs
//!
//! This example shows how to:
//! 1. Auto-detect LMS type from URL
//! 2. Get token generation URLs automatically
//! 3. Handle detection confidence levels
//! 4. Provide manual override when needed
//!
//! Run with:
//! ```bash
//! cargo run --example auto_detect_example
//! ```

use lms_common::helpers::{detect_lms_type, get_token_info, get_token_info_with_type};
use lms_common::{Confidence, LmsDetection, LmsType};

fn main() {
    println!("=== LMS Auto-Detection Examples ===\n");

    // Example 1: High confidence Canvas detection
    println!("1. Canvas (High Confidence)");
    demonstrate_url("https://canvas.tue.nl");
    println!();

    // Example 2: Canvas via Instructure domain
    println!("2. Canvas via Instructure (High Confidence)");
    demonstrate_url("https://university.instructure.com");
    println!();

    // Example 3: Moodle detection
    println!("3. Moodle (High Confidence)");
    demonstrate_url("https://moodle.university.edu");
    println!();

    // Example 4: Probable detection (medium confidence)
    println!("4. Canvas in Path (Medium Confidence)");
    demonstrate_url("https://lms.university.edu/canvas");
    println!();

    // Example 5: Unknown LMS - manual override needed
    println!("5. Unknown LMS - Manual Override");
    let url = "https://lms.university.edu";
    println!("URL: {}", url);

    match detect_lms_type(url) {
        LmsDetection::Unknown => {
            println!("Detection: Unknown - manual selection required");
            println!("\nManual override to Canvas:");
            let info = get_token_info_with_type(url, LmsType::Canvas);
            display_token_info(&info);
        }
        _ => println!("Unexpectedly detected!"),
    }
    println!();

    // Example 6: URL without protocol
    println!("6. URL without Protocol");
    demonstrate_url("canvas.tue.nl");
}

fn demonstrate_url(url: &str) {
    println!("URL: {}", url);

    // Show detection result
    match detect_lms_type(url) {
        LmsDetection::Detected(lms_type) => {
            println!("Detection: ✓ High confidence - {:?}", lms_type);
        }
        LmsDetection::Probable(lms_type) => {
            println!(
                "Detection: ? Medium confidence - {:?} (recommend user confirmation)",
                lms_type
            );
        }
        LmsDetection::Unknown => {
            println!("Detection: ✗ Unknown (manual selection required)");
            return;
        }
    }

    // Get full token info
    match get_token_info(url) {
        Ok(info) => display_token_info(&info),
        Err(e) => println!("Error: {}", e),
    }
}

fn display_token_info(info: &lms_common::TokenInfo) {
    println!("LMS Type: {}", info.lms_name);
    println!("Confidence: {:?}", info.detection_confidence);
    println!("Token URL: {}", info.token_url);

    // Show UI recommendation based on confidence
    match info.detection_confidence {
        Confidence::High => {
            println!(
                "UI: Show '✓ Detected {}' with direct 'Generate Token' button",
                info.lms_name
            );
        }
        Confidence::Medium => {
            println!(
                "UI: Show '? Detected {}' with dropdown override option",
                info.lms_name
            );
        }
        Confidence::Manual => {
            println!("UI: User manually selected {}", info.lms_name);
        }
    }
}
