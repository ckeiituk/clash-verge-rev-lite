import { useSyncExternalStore } from 'react'

type StoreStateUpdater<TState extends object> =
  | TState
  | Partial<TState>
  | ((state: TState) => TState | Partial<TState>)

type StoreListener<TState extends object> = (state: TState, previousState: TState) => void

type Selector<TState extends object, TSlice> = (state: TState) => TSlice

export interface BoundStore<TState extends object> {
  (): TState
  <TSlice>(selector: Selector<TState, TSlice>): TSlice
  getState: () => TState
  setState: (updater: StoreStateUpdater<TState>, replace?: boolean) => void
  subscribe: (listener: StoreListener<TState>) => () => void
}

export const createStore = <TState extends object>(
  initializer: (
    set: BoundStore<TState>['setState'],
    get: BoundStore<TState>['getState']
  ) => TState
): BoundStore<TState> => {
  let state: TState
  const listeners = new Set<StoreListener<TState>>()

  const getState = (): TState => state

  const setState: BoundStore<TState>['setState'] = (updater, replace = false): void => {
    const previousState = state
    const nextValue = typeof updater === 'function' ? updater(state) : updater
    state = replace ? (nextValue as TState) : { ...state, ...nextValue }

    if (Object.is(previousState, state)) return

    listeners.forEach((listener) => {
      listener(state, previousState)
    })
  }

  const subscribe: BoundStore<TState>['subscribe'] = (listener): (() => void) => {
    listeners.add(listener)
    return (): void => {
      listeners.delete(listener)
    }
  }

  state = initializer(setState, getState)

  const useStore = (<TSlice>(selector?: Selector<TState, TSlice>): TState | TSlice => {
    const getSnapshot = (): TState | TSlice => (selector ? selector(state) : state)
    return useSyncExternalStore(
      (notify) =>
        subscribe(() => {
          notify()
        }),
      getSnapshot,
      getSnapshot
    )
  }) as BoundStore<TState>

  useStore.getState = getState
  useStore.setState = setState
  useStore.subscribe = subscribe

  return useStore
}
