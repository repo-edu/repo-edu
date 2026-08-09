const killOnJobCloseLimit = 0x0000_2000
const extendedLimitInformationClass = 9
const processTerminate = 0x0001
const processSetQuota = 0x0100
const processQueryLimitedInformation = 0x1000

type NativeHandle = bigint

type WindowsJobApi = {
  createJobObject(): NativeHandle
  configureKillOnClose(job: NativeHandle): void
  openProcess(processId: number): NativeHandle
  assignProcess(job: NativeHandle, process: NativeHandle): void
  isProcessInJob(job: NativeHandle, process: NativeHandle): boolean
  terminateJob(job: NativeHandle, exitCode: number): void
  closeHandle(handle: NativeHandle): void
}

export type SavedWindowsProcessIdentity = {
  readonly processId: number
  close(): void
}

export type WindowsKillOnCloseJob = {
  saveProcessIdentity(processId: number): SavedWindowsProcessIdentity
  assign(identity: SavedWindowsProcessIdentity): void
  contains(identity: SavedWindowsProcessIdentity): boolean
  terminate(exitCode: number): void
  close(): void
}

let windowsJobApiPromise: Promise<WindowsJobApi> | null = null
const nativeProcessHandleKey = Symbol("saved-windows-process-handle")

type SavedWindowsProcessIdentityState = SavedWindowsProcessIdentity & {
  [nativeProcessHandleKey]: NativeHandle | undefined
}

function requiredHandle(value: unknown, operation: string): NativeHandle {
  if (typeof value !== "bigint" || value === 0n) {
    throw new Error(`${operation} returned no handle.`)
  }
  return value
}

function requiredSuccess(
  value: unknown,
  operation: string,
  getLastError: () => unknown,
): void {
  if (value !== 0 && value !== false) {
    return
  }
  throw new Error(`${operation} failed with Windows error ${getLastError()}.`)
}

async function loadWindowsJobApi(): Promise<WindowsJobApi> {
  if (process.platform !== "win32") {
    throw new Error("Windows job objects are only available on Windows.")
  }

  if (windowsJobApiPromise) {
    return await windowsJobApiPromise
  }

  windowsJobApiPromise = (async () => {
    const koffiPackage = "koffi"
    const imported = (await import(koffiPackage)) as typeof import("koffi")
    const koffi = imported.default
    const kernel32 = koffi.load("kernel32.dll")

    const handle = koffi.pointer("HANDLE", koffi.opaque())
    const basicLimitInformation = koffi.struct(
      "JOBOBJECT_BASIC_LIMIT_INFORMATION",
      {
        PerProcessUserTimeLimit: "int64_t",
        PerJobUserTimeLimit: "int64_t",
        LimitFlags: "uint32_t",
        MinimumWorkingSetSize: "size_t",
        MaximumWorkingSetSize: "size_t",
        ActiveProcessLimit: "uint32_t",
        Affinity: "uintptr_t",
        PriorityClass: "uint32_t",
        SchedulingClass: "uint32_t",
      },
    )
    const ioCounters = koffi.struct("IO_COUNTERS", {
      ReadOperationCount: "uint64_t",
      WriteOperationCount: "uint64_t",
      OtherOperationCount: "uint64_t",
      ReadTransferCount: "uint64_t",
      WriteTransferCount: "uint64_t",
      OtherTransferCount: "uint64_t",
    })
    const extendedLimitInformation = koffi.struct(
      "JOBOBJECT_EXTENDED_LIMIT_INFORMATION",
      {
        BasicLimitInformation: basicLimitInformation,
        IoInfo: ioCounters,
        ProcessMemoryLimit: "size_t",
        JobMemoryLimit: "size_t",
        PeakProcessMemoryUsed: "size_t",
        PeakJobMemoryUsed: "size_t",
      },
    )

    const createJobObject = kernel32.func("CreateJobObjectW", handle, [
      koffi.pointer("void"),
      "str16",
    ])
    const setInformationJobObject = kernel32.func(
      "SetInformationJobObject",
      "int",
      [handle, "int", koffi.pointer(extendedLimitInformation), "uint32_t"],
    )
    const openProcess = kernel32.func("OpenProcess", handle, [
      "uint32_t",
      "int",
      "uint32_t",
    ])
    const assignProcessToJobObject = kernel32.func(
      "AssignProcessToJobObject",
      "int",
      [handle, handle],
    )
    const isProcessInJob = kernel32.func("IsProcessInJob", "int", [
      handle,
      handle,
      koffi.out(koffi.pointer("int")),
    ])
    const terminateJobObject = kernel32.func("TerminateJobObject", "int", [
      handle,
      "uint32_t",
    ])
    const closeHandle = kernel32.func("CloseHandle", "int", [handle])
    const getLastError = kernel32.func("GetLastError", "uint32_t", [])

    return {
      createJobObject() {
        return requiredHandle(createJobObject(null, null), "CreateJobObjectW")
      },
      configureKillOnClose(job) {
        const limits = {
          BasicLimitInformation: {
            PerProcessUserTimeLimit: 0,
            PerJobUserTimeLimit: 0,
            LimitFlags: killOnJobCloseLimit,
            MinimumWorkingSetSize: 0,
            MaximumWorkingSetSize: 0,
            ActiveProcessLimit: 0,
            Affinity: 0,
            PriorityClass: 0,
            SchedulingClass: 0,
          },
          IoInfo: {
            ReadOperationCount: 0,
            WriteOperationCount: 0,
            OtherOperationCount: 0,
            ReadTransferCount: 0,
            WriteTransferCount: 0,
            OtherTransferCount: 0,
          },
          ProcessMemoryLimit: 0,
          JobMemoryLimit: 0,
          PeakProcessMemoryUsed: 0,
          PeakJobMemoryUsed: 0,
        }
        requiredSuccess(
          setInformationJobObject(
            job,
            extendedLimitInformationClass,
            limits,
            koffi.sizeof(extendedLimitInformation),
          ),
          "SetInformationJobObject",
          getLastError,
        )
      },
      openProcess(processId) {
        return requiredHandle(
          openProcess(
            processTerminate | processSetQuota | processQueryLimitedInformation,
            0,
            processId,
          ),
          "OpenProcess",
        )
      },
      assignProcess(job, processHandle) {
        requiredSuccess(
          assignProcessToJobObject(job, processHandle),
          "AssignProcessToJobObject",
          getLastError,
        )
      },
      isProcessInJob(job, processHandle) {
        const result = [0]
        requiredSuccess(
          isProcessInJob(processHandle, job, result),
          "IsProcessInJob",
          getLastError,
        )
        return result[0] !== 0
      },
      terminateJob(job, exitCode) {
        requiredSuccess(
          terminateJobObject(job, exitCode),
          "TerminateJobObject",
          getLastError,
        )
      },
      closeHandle(nativeHandle) {
        requiredSuccess(closeHandle(nativeHandle), "CloseHandle", getLastError)
      },
    }
  })()

  windowsJobApiPromise.catch(() => {
    windowsJobApiPromise = null
  })
  return await windowsJobApiPromise
}

