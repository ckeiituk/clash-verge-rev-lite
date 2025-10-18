import useSWR from "swr";
import { useEffect, useRef } from "react";
import { UpdateViewer } from "../setting/mods/update-viewer";
import { DialogRef } from "../base";
import { useVerge } from "@/hooks/use-verge";
import { Button } from "@/components/ui/button";
import { t } from "i18next";
import { Download } from "lucide-react";
import { useSidebar } from "../ui/sidebar";
import { safeCheckForUpdate } from "@/services/update-check";

interface Props {
  className?: string;
}

export const UpdateButton = (props: Props) => {
  const { className } = props;
  const { verge } = useVerge();
  const { auto_check_update } = verge || {};
  const { state: sidebarState } = useSidebar();

  const viewerRef = useRef<DialogRef>(null);

  const { data: updateInfo } = useSWR(
    auto_check_update || auto_check_update === null ? "checkUpdate" : null,
    safeCheckForUpdate,
    {
      errorRetryCount: 2,
      revalidateIfStale: false,
      focusThrottleInterval: 36e5, // 1 hour
    },
  );

  useEffect(() => {
    const handleOpen = () => {
      viewerRef.current?.open();
    };

    window.addEventListener("outclash:open-update-viewer", handleOpen);
    return () => {
      window.removeEventListener("outclash:open-update-viewer", handleOpen);
    };
  }, []);

  if (!updateInfo?.available) return null;

  return (
    <>
      <UpdateViewer ref={viewerRef} />
      {sidebarState === "collapsed" ? (
        <Button
          variant="outline"
          size="icon"
          className={className}
          onClick={() => viewerRef.current?.open()}
        >
          <Download />
        </Button>
      ) : (
        <Button
          variant="outline"
          size="lg"
          className={className}
          onClick={() => viewerRef.current?.open()}
        >
          <Download />
          {t("New update")}
        </Button>
      )}
    </>
  );
};
