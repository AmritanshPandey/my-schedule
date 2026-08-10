"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { IconBell, IconBellOff, IconChevronDown, IconClock } from "@tabler/icons-react";
import { haptic } from "@/lib/haptics";
import {
  getReminderSettings,
  setReminderSettings,
  notificationSupport,
  requestNotificationPermission,
  type NotificationSupport,
  type ReminderSettings,
} from "@/lib/reminders";
import { formatDisplayTime, minutesToInputTime } from "@/lib/timeUtils";
import { SETTINGS_CONTROL_CLASS } from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthProvider";
import { subscribeToPush, unsubscribeFromPush, isPushSupported } from "@/lib/push/webPush";
import { savePushConfig, savePushSubscription, removePushSubscription } from "@/lib/push/pushConfig";

const NUDGE_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const value = minutesToInputTime((16 * 60) + i * 30); // 16:00 → 21:30
  return { value, label: formatDisplayTime(value) };
});

function Toggle({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => { haptic("light"); onChange(!on); }}
      className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-200 ${
        on ? "bg-[#00A63E]" : "bg-neutral-200 dark:bg-white/[0.12]"
      }`}
    >
      <span
        className={`absolute top-[3px] h-5 w-5 rounded-full bg-white transition-[left] duration-200 ${
          on ? "left-[21px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}

function SubRow({
  label,
  description,
  on,
  onChange,
}: {
  label: string;
  description?: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">{label}</p>
        {description && (
          <p className="mt-0.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">{description}</p>
        )}
      </div>
      <Toggle on={on} onChange={onChange} label={label} />
    </div>
  );
}

/**
 * "Reminders" card content for both settings surfaces. Handles the permission
 * dance and the per-device reminder settings. Copy is honest about scope:
 * reminders fire while PlanR is open — there is no push backend yet.
 */
export default function RemindersRows() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [support, setSupport] = useState<NotificationSupport>("unsupported");
  // Background delivery needs a public VAPID key AND a signed-in user (the server
  // reads the subscription from that user's Firestore). Without both, reminders
  // stay foreground-only and the copy says so.
  const backgroundCapable = isPushSupported() && !!uid;

  useEffect(() => {
    setSettings(getReminderSettings());
    setSupport(notificationSupport());
  }, []);

  // Every settings write mirrors into Firestore so the scheduled Cloud Function
  // knows what to send. No-op for guests / unconfigured Firebase.
  const patch = useCallback((p: Partial<ReminderSettings>) => {
    const next = setReminderSettings(p);
    setSettings(next);
    void savePushConfig(uid, next);
  }, [uid]);

  const handleMainToggle = useCallback(async (next: boolean) => {
    if (!next) {
      patch({ enabled: false });
      try {
        const removed = await unsubscribeFromPush();
        if (removed) void removePushSubscription(uid, removed);
      } catch {
        // best-effort teardown; the server prunes dead subscriptions anyway
      }
      return;
    }
    const perm = support === "granted" ? "granted" : await requestNotificationPermission();
    setSupport(perm);
    patch({ enabled: perm === "granted" });
    if (perm === "granted") {
      try {
        const sub = await subscribeToPush();
        if (sub) void savePushSubscription(uid, sub);
      } catch {
        // push subscription can fail (e.g. no VAPID key yet) — foreground still works
      }
    }
  }, [support, patch, uid]);

  if (!settings) return null;

  if (support === "unsupported") {
    return (
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-50 text-neutral-400 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-neutral-500">
          <IconBellOff size={14} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">Reminders</p>
          <p className="mt-0.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
            Notifications aren&apos;t available in this browser. On iPhone, add PlanR to your Home Screen first.
          </p>
        </div>
      </div>
    );
  }

  const enabled = settings.enabled && support === "granted";

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-50 text-neutral-500 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-neutral-300">
          <IconBell size={14} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">Reminders</p>
          <p className="mt-0.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
            {backgroundCapable
              ? "At your task and routine times — even when PlanR is closed"
              : "At your task and routine times, while PlanR is open"}
          </p>
        </div>
        <Toggle on={enabled} onChange={(v) => void handleMainToggle(v)} label="Reminders" />
      </div>

      {support === "denied" && (
        <p className="mt-2 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
          Notifications are blocked for PlanR — allow them in your browser settings, then try again.
        </p>
      )}

      <AnimatePresence initial={false}>
        {enabled && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 divide-y divide-neutral-100 border-t border-neutral-100 dark:divide-white/[0.05] dark:border-white/[0.05]">
              <SubRow
                label="Task start times"
                on={settings.tasks}
                onChange={(v) => patch({ tasks: v })}
              />
              <SubRow
                label="Routine times"
                on={settings.rituals}
                onChange={(v) => patch({ rituals: v })}
              />
              <SubRow
                label="Evening nudge"
                description="One heads-up if tasks are still open"
                on={settings.streakNudge}
                onChange={(v) => patch({ streakNudge: v })}
              />
              {settings.streakNudge && (
                <div className="flex items-center gap-3 py-2.5">
                  <p className="min-w-0 flex-1 text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">
                    Nudge time
                  </p>
                  <div className="relative">
                    <select
                      aria-label="Nudge time"
                      value={settings.nudgeTime}
                      onChange={(e) => patch({ nudgeTime: e.target.value })}
                      className={`${SETTINGS_CONTROL_CLASS} pr-9 appearance-none`}
                    >
                      {NUDGE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <IconClock size={14} strokeWidth={2} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                   </div>
                 </div>
               )}
             </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
