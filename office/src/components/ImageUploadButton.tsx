import { useState, useRef, useCallback, memo } from "react";
import { Camera, Check, Loader2, X } from "lucide-react";

interface Toast {
  message: string;
  type: "success" | "error";
}

export const ImageUploadButton = memo(function ImageUploadButton() {
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json() as { path?: string; error?: string };

      if (data.path) {
        // Copy path to clipboard
        try {
          await navigator.clipboard.writeText(data.path);
          showToast(`Copied: ${data.path.split("/").pop()}`, "success");
        } catch {
          showToast(`Uploaded: ${data.path}`, "success");
        }
      } else {
        showToast(data.error || "Upload failed", "error");
      }
    } catch {
      showToast("Upload failed", "error");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [showToast]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  return (
    <>
      {/* Hidden file input - accept images, allow camera on mobile */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="hidden"
      />

      {/* Floating upload button */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label="Upload screenshot"
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95 disabled:opacity-50"
        style={{
          background: "var(--color-accent-primary, #3b82f6)",
          color: "#fff",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        }}
      >
        {uploading ? (
          <Loader2 size={22} className="animate-spin" />
        ) : (
          <Camera size={22} />
        )}
      </button>

      {/* Toast notification */}
      {toast && (
        <div
          className="fixed bottom-24 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-mono shadow-lg animate-in slide-in-from-bottom-2 max-w-[320px]"
          style={{
            background: toast.type === "success" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
            border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            color: toast.type === "success" ? "#22c55e" : "#ef4444",
          }}
        >
          {toast.type === "success" ? <Check size={14} /> : <X size={14} />}
          <span className="truncate">{toast.message}</span>
        </div>
      )}
    </>
  );
});
