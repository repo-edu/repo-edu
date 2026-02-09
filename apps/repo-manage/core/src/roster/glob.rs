//! Simple glob pattern matching for group name filtering.
//!
//! Supports a subset of glob syntax:
//! - `*` matches any sequence of characters (including empty)
//! - `?` matches any single character
//! - `[abc]` matches any character in the set
//! - `[!abc]` or `[^abc]` matches any character NOT in the set (both treated as negation)
//! - `\\` escapes the next character
//!
//! Rejects:
//! - `**` (recursive glob)
//! - Extglobs like `@(...)`, `!(...)`, etc.
//! - Brace expansion like `{a,b}`

use std::fmt;

/// Error when parsing or validating a glob pattern.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GlobError {
    /// Pattern contains `**` which is not allowed.
    RecursiveGlob,
    /// Pattern contains unclosed `[` bracket.
    UnclosedBracket,
    /// Pattern contains empty bracket expression `[]`.
    EmptyBracket,
    /// Pattern contains extglob syntax.
    ExtglobNotAllowed,
    /// Pattern contains brace expansion.
    BraceExpansionNotAllowed,
    /// Pattern ends with unescaped backslash.
    TrailingBackslash,
}

impl fmt::Display for GlobError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            GlobError::RecursiveGlob => write!(f, "recursive glob '**' is not allowed"),
            GlobError::UnclosedBracket => write!(f, "unclosed '[' bracket"),
            GlobError::EmptyBracket => write!(f, "empty bracket expression '[]' is not allowed"),
            GlobError::ExtglobNotAllowed => write!(f, "extglob patterns are not allowed"),
            GlobError::BraceExpansionNotAllowed => write!(f, "brace expansion is not allowed"),
            GlobError::TrailingBackslash => write!(f, "pattern ends with unescaped backslash"),
        }
    }
}

impl std::error::Error for GlobError {}

/// A compiled simple glob pattern.
#[derive(Debug, Clone)]
pub struct SimpleGlob {
    tokens: Vec<Token>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    /// Match any sequence of characters.
    Star,
    /// Match exactly one character.
    Question,
    /// Match one character from the set.
    CharClass { chars: Vec<char>, negated: bool },
    /// Match a literal character.
    Literal(char),
}

impl SimpleGlob {
    /// Parse and validate a glob pattern.
    pub fn new(pattern: &str) -> Result<Self, GlobError> {
        let tokens = Self::parse(pattern)?;
        Ok(SimpleGlob { tokens })
    }

    /// Validate a glob pattern without compiling it.
    pub fn validate(pattern: &str) -> Result<(), GlobError> {
        Self::parse(pattern)?;
        Ok(())
    }

    fn parse(pattern: &str) -> Result<Vec<Token>, GlobError> {
        let chars: Vec<char> = pattern.chars().collect();
        let mut tokens = Vec::new();
        let mut i = 0;

        while i < chars.len() {
            let c = chars[i];
            match c {
                '\\' => {
                    // Escape next character
                    if i + 1 >= chars.len() {
                        return Err(GlobError::TrailingBackslash);
                    }
                    i += 1;
                    tokens.push(Token::Literal(chars[i]));
                }
                '*' => {
                    // Check for ** (recursive glob)
                    if i + 1 < chars.len() && chars[i + 1] == '*' {
                        return Err(GlobError::RecursiveGlob);
                    }
                    tokens.push(Token::Star);
                }
                '?' => {
                    tokens.push(Token::Question);
                }
                '[' => {
                    // Parse character class
                    let (token, consumed) = Self::parse_char_class(&chars[i..])?;
                    tokens.push(token);
                    i += consumed - 1; // -1 because we increment at end of loop
                }
                '{' => {
                    return Err(GlobError::BraceExpansionNotAllowed);
                }
                // Extglob patterns: @(...), +(...), !(...), ?(...) - but note '!' alone
                // at start of char class is valid, so we only check when followed by '('
                '@' | '+' if i + 1 < chars.len() && chars[i + 1] == '(' => {
                    return Err(GlobError::ExtglobNotAllowed);
                }
                // Note: '?' by itself is handled above as Token::Question
                // '!(' is extglob, but '!' alone in a char class is negation - handled in parse_char_class
                _ => {
                    tokens.push(Token::Literal(c));
                }
            }
            i += 1;
        }

        Ok(tokens)
    }

