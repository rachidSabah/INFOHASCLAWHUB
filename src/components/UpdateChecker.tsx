"use client";

import { useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Download, RefreshCw, GitCommit, ExternalLink } from "lucide-react";
import { checkForUpdates, applyUpdate } from "@/lib/updater";
import { useUpdateStore } from "@/lib/stores";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const CHECK_INTERVAL = 5 * 60 * 1000;

export function UpdateChecker() {
  const {
    updateAvailable,
    updateDialogOpen,
    currentCommit,
    latestCommit,
    commits,
    checking,
    applying,
    updateApplied,
    setUpdateState,
  } = useUpdateStore();

  const checkingRef = useRef(false);

  const performCheck = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setUpdateState({ checking: true });

    try {
      const info = await checkForUpdates();
      if (info.hasUpdate) {
        setUpdateState({
          updateAvailable: true,
          currentCommit: info.currentCommit || "",
          latestCommit: info.latestCommit || "",
          commits: info.commits || [],
        });
      }
    } catch {
      // silent fail
    } finally {
      checkingRef.current = false;
      setUpdateState({ checking: false });
    }
  }, [setUpdateState]);

  useEffect(() => {
    performCheck();
    const interval = setInterval(performCheck, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [performCheck]);

  useEffect(() => {
    if (updateAvailable) {
      toast("Update Available", {
        description: `${commits.length} new commit(s) from GitHub. Click the update icon in the top bar to review.`,
        action: {
          label: "Review",
          onClick: () => setUpdateState({ updateDialogOpen: true }),
        },
        duration: 10000,
      });
    }
  }, [updateAvailable, commits.length, setUpdateState]);

  const handleApplyUpdate = async () => {
    setUpdateState({ applying: true });
    try {
      const result = await applyUpdate();
      if (result.success) {
        setUpdateState({ updateApplied: true, updateAvailable: false, applying: false });
        toast.success("Update applied! Please restart the application.");
        // Re-check to verify update was applied
        setTimeout(async () => {
          const info = await checkForUpdates();
          if (!info.hasUpdate) {
            setUpdateState({ updateAvailable: false, updateDialogOpen: false });
          }
        }, 2000);
      } else {
        setUpdateState({ applying: false });
        toast.error(result.message || "Update failed");
      }
    } catch {
      setUpdateState({ applying: false });
      toast.error("Update failed");
    }
  };

  const handleRestart = () => {
    window.location.reload();
  };

  return (
    <Dialog
      open={updateDialogOpen}
      onOpenChange={(open) => setUpdateState({ updateDialogOpen: open })}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCommit className="h-5 w-5" />
            {updateApplied ? "Update Applied" : "Software Update"}
          </DialogTitle>
          <DialogDescription>
            {updateApplied
              ? "The update has been installed. Please restart to apply changes."
              : "New commits are available from the repository."}
          </DialogDescription>
        </DialogHeader>

        {!updateApplied && (
          <>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <span className="text-muted-foreground">Current</span>
                <code className="font-mono text-xs">{currentCommit || "..."}</code>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <span className="text-muted-foreground">Latest</span>
                <code className="font-mono text-xs text-primary">{latestCommit || "..."}</code>
              </div>
            </div>

            {commits.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  New Commits
                </p>
                {commits.map((c) => (
                  <div
                    key={c.sha}
                    className="flex items-start gap-2 rounded-md bg-muted/30 px-2.5 py-1.5"
                  >
                    <code className="font-mono text-[10px] text-primary mt-0.5 shrink-0">
                      {c.sha}
                    </code>
                    <span className="text-xs leading-tight">{c.message}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <DialogFooter className="gap-2">
          <a
            href="https://github.com/rachidSabah/INFOHASCLAWHUB/commits/main"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            View on GitHub
          </a>

          {updateApplied ? (
            <button
              onClick={handleRestart}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Restart Now
            </button>
          ) : (
            <button
              onClick={handleApplyUpdate}
              disabled={applying}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                applying
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {applying ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Update Now
                </>
              )}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
