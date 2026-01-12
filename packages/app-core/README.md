# @repo-edu/app-core

This package contains the core application logic and UI for Repo Manage.
It is designed to be environment-agnostic, running equally well in:

1. **Tauri Desktop App:** Injected with a `TauriBackend` that communicates with Rust.
2. **Web/Docs Demo:** Injected with a `MockBackend` that simulates behavior in the browser.

## Architecture

- **`src/App.tsx`**: The root component.
- **`src/services/backend.ts`**: The singleton accessor for the injected backend.
- **`src/bindings/`**: Generated command wrappers that route to the backend.

## Usage

```tsx
import { AppRoot, BackendProvider, setBackend } from "@repo-edu/app-core";
import { MockBackend } from "@repo-edu/backend-mock";

const backend = new MockBackend();
setBackend(backend);

function MyRoot() {
  return (
    <BackendProvider backend={backend}>
      <AppRoot />
    </BackendProvider>
  );
}
```
