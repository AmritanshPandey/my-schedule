"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconBrain,
  IconCode,
  IconFileText,
  IconPlus,
  IconTrash,
  IconCalendar,
} from "@tabler/icons-react";
import type { StrategyAsset } from "@/lib/useScheduleDB";
import StrategyViewer from "./StrategyViewer";
import StrategyUpload from "./StrategyUpload";
import { haptic } from "@/lib/haptics";

interface StrategySpaceProps {
  strategies: StrategyAsset[];
  uploadOpen: boolean;
  onUploadOpen: () => void;
  onUploadClose: () => void;
  onAdd: (asset: Omit<StrategyAsset, "id" | "createdAt" | "updatedAt">, pdfBytes?: Uint8Array) => void;
  onDelete: (id: string) => void;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function StrategySpace({ strategies, uploadOpen, onUploadOpen, onUploadClose, onAdd, onDelete }: StrategySpaceProps) {
  const [viewingAsset, setViewingAsset] = useState<StrategyAsset | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  function handleDelete(id: string) {
    if (deleteConfirm === id) {
      haptic("medium");
      onDelete(id);
      setDeleteConfirm(null);
    } else {
      haptic("light");
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-32 pt-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <IconBrain size={18} className="text-neutral-400" strokeWidth={1.8} />
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-400">
                Intelligence Layer
              </span>
            </div>
            <h1 className="text-[28px] font-bold text-neutral-900 dark:text-white leading-tight">
              Strategy Space
            </h1>
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => { haptic("medium"); onUploadOpen(); }}
            className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
          >
            <IconPlus size={20} strokeWidth={2.2} />
          </motion.button>
        </div>

        {/* Empty state */}
        {strategies.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 pt-16 text-center"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-neutral-100 dark:bg-white/[0.06]">
              <IconBrain size={36} strokeWidth={1.4} className="text-neutral-400 dark:text-neutral-500" />
            </div>
            <div>
              <p className="text-[16px] font-semibold text-neutral-700 dark:text-neutral-200">
                Your strategies live here
              </p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-neutral-400 max-w-[260px]">
                Upload HTML frameworks, PDF playbooks, and visual systems. Experience them as immersive reading sessions.
              </p>
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => { haptic("medium"); onUploadOpen(); }}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-[14px] font-semibold text-white dark:bg-white dark:text-neutral-950"
            >
              <IconPlus size={16} strokeWidth={2.5} />
              Upload First Strategy
            </motion.button>
          </motion.div>
        )}

        {/* Strategy list */}
        <AnimatePresence initial={false}>
          {strategies.map((asset, i) => (
            <motion.div
              key={asset.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ delay: i * 0.04, duration: 0.22 }}
              className="mb-3"
            >
              <div
                className={`
                  relative overflow-hidden rounded-[22px] border
                  bg-white dark:bg-neutral-900
                  border-neutral-200/80 dark:border-white/[0.08]
                  transition-all duration-150 active:scale-[0.99]
                `}
              >
                <div
                  role="button"
                  tabIndex={0}
                  className="w-full text-left px-5 py-4 cursor-pointer"
                  onClick={() => { haptic("light"); setViewingAsset(asset); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { haptic("light"); setViewingAsset(asset); } }}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.07]">
                      {asset.type === "html"
                        ? <IconCode size={18} className="text-neutral-500 dark:text-neutral-400" />
                        : <IconFileText size={18} className="text-neutral-500 dark:text-neutral-400" />
                      }
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                          {asset.type}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[16px] font-semibold text-neutral-900 dark:text-white leading-snug">
                        {asset.title}
                      </p>
                      {asset.description && (
                        <p className="mt-0.5 text-[13px] text-neutral-400 line-clamp-2">
                          {asset.description}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-neutral-400">
                        <IconCalendar size={11} strokeWidth={2} />
                        {formatDate(asset.createdAt)}
                      </div>
                    </div>

                    {/* Delete */}
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.85 }}
                      onClick={(e) => { e.stopPropagation(); handleDelete(asset.id); }}
                      className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                        deleteConfirm === asset.id
                          ? "bg-rose-500/15 text-rose-500"
                          : "text-neutral-300 dark:text-neutral-600 hover:text-rose-400"
                      }`}
                    >
                      <IconTrash size={15} strokeWidth={2} />
                    </motion.button>
                  </div>
                </div>

                {deleteConfirm === asset.id && (
                  <div className="px-5 pb-4 pt-0">
                    <p className="text-[12px] text-rose-500 font-medium">Tap delete again to confirm.</p>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Upload sheet */}
      <StrategyUpload
        isOpen={uploadOpen}
        onClose={onUploadClose}
        onSave={(data, pdfBytes) => {
          onAdd(data, pdfBytes);
          onUploadClose();
        }}
      />

      {/* Viewer */}
      <StrategyViewer
        asset={viewingAsset}
        onClose={() => setViewingAsset(null)}
      />
    </>
  );
}
