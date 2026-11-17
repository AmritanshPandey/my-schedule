import WidgetKit

struct NextUpEntry: TimelineEntry {
  let date: Date
  /// The day this entry falls on, or nil when the app hasn't written one yet
  /// (never opened, signed out, or the snapshot is from an older day).
  let day: WidgetDay?
  let streak: Int
}

/// Nothing is recomputed here. The app's snapshot already says what's next;
/// the timeline only adds an entry at every start and end time, so
/// "Now · until 7:45" flips on time, and at midnight, so tomorrow takes over
/// without the app being opened.
struct NextUpProvider: TimelineProvider {
  func placeholder(in context: Context) -> NextUpEntry {
    NextUpEntry(date: .now, day: .sample, streak: 4)
  }

  func getSnapshot(in context: Context, completion: @escaping (NextUpEntry) -> Void) {
    if context.isPreview, WidgetSnapshot.load() == nil {
      completion(placeholder(in: context))
      return
    }
    completion(entry(at: .now, from: WidgetSnapshot.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<NextUpEntry>) -> Void) {
    let snapshot = WidgetSnapshot.load()
    let now = Date.now
    let calendar = Calendar.current
    let midnight = calendar.startOfDay(for: calendar.date(byAdding: .day, value: 1, to: now) ?? now)

    var dates: Set<Date> = [now, midnight]
    for day in snapshot?.days ?? [] {
      guard let start = Self.date(fromISO: day.dateISO) else { continue }
      for item in day.items {
        for minutes in [item.startMinutes, item.endMinutes].compactMap({ $0 }) {
          let at = start.addingTimeInterval(TimeInterval(minutes * 60))
          if at > now { dates.insert(at) }
        }
      }
    }

    let entries = dates.sorted().map { entry(at: $0, from: snapshot) }
    // Ask again after tomorrow ends; the app reloads sooner whenever it runs.
    let refresh = calendar.date(byAdding: .day, value: 1, to: midnight) ?? midnight
    completion(Timeline(entries: entries, policy: .after(refresh)))
  }

  private func entry(at date: Date, from snapshot: WidgetSnapshot?) -> NextUpEntry {
    NextUpEntry(date: date, day: snapshot?.day(for: date), streak: snapshot?.streak ?? 0)
  }

  static func date(fromISO iso: String) -> Date? {
    let parts = iso.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
  }
}

extension WidgetDay {
  static let sample = WidgetDay(
    dateISO: WidgetSnapshot.isoDate(.now),
    state: .task,
    done: 2,
    total: 5,
    items: [
      WidgetItem(id: "1", dateISO: "", title: "Strength workout", planTitle: "Get lean", startMinutes: 7 * 60, endMinutes: 8 * 60, accent: "orange"),
      WidgetItem(id: "2", dateISO: "", title: "Deep work: portfolio", planTitle: "Portfolio", startMinutes: 10 * 60, endMinutes: 12 * 60, accent: "blue"),
      WidgetItem(id: "3", dateISO: "", title: "Evening walk", planTitle: "Get lean", startMinutes: 19 * 60, endMinutes: 19 * 60 + 45, accent: "lime"),
    ]
  )
}