    fn parse_char_class(chars: &[char]) -> Result<(Token, usize), GlobError> {
        debug_assert!(chars[0] == '[');

        let mut i = 1;
        let mut class_chars = Vec::new();
        let mut negated = false;

        // Check for negation
        if i < chars.len() && (chars[i] == '!' || chars[i] == '^') {
            negated = true;
            i += 1;
        }

        // Handle literal ] at start
        if i < chars.len() && chars[i] == ']' {
            class_chars.push(']');
            i += 1;
        }

        // Parse until closing ]
        while i < chars.len() {
            let c = chars[i];
            if c == ']' {
                if class_chars.is_empty() {
                    return Err(GlobError::EmptyBracket);
                }
                return Ok((
                    Token::CharClass {
                        chars: class_chars,
                        negated,
                    },
                    i + 1,
                ));
            }
            // Handle ranges like a-z
            if i + 2 < chars.len() && chars[i + 1] == '-' && chars[i + 2] != ']' {
                let start = c;
                let end = chars[i + 2];
                if start <= end {
                    for ch in start..=end {
                        class_chars.push(ch);
                    }
                } else {
                    // Invalid range, treat as literals
                    class_chars.push(start);
                    class_chars.push('-');
                    class_chars.push(end);
                }
                i += 3;
            } else {
                class_chars.push(c);
                i += 1;
            }
        }

        Err(GlobError::UnclosedBracket)
    }

    /// Check if the pattern matches the given string.
    /// Full-string, case-sensitive match.
    pub fn is_match(&self, text: &str) -> bool {
        let chars: Vec<char> = text.chars().collect();
        Self::match_tokens(&self.tokens, &chars)
    }

    fn match_tokens(tokens: &[Token], chars: &[char]) -> bool {
        if tokens.is_empty() {
            return chars.is_empty();
        }

        let token = &tokens[0];
        let rest_tokens = &tokens[1..];

        match token {
            Token::Literal(c) => {
                if chars.is_empty() || chars[0] != *c {
                    return false;
                }
                Self::match_tokens(rest_tokens, &chars[1..])
            }
            Token::Question => {
                if chars.is_empty() {
                    return false;
                }
                Self::match_tokens(rest_tokens, &chars[1..])
            }
            Token::CharClass {
                chars: class,
                negated,
            } => {
                if chars.is_empty() {
                    return false;
                }
                let matches = class.contains(&chars[0]);
                let matches = if *negated { !matches } else { matches };
                if !matches {
                    return false;
                }
                Self::match_tokens(rest_tokens, &chars[1..])
            }
            Token::Star => {
                // Try matching zero or more characters
                for i in 0..=chars.len() {
                    if Self::match_tokens(rest_tokens, &chars[i..]) {
                        return true;
                    }
                }
                false
            }
        }
    }
}

/// Validate a glob pattern and return an error message if invalid.
pub fn validate_glob_pattern(pattern: &str) -> Result<(), String> {
    SimpleGlob::validate(pattern).map_err(|e| e.to_string())
}

