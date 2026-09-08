# Desktop trust matrix

Run `pnpm --filter @repo-edu/desktop run validate:trust` from the workspace
root. An existing packaged desktop application is required. The command never
runs an application builder and fails if the packaged runtime is missing.

Every trust and request-port case runs with development Electron over HTTP and
with a copy of the packaged Electron runtime over a resource file URL. The
tests assert `app.isPackaged`, sandboxing and context isolation. The packaged
copy uses the current gateway fixtures as its application entry and keeps its
documents and request preload under its own resources. Temporary copies are
removed after the tests; the original release is unchanged.

This matrix proves runtime sender validation, navigation refusal, port transfer,
request isolation, protocol rejection and cleanup. It does not prove release
bundle contents or signing. The normal runtime validation runs this matrix
alongside the separate application artifact checks.

The adversarial preload belongs only to the test fixtures. It sends raw invalid
messages so host rejection cannot be satisfied by preload validation alone.
