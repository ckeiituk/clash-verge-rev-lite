export interface DebouncedFunction<TArgs extends unknown[]> {
  (...args: TArgs): void
  cancel(): void
  flush(): void
}

export const debounce = <TArgs extends unknown[]>(
  func: (...args: TArgs) => void,
  wait: number
): DebouncedFunction<TArgs> => {
  let timeout: ReturnType<typeof setTimeout> | null = null
  let lastArgs: TArgs | null = null

  const invoke = (): void => {
    timeout = null
    if (lastArgs) {
      const args = lastArgs
      lastArgs = null
      func(...args)
    }
  }

  const debounced = ((...args: TArgs): void => {
    lastArgs = args
    if (timeout !== null) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(invoke, wait)
  }) as DebouncedFunction<TArgs>

  debounced.cancel = (): void => {
    if (timeout !== null) {
      clearTimeout(timeout)
      timeout = null
    }
    lastArgs = null
  }

  debounced.flush = (): void => {
    if (timeout !== null) {
      clearTimeout(timeout)
      invoke()
    }
  }

  return debounced
}
