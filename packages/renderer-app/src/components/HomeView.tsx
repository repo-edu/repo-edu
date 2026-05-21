import { OpenRepositoriesForm } from "./OpenRepositoriesForm.js"

export function HomeView() {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-xl px-6 py-10">
        <OpenRepositoriesForm />
      </div>
    </div>
  )
}
