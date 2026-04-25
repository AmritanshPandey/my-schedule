export interface ScheduleEntry {
  time: string;
  task: string;
}

interface ScheduleItemProps {
  entry: ScheduleEntry;
}

export default function ScheduleItem({ entry }: ScheduleItemProps) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-gray-800/60 transition-colors duration-150">
      <span className="w-20 shrink-0 text-sm font-mono text-indigo-400">
        {entry.time}
      </span>
      <span className="text-sm text-gray-200">{entry.task}</span>
    </div>
  );
}
