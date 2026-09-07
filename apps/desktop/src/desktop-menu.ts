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

function createHelpMenu(options: DesktopMenuOptions) {
  const helpItems: MenuItemConstructorOptions[] = [
    {
      label: "Documentation",
      click: () => {
        options.documentation()
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
          options.about()
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
            options.about()
          },
        },
        { type: "separator" },
        ...options.updateItems,
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        {
          label: `Quit ${options.appName}`,
          accelerator: "Command+Q",
          click: () => {
            options.quit()
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
            options.close()
          },
        },
        ...(!isMac
          ? [
              {
                label: "Quit",
                accelerator: "Alt+F4",
                click: () => {
                  options.quit()
                },
              },
            ]
          : []),
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  )

  template.push(createHelpMenu(options))

  return template
}
