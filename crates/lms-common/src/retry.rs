//! Retry utilities with exponential backoff for rate-limited requests

use crate::{LmsError, LmsResult};
use std::future::Future;
use std::time::Duration;
use tokio::time::sleep;

/// Configuration for retry behavior
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts
    pub max_retries: u32,
    /// Initial delay before first retry
    pub initial_delay: Duration,
    /// Maximum delay between retries
    pub max_delay: Duration,
    /// Multiplier for exponential backoff
    pub multiplier: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(60),
            multiplier: 2.0,
        }
    }
}

impl RetryConfig {
    /// Calculate delay for a given attempt (0-indexed)
    fn delay_for_attempt(&self, attempt: u32, retry_after: Option<u64>) -> Duration {
        // If server specified retry-after, use that (capped by max_delay)
        if let Some(seconds) = retry_after {
            return Duration::from_secs(seconds).min(self.max_delay);
        }

        // Otherwise use exponential backoff
        let delay_secs = self.initial_delay.as_secs_f64() * self.multiplier.powi(attempt as i32);
        Duration::from_secs_f64(delay_secs).min(self.max_delay)
    }
}

/// Execute an async operation with retry on rate limit errors
pub async fn with_retry<F, Fut, T>(config: &RetryConfig, mut operation: F) -> LmsResult<T>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = LmsResult<T>>,
{
    let mut attempt = 0;

    loop {
        match operation().await {
            Ok(result) => return Ok(result),
            Err(LmsError::RateLimitExceeded { retry_after }) if attempt < config.max_retries => {
                let delay = config.delay_for_attempt(attempt, retry_after);
                sleep(delay).await;
                attempt += 1;
            }
            Err(e) => return Err(e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = RetryConfig::default();
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.initial_delay, Duration::from_secs(1));
        assert_eq!(config.max_delay, Duration::from_secs(60));
        assert_eq!(config.multiplier, 2.0);
    }

    #[test]
    fn test_delay_exponential_backoff() {
        let config = RetryConfig::default();
        assert_eq!(config.delay_for_attempt(0, None), Duration::from_secs(1));
        assert_eq!(config.delay_for_attempt(1, None), Duration::from_secs(2));
        assert_eq!(config.delay_for_attempt(2, None), Duration::from_secs(4));
        assert_eq!(config.delay_for_attempt(3, None), Duration::from_secs(8));
    }

    #[test]
    fn test_delay_respects_retry_after() {
        let config = RetryConfig::default();
        assert_eq!(
            config.delay_for_attempt(0, Some(30)),
            Duration::from_secs(30)
        );
    }

    #[test]
    fn test_delay_caps_at_max() {
        let config = RetryConfig::default();
        // Very high retry_after should be capped
        assert_eq!(
            config.delay_for_attempt(0, Some(120)),
            Duration::from_secs(60)
        );
        // High exponential should also be capped
        assert_eq!(config.delay_for_attempt(10, None), Duration::from_secs(60));
    }
}