export async function createWindowsKillOnCloseJob(): Promise<WindowsKillOnCloseJob> {
  const api = await loadWindowsJobApi()
  const jobHandle = api.createJobObject()
  let jobClosed = false

  try {
    api.configureKillOnClose(jobHandle)
  } catch (error) {
    api.closeHandle(jobHandle)
    throw error
  }

  function nativeProcessHandle(
    identity: SavedWindowsProcessIdentity,
  ): NativeHandle {
    const state = identity as SavedWindowsProcessIdentityState
    const nativeHandle = state[nativeProcessHandleKey]
    if (nativeHandle === undefined) {
      throw new Error("The saved Windows process identity is closed.")
    }
    return nativeHandle
  }

  return {
    saveProcessIdentity(processId) {
      if (jobClosed) {
        throw new Error("The Windows job is closed.")
      }
      const nativeHandle = api.openProcess(processId)
      let processClosed = false
      const identity: SavedWindowsProcessIdentityState = {
        processId,
        get [nativeProcessHandleKey]() {
          return processClosed ? undefined : nativeHandle
        },
        close() {
          if (processClosed) {
            return
          }
          processClosed = true
          api.closeHandle(nativeHandle)
        },
      }
      return identity
    },
    assign(identity) {
      if (jobClosed) {
        throw new Error("The Windows job is closed.")
      }
      api.assignProcess(jobHandle, nativeProcessHandle(identity))
    },
    contains(identity) {
      if (jobClosed) {
        throw new Error("The Windows job is closed.")
      }
      return api.isProcessInJob(jobHandle, nativeProcessHandle(identity))
    },
    terminate(exitCode) {
      if (jobClosed) {
        return
      }
      api.terminateJob(jobHandle, exitCode)
    },
    close() {
      if (jobClosed) {
        return
      }
      jobClosed = true
      api.closeHandle(jobHandle)
    },
  }
}
