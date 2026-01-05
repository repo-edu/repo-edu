use unicode_normalization::UnicodeNormalization;

use super::types::{Assignment, Group};

const MAX_SLUG_LENGTH: usize = 100;

pub fn slugify(input: &str) -> String {
    let normalized: String = input.nfkd().collect();
    let ascii = deunicode::deunicode(&normalized);
    let lower = ascii.to_lowercase();

    let mut output = String::with_capacity(lower.len());
    let mut last_was_hyphen = false;

    for mut ch in lower.chars() {
        if ch == ' ' || ch == '_' {
            ch = '-';
        }

        if ch.is_ascii_alphanumeric() {
            output.push(ch);
            last_was_hyphen = false;
        } else if ch == '-' && !last_was_hyphen {
            output.push('-');
            last_was_hyphen = true;
        }
    }

    let mut slug = output.trim_matches('-').to_string();
    if slug.len() > MAX_SLUG_LENGTH {
        slug.truncate(MAX_SLUG_LENGTH);
        while slug.ends_with('-') {
            slug.pop();
        }
    }

    slug
}

pub fn expand_template(template: &str, assignment: &Assignment, group: &Group) -> String {
    // Placeholders that require roster context (initials/surnames) are handled upstream.
    let initials = String::new();
    let surnames = String::new();
    template
        .replace("{assignment}", &assignment.name)
        .replace("{group}", &group.name)
        .replace("{group_id}", &group.id.to_string())
        .replace("{initials}", &initials)
        .replace("{surnames}", &surnames)
}

pub fn compute_repo_name(template: &str, assignment: &Assignment, group: &Group) -> String {
    slugify(&expand_template(template, assignment, group))
}

#[cfg(test)]
mod tests {
    use super::slugify;

    #[test]
    fn slugify_unicode_normalization() {
        assert_eq!(slugify("Müller"), "muller");
        assert_eq!(slugify("Très Bien"), "tres-bien");
    }

    #[test]
    fn slugify_special_character_removal() {
        assert_eq!(slugify("C++"), "c");
    }

    #[test]
    fn slugify_hyphen_collapsing() {
        assert_eq!(slugify("team__one"), "team-one");
        assert_eq!(slugify("team---one"), "team-one");
    }

    #[test]
    fn slugify_length_truncation() {
        let input = "a".repeat(120);
        let slug = slugify(&input);
        assert_eq!(slug.len(), 100);
    }
}
