import ScheduleItem, { ScheduleEntry } from "./ScheduleItem";

interface SectionCardProps {
  title: string;
  emoji: string;
  items: ScheduleEntry[];
}

export default function SectionCard({ title, emoji, items }: SectionCardProps) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
          <span>{emoji}</span>
          {title}
        </h2>
      </div>
      <div className="py-2">
        {items.map((item, index) => (
          <ScheduleItem key={index} entry={item} />
        ))}
      </div>
    </div>
  );
}
