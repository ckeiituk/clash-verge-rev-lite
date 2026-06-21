!macro customInit
  ; --- Migration from old Tauri/Koala Clash app ---
  ; Skip entirely if migration was already completed (i.e. this is an update)

  ; Force current user context to resolve $APPDATA correctly
  ; (perMachine installers may default to all-users context)
  SetShellVarContext current

  IfFileExists "$APPDATA\OutClash\.migration-done" migration_skip 0

  ; Check if old profiles.yaml exists and back it up
  ; Priority: old Tauri OutClash > old Tauri Koala Clash
  ; Try Roaming AppData first, then Local AppData as fallback
  IfFileExists "$APPDATA\io.github.outclash\profiles.yaml" 0 check_outclash_local
    CopyFiles /SILENT "$APPDATA\io.github.outclash\profiles.yaml" "$TEMP\outclash-migration-profiles.yaml"
    Goto backup_done
  check_outclash_local:
  IfFileExists "$LOCALAPPDATA\io.github.outclash\profiles.yaml" 0 check_koala_appdata
    CopyFiles /SILENT "$LOCALAPPDATA\io.github.outclash\profiles.yaml" "$TEMP\outclash-migration-profiles.yaml"
    Goto backup_done
  check_koala_appdata:
  IfFileExists "$APPDATA\io.github.koala-clash\profiles.yaml" 0 check_koala_local
    CopyFiles /SILENT "$APPDATA\io.github.koala-clash\profiles.yaml" "$TEMP\outclash-migration-profiles.yaml"
    Goto backup_done
  check_koala_local:
  IfFileExists "$LOCALAPPDATA\io.github.koala-clash\profiles.yaml" 0 backup_done
    CopyFiles /SILENT "$LOCALAPPDATA\io.github.koala-clash\profiles.yaml" "$TEMP\outclash-migration-profiles.yaml"
  backup_done:

  ; --- Old Tauri OutClash (same productName/dir as the new app) ---
  ; electron-builder's built-in uninstallOldVersion does NOT remove it: it looks
  ; up a GUID derived from appId, but the Tauri build registered its uninstaller
  ; under the flat key ...\Uninstall\OutClash. Uninstall it here — IN-PLACE and
  ; BEFORE the new files are extracted — so it deletes the OLD files, not ours.
  ReadRegStr $1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\OutClash" "InstallLocation"
  StrCmp $1 "" 0 +2
    ReadRegStr $1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\OutClash" "InstallLocation"
  StrCmp $1 "" outclash_old_done 0
  ; strip the surrounding quotes Tauri writes around InstallLocation
  StrCpy $2 $1 1
  StrCmp $2 '"' 0 +2
    StrCpy $1 $1 "" 1
  StrCpy $2 $1 1 -1
  StrCmp $2 '"' 0 +2
    StrCpy $1 $1 -1
  IfFileExists "$1\uninstall.exe" 0 outclash_old_done
    ; _?= runs the uninstaller in place (no %TEMP% copy) so ExecWait really waits
    ExecWait '"$1\uninstall.exe" /S _?=$1'
  outclash_old_done:

  ; --- Old Koala Clash (different product name, needs manual lookup) ---
  IfFileExists "$PROGRAMFILES\Koala Clash\uninstall.exe" 0 check_koala_pf64
    ExecWait '"$PROGRAMFILES\Koala Clash\uninstall.exe" /S _?=$PROGRAMFILES\Koala Clash'
    Goto uninstall_done
  check_koala_pf64:
  IfFileExists "$PROGRAMFILES64\Koala Clash\uninstall.exe" 0 check_koala_registry
    ExecWait '"$PROGRAMFILES64\Koala Clash\uninstall.exe" /S _?=$PROGRAMFILES64\Koala Clash'
    Goto uninstall_done
  check_koala_registry:
    ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Koala Clash" "UninstallString"
    StrCmp $0 "" check_koala_registry_user run_koala_uninstaller
  check_koala_registry_user:
    ReadRegStr $0 HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Koala Clash" "UninstallString"
    StrCmp $0 "" uninstall_done run_koala_uninstaller
  run_koala_uninstaller:
    ExecWait '"$0" /S'

  uninstall_done:
  migration_skip:

  ; Restore context for the rest of the installer
  SetShellVarContext all
!macroend

!macro customInstall
  ; --- Copy migration file to new app data directory ---
  SetShellVarContext current
  IfFileExists "$TEMP\outclash-migration-profiles.yaml" 0 no_migration_file
    CreateDirectory "$APPDATA\OutClash"
    CopyFiles /SILENT "$TEMP\outclash-migration-profiles.yaml" "$APPDATA\OutClash\.migration-profiles.yaml"
    Delete "$TEMP\outclash-migration-profiles.yaml"
  no_migration_file:

  ; Old Tauri OutClash is now uninstalled in customInit (before extraction),
  ; so no post-extract fallback is needed here — it would have deleted the
  ; freshly-installed files since both share $PROGRAMFILES64\OutClash.

  SetShellVarContext all
!macroend
