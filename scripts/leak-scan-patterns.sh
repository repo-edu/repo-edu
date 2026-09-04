# Email pattern and allow list shared by the leak-scan scripts. Sourced, never run.
# The rules are in leak-scan.md.
#
# Every line the allow list filters starts with the file path and a colon, because two allowances
# match on the path: third-party licence texts under a licenses/ folder and pnpm-lock.yaml.

EMAIL_PATTERN='[A-Za-z0-9._%+-]+@[A-Za-z][A-Za-z0-9.-]*\.[a-z]{2,}'
EMAIL_ALLOW='d\.a\.v\.beek@tue\.nl|opensource@repo-edu\.dev|@([A-Za-z0-9-]+\.)*example\.(com|org|net)\b|@[A-Za-z0-9.-]+\.(test|invalid|local)\b|^[^:]*/licenses/[^:]*:|^pnpm-lock\.yaml:|x-access-token:token(-[0-9]+)?@'

# Prints every email address in the staged tree outside the allow list, as path:line:text, and
# returns 1 when there is one.
report_staged_emails() {
  hits=$(git grep --cached -n -I -E "$EMAIL_PATTERN" | grep -v -E "$EMAIL_ALLOW" || true)
  if [ -n "$hits" ]; then
    printf '%s\n' "$hits"
    printf 'leak-scan: email address outside the allow list\n' >&2
    return 1
  fi
  return 0
}
