"use client";

import { useState } from "react";
import SectionCard from "@/components/SectionCard";
import PlanCard from "@/components/PlanCard";
import Tabs from "@/components/Tabs";
import { ScheduleEntry } from "@/components/ScheduleItem";
import { useScheduleDB, DAYS, DAY_LABELS, DayKey, Plan, SummaryConfig } from "@/lib/useScheduleDB";
import { SECTION_ICONS } from "@/components/SectionIcons";
import { IconActivity, IconChecklist, IconPlus } from "@tabler/icons-react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";

function SortablePlanCard({
  plan,
  onUpdatePlan,
  onDeletePlan,
  onReorderItems,
  onAdd,
  onEdit,
  onDelete,
}: {
  plan: Plan;
  onUpdatePlan: (planId: string, updates: { title: string; emoji: string; metaFields: string[] }) => void;
  onDeletePlan: (planId: string) => void;
  onReorderItems: (planId: string, activeId: string, overId: string) => void;
  onAdd: (entry: Omit<ScheduleEntry, "id">) => void;
  onEdit: (itemId: string, updated: Omit<ScheduleEntry, "id">) => void;
  onDelete: (itemId: string) => void;
}) {
  const { attributes, listeners, setNodeRef } = useSortable({ id: plan.id });

  return (
    <div ref={setNodeRef}>
      <PlanCard
        id={plan.id}
        title={plan.title}
        emoji={plan.emoji}
        items={plan.items}
        metaFields={plan.metaFields ?? []}
        summary={plan.summary}
        onUpdatePlan={onUpdatePlan}
        onDeletePlan={onDeletePlan}
        onReorderItems={(activeId, overId) => onReorderItems(plan.id, activeId, overId)}
        onAdd={onAdd}
        onEdit={onEdit}
        onDelete={onDelete}
        dragHandleProps={{
          attributes: attributes as unknown as Record<string, unknown>,
          listeners: (listeners ?? {}) as Record<string, unknown>,
        }}
      />
    </div>
  );
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const JS_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const todayKey: DayKey = JS_DAYS[new Date().getDay()];

const TODAY = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

function inferUnit(label: string): string {
  const key = label.toLowerCase();
  if (key.includes("calorie")) return "kcal";
  if (key.includes("protein") || key.includes("carb") || key.includes("fat")) return "g";
  if (key.includes("duration") || key.includes("time")) return "min";
  return "";
}

function inferBadgeClass(index: number): string {
  const cycle = [
    "bg-cyan-400/10 text-cyan-400 border-cyan-400/30",
    "bg-lime-400/10 text-lime-400 border-lime-400/30",
    "bg-amber-400/10 text-amber-400 border-amber-400/30",
  ];
  return cycle[index % cycle.length];
}

function createSummaryFromMeta(metaFields: string[]): SummaryConfig[] {
  return metaFields.slice(0, 3).map((field, index) => ({
    label: field,
    metaKey: field,
    unit: inferUnit(field),
    colorClass: inferBadgeClass(index),
  }));
}

export default function ScheduleApp() {
  const { schedule, setSchedule, ready } = useScheduleDB();
  const [activeDay, setActiveDay] = useState<DayKey>(todayKey);

  const [addingSection, setAddingSection] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newIconName, setNewIconName] = useState("briefcase");

  const [addingPlan, setAddingPlan] = useState(false);
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [newPlanEmoji, setNewPlanEmoji] = useState("🧠");
  const [newPlanMetaFields, setNewPlanMetaFields] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleAddSection() {
    const title = newTitle.trim();
    if (!title) return;
    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [activeDay]: [
          ...prev.activities[activeDay],
          { id: uid(), title, iconName: newIconName, items: [] },
        ],
      },
    }));
    setNewTitle("");
    setNewIconName("briefcase");
    setAddingSection(false);
  }

  function handleDeleteSection(sectionId: string) {
    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [activeDay]: prev.activities[activeDay].filter((s) => s.id !== sectionId),
      },
    }));
  }

  function handleEditSection(sectionId: string, updated: { title: string; iconName: string }) {
    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [activeDay]: prev.activities[activeDay].map((s) =>
          s.id === sectionId ? { ...s, title: updated.title, iconName: updated.iconName } : s
        ),
      },
    }));
  }

  function handleAddItem(sectionId: string, entry: Omit<ScheduleEntry, "id">) {
    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [activeDay]: prev.activities[activeDay].map((s) =>
          s.id === sectionId
            ? { ...s, items: [...s.items, { ...entry, id: uid() }] }
            : s
        ),
      },
    }));
  }

  function handleEditItem(sectionId: string, id: string, updated: Omit<ScheduleEntry, "id">) {
    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [activeDay]: prev.activities[activeDay].map((s) =>
          s.id === sectionId
            ? { ...s, items: s.items.map((item) => item.id === id ? { ...item, ...updated } : item) }
            : s
        ),
      },
    }));
  }

  function handleDeleteItem(sectionId: string, id: string) {
    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [activeDay]: prev.activities[activeDay].map((s) =>
          s.id === sectionId
            ? { ...s, items: s.items.filter((item) => item.id !== id) }
            : s
        ),
      },
    }));
  }

  function handleAddPlan() {
    const title = newPlanTitle.trim();
    if (!title) return;

    const metaFields = newPlanMetaFields
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);

    const plan: Plan = {
      id: uid(),
      title,
      emoji: newPlanEmoji.trim() || "🧠",
      items: [],
      metaFields,
      summary: createSummaryFromMeta(metaFields),
    };

    setSchedule((prev) => ({
      ...prev,
      plans: [...prev.plans, plan],
    }));

    setNewPlanTitle("");
    setNewPlanEmoji("🧠");
    setNewPlanMetaFields("");
    setAddingPlan(false);
  }

  function handleUpdatePlan(planId: string, updates: { title: string; emoji: string; metaFields: string[] }) {
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.map((plan) =>
        plan.id === planId
          ? {
              ...plan,
              title: updates.title,
              emoji: updates.emoji,
              metaFields: updates.metaFields,
              summary: createSummaryFromMeta(updates.metaFields),
            }
          : plan
      ),
    }));
  }

  function handleDeletePlan(planId: string) {
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.filter((plan) => plan.id !== planId),
    }));
  }

  function handlePlanAdd(planId: string, entry: Omit<ScheduleEntry, "id">) {
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.map((plan) =>
        plan.id === planId
          ? { ...plan, items: [...plan.items, { ...entry, id: uid() }] }
          : plan
      ),
    }));
  }

  function handlePlanEdit(planId: string, itemId: string, updated: Omit<ScheduleEntry, "id">) {
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.map((plan) =>
        plan.id === planId
          ? { ...plan, items: plan.items.map((item) => item.id === itemId ? { ...item, ...updated } : item) }
          : plan
      ),
    }));
  }

  function handlePlanDelete(planId: string, itemId: string) {
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.map((plan) =>
        plan.id === planId
          ? { ...plan, items: plan.items.filter((item) => item.id !== itemId) }
          : plan
      ),
    }));
  }

  function handleReorderPlans(activeId: string, overId: string) {
    setSchedule((prev) => {
      const oldIndex = prev.plans.findIndex((p) => p.id === activeId);
      const newIndex = prev.plans.findIndex((p) => p.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return { ...prev, plans: arrayMove(prev.plans, oldIndex, newIndex) };
    });
  }

  function handleReorderPlanItems(planId: string, activeId: string, overId: string) {
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.map((plan) => {
        if (plan.id !== planId) return plan;
        const oldIndex = plan.items.findIndex((i) => i.id === activeId);
        const newIndex = plan.items.findIndex((i) => i.id === overId);
        if (oldIndex === -1 || newIndex === -1) return plan;
        return { ...plan, items: arrayMove(plan.items, oldIndex, newIndex) };
      }),
    }));
  }

  function handlePlansDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    handleReorderPlans(String(active.id), String(over.id));
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
      </main>
    );
  }

  const daySections = schedule.activities[activeDay];

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
        <header className="mb-6 space-y-2">
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-widest">{TODAY}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Daily Planner</h1>
          <p className="text-sm text-neutral-400">Structure your day with clarity and focus.</p>
        </header>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <Tabs
            tabs={[
              {
                label: "Day Activity",
                icon: <IconActivity size={18} />,
                content: (
                  <div className="space-y-6 pt-4">
                    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                      <p className="text-[11px] font-medium uppercase tracking-widest text-neutral-500 mb-3">Select Day</p>
                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                        {DAYS.map((day) => {
                          const isToday = day === todayKey;
                          const isActive = day === activeDay;
                          const dayClass = isActive
                            ? "bg-cyan-400/10 text-cyan-400 border-cyan-400/30"
                            : isToday
                              ? "bg-lime-400/10 text-lime-400 border-lime-400/30"
                              : "bg-neutral-900 text-neutral-500 border-neutral-800";
                          return (
                            <button
                              key={day}
                              onClick={() => setActiveDay(day)}
                              className={`h-10 rounded-md border text-sm font-medium ${dayClass}`}
                            >
                              {DAY_LABELS[day]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-6">
                      {daySections.length === 0 && !addingSection && (
                        <div className="text-center py-8 text-neutral-500 text-sm rounded-xl border border-dashed border-neutral-800">
                          No activities yet. Start by adding a section.
                        </div>
                      )}

                      {daySections.map((section) => (
                        <SectionCard
                          key={section.id}
                          title={section.title}
                          iconName={section.iconName}
                          items={section.items}
                          onAdd={(e) => handleAddItem(section.id, e)}
                          onEdit={(id, u) => handleEditItem(section.id, id, u)}
                          onDelete={(id) => handleDeleteItem(section.id, id)}
                          onEditSection={(updated) => handleEditSection(section.id, updated)}
                          onDeleteSection={() => handleDeleteSection(section.id)}
                        />
                      ))}

                      {addingSection ? (
                        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
                          <p className="text-xs font-medium text-neutral-400 uppercase tracking-widest">New Section</p>
                          <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-10 gap-2">
                            {SECTION_ICONS.map(({ name, label, icon: Icon }) => (
                              <button
                                key={name}
                                type="button"
                                title={label}
                                onClick={() => setNewIconName(name)}
                                className={`aspect-square h-10 flex items-center justify-center rounded-md border ${
                                  newIconName === name
                                    ? "bg-cyan-400/10 text-cyan-400 border-cyan-400/30"
                                    : "bg-neutral-900 text-neutral-500 border-neutral-800"
                                }`}
                              >
                                <Icon size={18} />
                              </button>
                            ))}
                          </div>
                          <input
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            placeholder="Section name"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddSection();
                              if (e.key === "Escape") {
                                setAddingSection(false);
                                setNewTitle("");
                                setNewIconName("briefcase");
                              }
                            }}
                            className="w-full h-10 rounded-md border border-neutral-800 bg-neutral-900 px-3 text-sm text-white focus:outline-none focus:border-cyan-400"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleAddSection}
                              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-md border border-cyan-400/30 bg-cyan-400/10 text-cyan-400 text-sm"
                            >
                              <IconChecklist size={16} />
                              Create Section
                            </button>
                            <button
                              onClick={() => {
                                setAddingSection(false);
                                setNewTitle("");
                                setNewIconName("briefcase");
                              }}
                              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-md border border-neutral-800 text-neutral-400 text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingSection(true)}
                          className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-md border border-dashed border-neutral-800 text-neutral-400 text-sm"
                        >
                          <IconPlus size={16} />
                          Add Section
                        </button>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                label: "Plan",
                icon: <IconChecklist size={18} />,
                content: (
                  <div className="space-y-6 pt-4">
                    {schedule.plans.length === 0 && !addingPlan && (
                      <div className="text-center py-8 text-neutral-500 text-sm rounded-xl border border-dashed border-neutral-800">
                        Start adding your plan.
                      </div>
                    )}

                    <DndContext sensors={sensors} onDragEnd={handlePlansDragEnd}>
                      <SortableContext items={schedule.plans.map((plan) => plan.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-6">
                          {schedule.plans.map((plan) => (
                            <SortablePlanCard
                              key={plan.id}
                              plan={plan}
                              onUpdatePlan={handleUpdatePlan}
                              onDeletePlan={handleDeletePlan}
                              onReorderItems={handleReorderPlanItems}
                              onAdd={(entry) => handlePlanAdd(plan.id, entry)}
                              onEdit={(itemId, updated) => handlePlanEdit(plan.id, itemId, updated)}
                              onDelete={(itemId) => handlePlanDelete(plan.id, itemId)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>

                    {addingPlan ? (
                      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
                        <p className="text-xs font-medium text-neutral-400 uppercase tracking-widest">New Plan</p>
                        <div className="flex gap-2">
                          <input
                            value={newPlanEmoji}
                            onChange={(e) => setNewPlanEmoji(e.target.value)}
                            placeholder="🧠"
                            maxLength={4}
                            className="h-10 w-14 rounded-md border border-neutral-800 bg-neutral-900 text-center text-white focus:outline-none focus:border-cyan-400"
                          />
                          <input
                            value={newPlanTitle}
                            onChange={(e) => setNewPlanTitle(e.target.value)}
                            placeholder="Plan name"
                            className="h-10 flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 text-sm text-white focus:outline-none focus:border-cyan-400"
                          />
                        </div>
                        <input
                          value={newPlanMetaFields}
                          onChange={(e) => setNewPlanMetaFields(e.target.value)}
                          placeholder="Meta fields (optional): Calories, Protein, Duration"
                          className="h-10 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-300 focus:outline-none focus:border-cyan-400"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleAddPlan}
                            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-md border border-cyan-400/30 bg-cyan-400/10 text-cyan-400 text-sm"
                          >
                            <IconPlus size={16} />
                            Create Plan
                          </button>
                          <button
                            onClick={() => {
                              setAddingPlan(false);
                              setNewPlanTitle("");
                              setNewPlanEmoji("🧠");
                              setNewPlanMetaFields("");
                            }}
                            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-md border border-neutral-800 text-neutral-400 text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingPlan(true)}
                        className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-md border border-dashed border-neutral-800 text-neutral-400 text-sm"
                      >
                        <IconPlus size={16} />
                        Add Plan
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>
    </main>
  );
}
