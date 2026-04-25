import SectionCard from "@/components/SectionCard";
import { ScheduleEntry } from "@/components/ScheduleItem";

const dietPlan: ScheduleEntry[] = [
  { time: "7:00 AM", task: "Wake up & drink a glass of water" },
  { time: "7:30 AM", task: "Breakfast — oats with fruits" },
  { time: "10:30 AM", task: "Mid-morning snack — nuts & yogurt" },
  { time: "1:00 PM", task: "Lunch — grilled chicken with vegetables" },
  { time: "4:00 PM", task: "Afternoon snack — fruit salad" },
  { time: "7:30 PM", task: "Dinner — lentil soup with whole-grain bread" },
  { time: "9:30 PM", task: "Herbal tea before bed" },
];

const workPlan: ScheduleEntry[] = [
  { time: "8:00 AM", task: "Review daily goals & prioritize tasks" },
  { time: "9:00 AM", task: "Deep work session — project development" },
  { time: "11:00 AM", task: "Team stand-up meeting" },
  { time: "11:30 AM", task: "Code review & pull requests" },
  { time: "2:00 PM", task: "Deep work session — feature implementation" },
  { time: "4:30 PM", task: "Reply to emails & messages" },
  { time: "5:30 PM", task: "Wrap-up — plan tomorrow's tasks" },
];

const personalPlan: ScheduleEntry[] = [
  { time: "6:30 AM", task: "Morning stretching / light yoga" },
  { time: "6:00 PM", task: "Evening walk or workout (30 min)" },
  { time: "8:00 PM", task: "Reading or learning something new" },
  { time: "9:00 PM", task: "Family / social time" },
  { time: "10:00 PM", task: "Journal — reflect on the day" },
  { time: "10:30 PM", task: "Wind down — no screens" },
  { time: "11:00 PM", task: "Sleep" },
];

export default function Home() {
  return (
    <main className="max-w-3xl mx-auto p-4 py-10 w-full">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Daily Planner
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Your structured day — diet, work, and personal goals.
        </p>
      </header>

      <div className="space-y-6">
        <SectionCard title="Diet Plan" emoji="🥗" items={dietPlan} />
        <SectionCard title="Work Plan" emoji="💼" items={workPlan} />
        <SectionCard title="Personal Plan" emoji="🌱" items={personalPlan} />
      </div>
    </main>
  );
}
