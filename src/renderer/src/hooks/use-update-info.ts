import { createContext, useContext } from 'react'

interface UpdateInfo {
  version: string
  releaseTag?: string
  changelog: string
}

export const UpdateInfoContext = createContext<UpdateInfo | null>(null)
export const useUpdateInfo = (): UpdateInfo | null => useContext(UpdateInfoContext)
