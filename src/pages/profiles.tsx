import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useLockFn } from "ahooks";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useTranslation } from "react-i18next";
import {
  importProfile,
  enhanceProfiles,
  deleteProfile,
  updateProfile,
  reorderProfile,
  createProfile,
} from "@/services/cmds";
import { useSetLoadingCache } from "@/services/states";
import { closeAllConnections } from "@/services/api";
import { DialogRef } from "@/components/base";
import {
  ProfileViewer,
  ProfileViewerRef,
} from "@/components/profile/profile-viewer";
import { ProfileItem } from "@/components/profile/profile-item";
import { useProfiles } from "@/hooks/use-profiles";
import { ConfigViewer } from "@/components/setting/mods/config-viewer";
import { throttle } from "lodash-es";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { useLocation } from "react-router-dom";
import { useListen } from "@/hooks/use-listen";
import { listen, TauriEvent } from "@tauri-apps/api/event";
import { showNotice } from "@/services/noticeService";
import { cn } from "@root/lib/utils";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { PlusCircle, RefreshCw, Zap, FileText, Loader2 } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";

const ProfilePage = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { addListener } = useListen();
  const [url, setUrl] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [activatings, setActivatings] = useState<string[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [updateAllLoading, setUpdateAllLoading] = useState(false);
  const [enhanceLoading, setEnhanceLoading] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const currentScroller = scrollerRef.current;
    if (!currentScroller) return;
    const handleScroll = () => setIsScrolled(currentScroller.scrollTop > 5);
    currentScroller.addEventListener("scroll", handleScroll);
    return () => currentScroller.removeEventListener("scroll", handleScroll);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  let currentProfileFromLocation: string | undefined;
  if (
    location.state &&
    typeof location.state === "object" &&
    location.state !== null
  ) {
    const stateAsObject = location.state as { current?: unknown };
    if (typeof stateAsObject.current === "string") {
      currentProfileFromLocation = stateAsObject.current;
    }
  }

  const profilesHookData = useProfiles();
  const profiles = profilesHookData.profiles || {};
  const activateSelected = profilesHookData.activateSelected;
  const patchProfiles = profilesHookData.patchProfiles;
  const mutateProfiles = profilesHookData.mutateProfiles;

  const viewerRef = useRef<ProfileViewerRef>(null);
  const configRef = useRef<DialogRef>(null);

  const profileItems = useMemo(() => {
    const items =
      profiles && Array.isArray(profiles.items) ? profiles.items : [];
    const type1 = ["local", "remote"];
    return items.filter((i) => i && type1.includes(i.type!));
  }, [profiles]);

  const currentActivatings = () => {
    const currentProfileValue =
      profiles && typeof profiles.current === "string" ? profiles.current : "";
    return [...new Set([currentProfileValue])].filter(Boolean);
  };

  useEffect(() => {
    const handleFileDrop = async () => {
      const unlisten = await addListener(
        TauriEvent.DRAG_DROP,
        async (event: any) => {
          const paths = event.payload.paths;
          for (let file of paths) {
            if (!file.endsWith(".yaml") && !file.endsWith(".yml")) {
              showNotice("error", t("Only YAML Files Supported"));
              continue;
            }
            const item = {
              type: "local",
              name: file.split(/\\|\//).pop() ?? "New Profile",
              desc: "",
              url: "",
              option: { with_proxy: false, self_proxy: false },
            } as IProfileItem;
            let data = await readTextFile(file);
            await createProfile(item, data);
            await mutateProfiles();
          }
        },
      );
      return unlisten;
    };
    const unsubscribe = handleFileDrop();
    return () => {
      unsubscribe.then((cleanup) => cleanup());
    };
  }, [addListener, mutateProfiles, t]);

  const activateProfile = useCallback(
    async (profile: string, notifySuccess: boolean) => {
      const reset = setTimeout(
        () => setActivatings((prev) => [...prev, profile]),
        100,
      );
      try {
        const success = await patchProfiles({ current: profile });
        closeAllConnections();
        await activateSelected();
        if (notifySuccess && success) {
          showNotice("success", t("Profile Switched"), 1000);
        }
      } catch (err: any) {
        showNotice("error", err?.message || err.toString(), 4000);
      } finally {
        clearTimeout(reset);
        setActivatings([]);
      }
    },
    [patchProfiles, activateSelected, t],
  );

  useEffect(() => {
    (async () => {
      if (currentProfileFromLocation) {
        await activateProfile(currentProfileFromLocation, false);
      }
    })();
  }, [currentProfileFromLocation]);

  const onSelect = useLockFn(
    async (selectedProfileId: string, force: boolean) => {
      if (!force && selectedProfileId === profiles.current) return;
      await activateProfile(selectedProfileId, true);
    },
  );

  const onImport = useLockFn(async () => {
    if (!url) return;
    setImportLoading(true);
    setDisabled(true);

    try {
      await importProfile(url);
      showNotice("success", t("Profile Imported Successfully"));
      setUrl("");
      mutateProfiles();
      await onEnhance(false, false);
    } catch (err: any) {
      showNotice("info", t("Import failed, retrying with Clash proxy..."));
      try {
        await importProfile(url, { with_proxy: false, self_proxy: true });
        showNotice("success", t("Profile Imported with Clash proxy"));
        setUrl("");
        mutateProfiles();
        await onEnhance(false, false);
      } catch (retryErr: any) {
        const retryErrmsg = retryErr?.message || retryErr.toString();
        showNotice(
          "error",
          `${t("Import failed even with Clash proxy")}: ${retryErrmsg}`,
        );
      }
    } finally {
      setDisabled(false);
      setImportLoading(false);
    }
  });

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      await reorderProfile(active.id.toString(), over.id.toString());
      mutateProfiles();
    }
  };

  const onEnhance = useLockFn(
    async (notifySuccess: boolean = true, showLoading: boolean = true) => {
      if (showLoading) setEnhanceLoading(true);
      setActivatings(currentActivatings());
      try {
        await enhanceProfiles();
        if (notifySuccess) {
          showNotice("success", t("Profile Reactivated"), 1000);
        }
      } catch (err: any) {
        showNotice("error", err.message || err.toString(), 3000);
      } finally {
        setActivatings([]);
        if (showLoading) setEnhanceLoading(false);
      }
    },
  );

  const onDelete = useLockFn(async (uid: string) => {
    const currentProfile = profiles.current === uid;
    try {
      setActivatings([...(currentProfile ? currentActivatings() : []), uid]);
      await deleteProfile(uid);
      mutateProfiles();
      if (currentProfile) await onEnhance(false, false);
    } catch (err: any) {
      showNotice("error", err?.message || err.toString());
    } finally {
      setActivatings([]);
    }
  });

  const setLoadingCache = useSetLoadingCache();
  const onUpdateAll = useLockFn(async () => {
    setUpdateAllLoading(true);
    const throttleMutate = throttle(mutateProfiles, 2000, { trailing: true });
    const updateOne = async (uid: string) => {
      try {
        await updateProfile(uid);
        throttleMutate();
      } catch (err: any) {
        console.error(`Update subscription ${uid} failed:`, err);
      } finally {
        setLoadingCache((cache) => ({ ...cache, [uid]: false }));
      }
    };

    return new Promise((resolve) => {
      setLoadingCache((cache) => {
        const items = profileItems.filter(
          (e) => e.type === "remote" && !cache[e.uid],
        );
        const change = Object.fromEntries(items.map((e) => [e.uid, true]));
        Promise.allSettled(items.map((e) => updateOne(e.uid))).then(resolve);
        return { ...cache, ...change };
      });
    }).finally(() => setUpdateAllLoading(false));
  });

  const onCopyLink = async () => {
    const text = await readText();
    if (text) setUrl(text);
  };

  useEffect(() => {
    let unlistenPromise: Promise<() => void> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const setupListener = async () => {
      const isTauriEnv =
        typeof window !== "undefined" &&
        ("__TAURI_INTERNALS__" in (window as any) ||
          "__TAURI__" in (window as any));
      if (!isTauriEnv) return;
      unlistenPromise = listen<string>("profile-changed", () => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          mutateProfiles();
          timeoutId = undefined;
        }, 300);
      });
    };
    setupListener();
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      unlistenPromise?.then((unlisten) => unlisten());
    };
  }, [mutateProfiles]);

  return (
    <div className="h-full w-full relative">
      <div
        className={cn(
          "absolute top-0 left-0 right-0 z-10 p-4 space-y-4 transition-all duration-200",
          { "bg-background/80 backdrop-blur-sm shadow-sm": isScrolled },
        )}
      >
        <div className="flex justify-between items-center">
          <div className="w-10">
            <SidebarTrigger />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {t("Profiles")}
          </h2>
          <TooltipProvider delayDuration={100}>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => viewerRef.current?.create()}
                  >
                    <PlusCircle className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("New")}</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onUpdateAll}
                    disabled={updateAllLoading}
                  >
                    {updateAllLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-5 w-5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("Update All Profiles")}</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEnhance(true, true)}
                    disabled={enhanceLoading}
                  >
                    {enhanceLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Zap className="h-5 w-5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("Reactivate Profiles")}</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => configRef.current?.open()}
                  >
                    <FileText className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("View Runtime Config")}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="absolute top-0 left-0 right-0 bottom-0 pt-25 overflow-y-auto"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <div className="p-4 pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              <SortableContext items={profileItems.map((x) => x.uid)}>
                {profileItems.map((item) => (
                  <ProfileItem
                    key={item.uid}
                    id={item.uid}
                    selected={profiles.current === item.uid}
                    activating={activatings.includes(item.uid)}
                    itemData={item}
                    onSelect={(f) => onSelect(item.uid, f)}
                    onEdit={() => viewerRef.current?.edit(item)}
                    onSave={async (prev, curr) => {
                      if (prev !== curr && profiles.current === item.uid) {
                        await onEnhance(false, false);
                      }
                    }}
                    onDelete={() => onDelete(item.uid)}
                  />
                ))}
              </SortableContext>
            </div>
          </div>
        </DndContext>
      </div>

      <ProfileViewer
        ref={viewerRef}
        onChange={async (isActivating) => {
          mutateProfiles();
          if (isActivating) {
            await onEnhance(false, false);
          }
        }}
      />
      <ConfigViewer ref={configRef} />
    </div>
  );
};

export default ProfilePage;
