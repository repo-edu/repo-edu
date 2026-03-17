#!/usr/bin/env sh

set -eu

GITLAB_ROOT_PASSWORD="${GITLAB_INITIAL_ROOT_PASSWORD:-R7vK2pQ9mL4xT8nC5bH3jF6sD1wZ}"

docker compose up -d --renew-anon-volumes gitlab

CONTAINER_ID="$(docker compose ps -q gitlab)"
if [ -z "${CONTAINER_ID}" ]; then
  echo "Failed to resolve GitLab container id." >&2
  exit 1
fi

LOG_FILE="${GITLAB_LOG_FILE:-./.gitlab-startup.log}"
LOG_TAIL="${GITLAB_LOG_TAIL:-10}"
LOG_FILTER_REGEX="${GITLAB_LOG_FILTER_REGEX:-running bootstrap script \.\.\. ok|performing post-bootstrap initialization \.\.\. ok|Could not create the default administrator account|Mixlib::ShellOut::ShellCommandFailed|FATAL:|Timed out|GitLab bootstrap runner failed|gitlab bootstrap complete|exited with code}"
LOG_EXCLUDE_REGEX="${GITLAB_LOG_EXCLUDE_REGEX:-BatchedBackgroundMigration|dynamic postgres partitions|/database|/sidekiq|/-/metrics|UnlockPipelinesInQueueWorker|gitlab_access.log|route_id\":\"health\"|gitlab-exporter/current|relation \"ci_(pipelines|job_artifacts)\" does not exist|JOIN ci_pipelines|LEFT JOIN ci_job_artifacts|/var/run/secrets/kubernetes.io/serviceaccount/ca.crt|scrape_pool=kubernetes-(pods|cadvisor|nodes)|component=\"scrape manager\"|/var/log/gitlab/prometheus/current}"

: > "${LOG_FILE}"
echo "Streaming filtered GitLab logs. Full raw logs: ${LOG_FILE}"

(
  docker compose logs -f --tail "${LOG_TAIL}" gitlab \
    | tee -a "${LOG_FILE}" \
    | grep --line-buffered -Ei "${LOG_FILTER_REGEX}" \
    | grep --line-buffered -Eiv "${LOG_EXCLUDE_REGEX}" || true
) &
LOGS_PID=$!

cleanup() {
  kill "${LOGS_PID}" >/dev/null 2>&1 || true
  wait "${LOGS_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

TIMEOUT_SEC="${GITLAB_START_TIMEOUT_SEC:-1800}"
HEARTBEAT_SEC="${GITLAB_HEARTBEAT_SEC:-10}"
ELAPSED=0
INTERVAL=5

while true; do
  STATUS="$(
    docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${CONTAINER_ID}" 2>/dev/null || echo "missing"
  )"

  if [ "${STATUS}" = "healthy" ]; then
    echo "Heartbeat: container health ready elapsed=${ELAPSED}s status=${STATUS}"
    break
  fi

  if [ "${STATUS}" = "unhealthy" ] || [ "${STATUS}" = "exited" ] || [ "${STATUS}" = "dead" ] || [ "${STATUS}" = "missing" ]; then
    echo "GitLab container entered unexpected status '${STATUS}'." >&2
    exit 1
  fi

  if [ "${ELAPSED}" -ge "${TIMEOUT_SEC}" ]; then
    echo "Timed out waiting for GitLab to become healthy after ${TIMEOUT_SEC}s." >&2
    exit 1
  fi

  if [ $((ELAPSED % HEARTBEAT_SEC)) -eq 0 ]; then
    echo "Heartbeat: waiting-container-health elapsed=${ELAPSED}s status=${STATUS}"
  fi

  sleep "${INTERVAL}"
  ELAPSED=$((ELAPSED + INTERVAL))
done

RAILS_TIMEOUT_SEC="${GITLAB_RAILS_READY_TIMEOUT_SEC:-900}"
RAILS_ELAPSED=0

while true; do
  USERS_COUNT="$(
    docker compose exec -T gitlab gitlab-rails runner 'puts User.count' 2>/dev/null \
      | tr -dc '0-9\n' \
      | tail -n 1 || true
  )"

  if [ -n "${USERS_COUNT}" ] && [ "${USERS_COUNT}" -gt 0 ]; then
    echo "Heartbeat: rails users ready elapsed=${RAILS_ELAPSED}s users=${USERS_COUNT}"
    break
  fi

  if [ "${RAILS_ELAPSED}" -ge "${RAILS_TIMEOUT_SEC}" ]; then
    echo "Timed out waiting for GitLab Rails user bootstrap after ${RAILS_TIMEOUT_SEC}s." >&2
    exit 1
  fi

  if [ $((RAILS_ELAPSED % HEARTBEAT_SEC)) -eq 0 ]; then
    echo "Heartbeat: waiting-rails-users elapsed=${RAILS_ELAPSED}s users=${USERS_COUNT:-0}"
  fi

  sleep "${INTERVAL}"
  RAILS_ELAPSED=$((RAILS_ELAPSED + INTERVAL))
done

echo "Heartbeat: bootstrap runner start"

(
  docker compose exec -T gitlab gitlab-rails runner "
admin = User.find_by_username('root') || User.admins.first
if admin.nil?
  admin = User.new(
    username: 'integration-admin',
    name: 'Integration Admin',
    email: 'integration-admin@test.local',
    admin: true
  )
  admin.password = '${GITLAB_ROOT_PASSWORD}'
  admin.password_confirmation = '${GITLAB_ROOT_PASSWORD}'
  admin.confirmed_at = Time.current if admin.respond_to?(:confirmed_at=)
  admin.skip_confirmation! if admin.respond_to?(:skip_confirmation!)
  admin.save!
end

PersonalAccessToken.where(user_id: admin.id, name: 'integration-token').delete_all
token = admin.personal_access_tokens.create!(
  name: 'integration-token',
  scopes: [:api],
  expires_at: 1.year.from_now
)
token.set_token('integration-root-token')
token.save!

group = Group.find_by_full_path('integration-root')
if group.nil?
  organization = Organizations::Organization.default_organization
  organization ||= Organizations::Organization.first
  raise 'organization not found' if organization.nil?

  group = Group.create!(
    name: 'integration-root',
    path: 'integration-root',
    organization: organization,
    visibility_level: Gitlab::VisibilityLevel::PRIVATE
  )
end

group.create_namespace_settings! if group.namespace_settings.nil?
group.add_owner(admin)

puts 'gitlab bootstrap complete'
"
) &
BOOTSTRAP_PID=$!
BOOTSTRAP_ELAPSED=0

while kill -0 "${BOOTSTRAP_PID}" 2>/dev/null; do
  if [ $((BOOTSTRAP_ELAPSED % HEARTBEAT_SEC)) -eq 0 ]; then
    echo "Heartbeat: running-bootstrap elapsed=${BOOTSTRAP_ELAPSED}s"
  fi

  sleep "${INTERVAL}"
  BOOTSTRAP_ELAPSED=$((BOOTSTRAP_ELAPSED + INTERVAL))
done

if ! wait "${BOOTSTRAP_PID}"; then
  echo "GitLab bootstrap runner failed." >&2
  exit 1
fi

echo "Heartbeat: bootstrap complete elapsed=${BOOTSTRAP_ELAPSED}s"