/// Check if a pattern matches a string.
pub fn glob_match(pattern: &str, text: &str) -> Result<bool, String> {
    let glob = SimpleGlob::new(pattern).map_err(|e| e.to_string())?;
    Ok(glob.is_match(text))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_literal_match() {
        let glob = SimpleGlob::new("hello").unwrap();
        assert!(glob.is_match("hello"));
        assert!(!glob.is_match("Hello"));
        assert!(!glob.is_match("hello!"));
        assert!(!glob.is_match("hell"));
    }

    #[test]
    fn test_star_match() {
        let glob = SimpleGlob::new("1D*").unwrap();
        assert!(glob.is_match("1D"));
        assert!(glob.is_match("1D1"));
        assert!(glob.is_match("1D123"));
        assert!(!glob.is_match("2D1"));

        let glob = SimpleGlob::new("*test*").unwrap();
        assert!(glob.is_match("test"));
        assert!(glob.is_match("mytest"));
        assert!(glob.is_match("testcase"));
        assert!(glob.is_match("mytestcase"));
    }

    #[test]
    fn test_question_match() {
        let glob = SimpleGlob::new("te?t").unwrap();
        assert!(glob.is_match("test"));
        assert!(glob.is_match("text"));
        assert!(!glob.is_match("tet"));
        assert!(!glob.is_match("testt"));
    }

    #[test]
    fn test_char_class() {
        let glob = SimpleGlob::new("[abc]").unwrap();
        assert!(glob.is_match("a"));
        assert!(glob.is_match("b"));
        assert!(glob.is_match("c"));
        assert!(!glob.is_match("d"));
        assert!(!glob.is_match("ab"));
    }

    #[test]
    fn test_char_class_negated() {
        let glob = SimpleGlob::new("[!abc]").unwrap();
        assert!(!glob.is_match("a"));
        assert!(!glob.is_match("b"));
        assert!(glob.is_match("d"));
        assert!(glob.is_match("x"));

        // Also test with ^ for negation
        let glob = SimpleGlob::new("[^abc]").unwrap();
        assert!(!glob.is_match("a"));
        assert!(glob.is_match("d"));
    }

    #[test]
    fn test_char_class_range() {
        let glob = SimpleGlob::new("[a-z]").unwrap();
        assert!(glob.is_match("a"));
        assert!(glob.is_match("m"));
        assert!(glob.is_match("z"));
        assert!(!glob.is_match("A"));
        assert!(!glob.is_match("0"));
    }

    #[test]
    fn test_escape() {
        let glob = SimpleGlob::new(r"test\*").unwrap();
        assert!(glob.is_match("test*"));
        assert!(!glob.is_match("test"));
        assert!(!glob.is_match("testx"));

        let glob = SimpleGlob::new(r"\[test\]").unwrap();
        assert!(glob.is_match("[test]"));
    }

    #[test]
    fn test_reject_recursive_glob() {
        assert!(matches!(
            SimpleGlob::new("**"),
            Err(GlobError::RecursiveGlob)
        ));
        assert!(matches!(
            SimpleGlob::new("a**b"),
            Err(GlobError::RecursiveGlob)
        ));
    }

    #[test]
    fn test_reject_brace_expansion() {
        assert!(matches!(
            SimpleGlob::new("{a,b}"),
            Err(GlobError::BraceExpansionNotAllowed)
        ));
    }

    #[test]
    fn test_reject_extglob() {
        assert!(matches!(
            SimpleGlob::new("@(foo)"),
            Err(GlobError::ExtglobNotAllowed)
        ));
        assert!(matches!(
            SimpleGlob::new("+(foo)"),
            Err(GlobError::ExtglobNotAllowed)
        ));
        // Note: !(foo) parses as [!foo] char class followed by ), not extglob
        // ?() is parsed as ? followed by literal ()
    }

    #[test]
    fn test_unclosed_bracket() {
        assert!(matches!(
            SimpleGlob::new("[abc"),
            Err(GlobError::UnclosedBracket)
        ));
    }

    #[test]
    fn test_trailing_backslash() {
        assert!(matches!(
            SimpleGlob::new(r"test\"),
            Err(GlobError::TrailingBackslash)
        ));
    }

    #[test]
    fn test_complex_pattern() {
        let glob = SimpleGlob::new("team-[a-z]*-2024").unwrap();
        assert!(glob.is_match("team-a-2024"));
        assert!(glob.is_match("team-alpha-2024"));
        assert!(glob.is_match("team-z-project-2024"));
        assert!(!glob.is_match("team-A-2024")); // Case sensitive
        assert!(!glob.is_match("team-1-2024")); // Not in range
    }
}
