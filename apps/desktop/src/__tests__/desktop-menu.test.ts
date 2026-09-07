import assert from "node:assert/strict"
import { it } from "node:test"
import type { MenuItemConstructorOptions } from "electron"
import { createDesktopMenuTemplate } from "../desktop-menu"

function flatten(
  items: MenuItemConstructorOptions[],
): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? flatten(item.submenu) : []),
  ])
}

for (const isMac of [false, true]) {
  it(`keeps safe native menus and owned lifecycle actions (${isMac ? "macOS" : "other"})`, () => {
    const actions: string[] = []
    const items = flatten(
      createDesktopMenuTemplate({
        isMac,
        appName: "Repo Edu",
        updateItems: [],
        close: () => {
          actions.push("close")
        },
        quit: () => {
          actions.push("quit")
        },
        about: () => {
          actions.push("about")
        },
        documentation: () => {
          actions.push("documentation")
        },
      }),
    )
    assert.deepEqual(
      items.flatMap((item) => (item.role ? [item.role] : [])).sort(),
      [
        "editMenu",
        "resetZoom",
        "zoomIn",
        "zoomOut",
        "togglefullscreen",
        "windowMenu",
        ...(isMac ? ["services", "hide", "hideOthers", "unhide"] : []),
      ].sort(),
    )
    for (const label of [
      "Close",
      isMac ? "Quit Repo Edu" : "Quit",
      "About Repo Edu",
      "Documentation",
    ]) {
      const item = items.find((candidate) => candidate.label === label)
      assert.ok(item?.click)
      Reflect.apply(item.click, undefined, [])
    }
    assert.deepEqual(actions, ["close", "quit", "about", "documentation"])
    assert.equal(
      items.some((item) =>
        /(?:F5|CmdOrCtrl\+R|Command\+R)/i.test(item.accelerator ?? ""),
      ),
      false,
    )
  })
}
