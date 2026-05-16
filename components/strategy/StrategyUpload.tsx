"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { IconUpload, IconFileText, IconCode, IconCloud, IconLock } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { StrategyAsset } from "@/lib/useScheduleDB";
import { uploadStrategyPdf } from "@/lib/strategyStorage";
import { useAuth } from "@/contexts/AuthProvider";
import { haptic } from "@/lib/haptics";

interface StrategyUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (asset: Omit<StrategyAsset, "id" | "createdAt" | "updatedAt">, pdfBytes?: Uint8Array) => void;
}

export default function StrategyUpload({ isOpen, onClose, onSave }: StrategyUploadProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fileType, setFileType] = useState<"html" | "pdf" | null>(null);
  const [fileName, setFileName] = useState("");
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setTitle(""); setDescription(""); setFileType(null);
    setFileName(""); setHtmlContent(null); setPdfBytes(null);
    setError(""); setLoading(false); setSaving(false);
  }

  function handleClose() { reset(); onClose(); }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setLoading(true); setFileName(file.name);
    try {
      if (file.type === "text/html" || /\.(html|htm)$/i.test(file.name)) {
        setHtmlContent(await file.text());
        setPdfBytes(null);
        setFileType("html");
        if (!title) setTitle(file.name.replace(/\.(html|htm)$/i, ""));
      } else if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        const buf = await file.arrayBuffer();
        setPdfBytes(new Uint8Array(buf));
        setHtmlContent(null);
        setFileType("pdf");
        if (!title) setTitle(file.name.replace(/\.pdf$/i, ""));
      } else {
        setError("Only HTML (.html) and PDF (.pdf) files are supported.");
        setFileName("");
      }
    } catch {
      setError("Failed to read file. Please try again.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSave() {
    if (!title.trim() || !fileType) return;
    haptic("medium");
    setSaving(true);
    setError("");

    try {
      const base: Omit<StrategyAsset, "id" | "createdAt" | "updatedAt"> = {
        type: fileType,
        title: title.trim(),
        description: description.trim() || undefined,
      };

      if (fileType === "html") {
        onSave({ ...base, htmlContent: htmlContent ?? "" });
      } else if (fileType === "pdf" && pdfBytes) {
        if (user) {
          // Authenticated: upload to Firebase Storage now — pdfUrl is set after
          // handleAddStrategy receives the asset ID, so we pass pdfBytes up and
          // let ScheduleApp do the upload once it has the ID.
          onSave(base, pdfBytes);
        } else {
          // Guest: fall back to local base64
          let binary = "";
          pdfBytes.forEach((b) => (binary += String.fromCharCode(b)));
          onSave({ ...base, pdfData: btoa(binary) });
        }
      }
      reset();
    } catch (err) {
      setError("Save failed. Please try again.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const hasFile = fileType === "html" ? !!htmlContent : !!pdfBytes;
  const canSave = !!title.trim() && !!fileType && hasFile && !loading && !saving;

  return (
    <BottomSheet open={isOpen} onClose={handleClose}>
      <div className="px-5 pt-2 pb-6 flex flex-col gap-5">
        <SheetHeader eyebrow="Strategy Space" title="Upload Strategy" onClose={handleClose} />

        {/* Drop zone */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => fileInputRef.current?.click()}
          className={`
            relative flex flex-col items-center gap-3 rounded-[20px] border-2 border-dashed px-6 py-8
            transition-colors duration-200
            ${hasFile
              ? "border-green-500/40 bg-green-500/[0.04]"
              : "border-neutral-200 bg-neutral-50 hover:border-neutral-300 dark:border-white/[0.12] dark:bg-white/[0.03]"
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm,.pdf,text/html,application/pdf"
            onChange={handleFile}
            className="hidden"
          />

          {hasFile ? (
            <>
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                fileType === "html" ? "bg-sky-500/15" : "bg-violet-500/15"
              }`}>
                {fileType === "html"
                  ? <IconCode size={24} className="text-sky-500" />
                  : <IconFileText size={24} className="text-violet-500" />}
              </div>
              <div className="text-center">
                <p className="text-[14px] font-semibold text-neutral-800 dark:text-white">{fileName}</p>
                <p className="mt-0.5 text-[12px] text-neutral-400">{fileType?.toUpperCase()} · Tap to change</p>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-200 dark:bg-white/[0.07]">
                <IconUpload size={22} className="text-neutral-500 dark:text-neutral-400" />
              </div>
              <div className="text-center">
                <p className="text-[14px] font-semibold text-neutral-700 dark:text-neutral-200">Choose a file</p>
                <p className="mt-0.5 text-[12px] text-neutral-400">HTML or PDF strategy document</p>
              </div>
            </>
          )}

          {(loading || saving) && (
            <div className="absolute inset-0 flex items-center justify-center rounded-[20px] bg-white/80 dark:bg-neutral-900/80">
              <span className="text-[13px] text-neutral-500">
                {saving ? "Uploading to cloud…" : "Reading file…"}
              </span>
            </div>
          )}
        </motion.button>

        {error && <p className="text-[13px] text-rose-500">{error}</p>}

        {/* Storage indicator for PDFs */}
        {fileType === "pdf" && hasFile && (
          <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-medium ${
            user
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-neutral-100 text-neutral-500 dark:bg-white/[0.05] dark:text-neutral-400"
          }`}>
            {user ? <IconCloud size={14} /> : <IconLock size={14} />}
            {user
              ? "PDF will be uploaded to Firebase Storage and sync across devices."
              : "Sign in to sync PDFs across devices. Stored locally for now."}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-[12px] font-semibold uppercase tracking-wider text-neutral-400">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Strategy title…" />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[12px] font-semibold uppercase tracking-wider text-neutral-400">
            Description <span className="normal-case text-neutral-300">(optional)</span>
          </label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description…" />
        </div>

        <Button fullWidth onClick={handleSave} disabled={!canSave}>
          {saving ? "Uploading…" : "Save Strategy"}
        </Button>
      </div>
    </BottomSheet>
  );
}
