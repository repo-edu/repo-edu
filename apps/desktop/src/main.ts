import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createNodeHttpPort } from "@repo-edu/host-node";
import { createIPCHandler } from "trpc-electron/main";
import { app, BrowserWindow } from "electron";
import { createDesktopRouter } from "./trpc";

const startupMarker = "repo-edu-desktop-cold-start";
const trpcMarker = "repo-edu-desktop-trpc";
const startupStartedAt = performance.now();
const isMeasureMode = process.env.REPO_EDU_DESKTOP_MEASURE === "1";
const isTRPCValidationMode = process.env.REPO_EDU_DESKTOP_VALIDATE_TRPC === "1";

const currentDir = dirname(fileURLToPath(import.meta.url));
const desktopRouter = createDesktopRouter({ http: createNodeHttpPort() });
let ipcHandler: ReturnType<typeof createIPCHandler<typeof desktopRouter>> | null =
  null;

function resolvePreloadPath() {
  return join(currentDir, "../preload/preload.cjs");
}

function resolveRendererUrl() {
  const baseUrl = process.env.ELECTRON_RENDERER_URL;
  const validationSuffix = isTRPCValidationMode ? "?mode=validate-trpc" : "";

  if (baseUrl) {
    return `${baseUrl}${validationSuffix}`;
  }

  const fileUrl = pathToFileURL(join(currentDir, "../renderer/index.html")).toString();

  return `${fileUrl}${validationSuffix}`;
}

function handleValidationMarker(message: string) {
  if (!isTRPCValidationMode) {
    return;
  }

  try {
    const parsed = JSON.parse(message);

    if (parsed.marker !== trpcMarker) {
      return;
    }

    process.stdout.write(`${JSON.stringify(parsed)}\n`);
    setTimeout(() => {
      app.quit();
    }, 50);
  } catch {
    // Ignore unrelated renderer markers.
  }
}

async function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    show: !(isMeasureMode || isTRPCValidationMode),
    backgroundColor: "#111827",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      contextIsolation: true,
      preload: resolvePreloadPath(),
      sandbox: true,
    },
  });

  if (!ipcHandler) {
    ipcHandler = createIPCHandler({
      router: desktopRouter,
      windows: [mainWindow],
    });
  } else {
    ipcHandler.attachWindow(mainWindow);
  }

  if (isTRPCValidationMode) {
    let validationSettled = false;

    const validationPoll = setInterval(() => {
      void mainWindow.webContents
        .executeJavaScript(
          "document.querySelector('#repo-edu-trpc-marker')?.textContent ?? ''",
          true,
        )
        .then((markerText) => {
          if (typeof markerText === "string" && markerText && !validationSettled) {
            validationSettled = true;
            handleValidationMarker(markerText);
          }
        })
        .catch(() => {
          // Ignore validation polling errors during early page startup.
        });
    }, 50);

    const validationTimeout = setTimeout(() => {
      if (validationSettled) {
        return;
      }

      validationSettled = true;

      void mainWindow.webContents
        .executeJavaScript("document.querySelector('#app')?.textContent ?? ''", true)
        .then((textContent) => {
          process.stdout.write(
            `${JSON.stringify({
              marker: trpcMarker,
              timeout: true,
              textContent,
            })}\n`,
          );
        })
        .finally(() => {
          app.quit();
        });
    }, 2000);

    mainWindow.on("closed", () => {
      clearInterval(validationPoll);
      clearTimeout(validationTimeout);
    });
  }

  const rendererUrl = resolveRendererUrl();

  if (isMeasureMode) {
    mainWindow.webContents.once("did-finish-load", () => {
      const didFinishLoadMs = Number(
        (performance.now() - startupStartedAt).toFixed(2),
      );

      process.stdout.write(
        `${JSON.stringify({
          marker: startupMarker,
          didFinishLoadMs,
        })}\n`,
      );

      setTimeout(() => {
        app.quit();
      }, 50);
    });
  }

  await mainWindow.loadURL(rendererUrl);
}

app.whenReady().then(async () => {
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
