use repo_manage_core::{OperationResult, ProgressEvent};

pub fn print_success(msg: &str) {
    println!("OK: {}", msg);
}

pub fn print_warning(msg: &str) {
    println!("WARN: {}", msg);
}

pub fn print_error(msg: &str) {
    eprintln!("ERROR: {}", msg);
}

pub fn print_progress(event: ProgressEvent) {
    match event {
        ProgressEvent::Status(message) => {
            println!("{}", message);
        }
        ProgressEvent::Inline(message) => {
            println!("{}", message);
        }
        ProgressEvent::Started { operation } => {
            println!("Starting {}...", operation);
        }
        ProgressEvent::Progress {
            current,
            total,
            message,
        } => {
            println!("[{}/{}] {}", current, total, message);
        }
        ProgressEvent::Completed { operation, details } => {
            if let Some(details) = details {
                println!("{} complete: {}", operation, details);
            } else {
                println!("{} complete.", operation);
            }
        }
        ProgressEvent::Failed { operation, error } => {
            eprintln!("{} failed: {}", operation, error);
        }
    }
}

pub fn print_operation_result(result: &OperationResult) {
    println!();
    println!("Summary:");
    println!("  Succeeded: {}", result.succeeded);
    println!("  Failed: {}", result.failed);

    if !result.skipped_groups.is_empty() {
        println!("  Skipped: {}", result.skipped_groups.len());
        for skip in &result.skipped_groups {
            println!("    - {}: {:?}", skip.group_name, skip.reason);
        }
    }

    if !result.errors.is_empty() {
        println!();
        println!("Errors:");
        for error in &result.errors {
            println!("  - {}: {}", error.repo_name, error.message);
        }
    }
}

pub fn exit_code_for_operation_result(result: &OperationResult) -> i32 {
    if result.failed > 0 || !result.skipped_groups.is_empty() {
        2
    } else {
        0
    }
}
