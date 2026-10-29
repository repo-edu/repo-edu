import type { MenuItemConstructorOptions } from "electron"

export type DesktopMenuOptions = {
  isMac: boolean
  appName: string
  updateItems: MenuItemConstructorOptions[]
  documentation(): void
  about(): void
  close(): void
  quit(): void
}

type DesktopMenuAction = "documentation" | "about" | "close" | "quit"

const desktopMenuActionCallbacks = {
  documentation: "documentation",
  about: "about",
  close: "close",
  quit: "quit",
} as const satisfies Record<DesktopMenuAction, DesktopMenuAction>

type DesktopNativeMenuRole =
  | "services"
  | "hide"
  | "hideOthers"
  | "unhide"
  | "editMenu"
  | "resetZoom"
  | "zoomIn"
  | "zoomOut"
  | "togglefullscreen"
  | "windowMenu"

const desktopNativeMenuRoles = {
  services: "services",
  hide: "hide",
  hideOthers: "hideOthers",
  unhide: "unhide",
  editMenu: "editMenu",
  resetZoom: "resetZoom",
  zoomIn: "zoomIn",
  zoomOut: "zoomOut",
  togglefullscreen: "togglefullscreen",
  windowMenu: "windowMenu",
} as const satisfies Record<DesktopNativeMenuRole, DesktopNativeMenuRole>

function runMenuAction(
  options: DesktopMenuOptions,
  action: DesktopMenuAction,
): void {
  options[desktopMenuActionCallbacks[action]]()
}

function nativeMenuItem(
  role: DesktopNativeMenuRole,
): MenuItemConstructorOptions {
  return { role: desktopNativeMenuRoles[role] }
}

function createHelpMenu(options: DesktopMenuOptions) {
  const helpItems: MenuItemConstructorOptions[] = [
    {
      label: "Documentation",
      click: () => {
        runMenuAction(options, "documentation")
      },
    },
  ]

  if (!options.isMac) {
    helpItems.push({ type: "separator" }, ...options.updateItems)
  }

  if (!options.isMac) {
    helpItems.push(
      { type: "separator" },
      {
        label: `About ${options.appName}`,
        click: () => {
          runMenuAction(options, "about")
        },
      },
    )
  }

  return {
    label: "Help",
    submenu: helpItems,
  } satisfies MenuItemConstructorOptions
}

export function createDesktopMenuTemplate(options: DesktopMenuOptions) {
  const { isMac } = options
  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: options.appName,
      submenu: [
        {
          label: `About ${options.appName}`,
          click: () => {
            runMenuAction(options, "about")
          },
        },
        { type: "separator" },
        ...options.updateItems,
        { type: "separator" },
        nativeMenuItem("services"),
        { type: "separator" },
        nativeMenuItem("hide"),
        nativeMenuItem("hideOthers"),
        nativeMenuItem("unhide"),
        { type: "separator" },
        {
          label: `Quit ${options.appName}`,
          accelerator: "Command+Q",
          click: () => {
            runMenuAction(options, "quit")
          },
        },
      ],
    })
  }

  template.push(
    {
      label: "File",
      submenu: [
        {
          label: "Close",
          accelerator: "CmdOrCtrl+W",
          click: () => {
            runMenuAction(options, "close")
          },
        },
        ...(!isMac
          ? [
              {
                label: "Quit",
                accelerator: "Alt+F4",
                click: () => {
                  runMenuAction(options, "quit")
                },
              },
            ]
          : []),
      ],
    },
    nativeMenuItem("editMenu"),
    {
      label: "View",
      submenu: [
        nativeMenuItem("resetZoom"),
        nativeMenuItem("zoomIn"),
        nativeMenuItem("zoomOut"),
        { type: "separator" },
        nativeMenuItem("togglefullscreen"),
      ],
    },
    nativeMenuItem("windowMenu"),
  )

  template.push(createHelpMenu(options))

  return template
}
