import Foundation

/// What the app hands the widget: the JSON from @planr/core widgetSnapshot.ts.
/// Keep the two in step; the shape is versioned so an older widget can tell.
struct WidgetSnapshot: Codable {
  let version: Int
  let generatedAt: String
  let streak: Int
  /// Today, then tomorrow.
  let days: [WidgetDay]

  static let appGroup = "group.com.amritansh.planr"
  static let key = "widgetSnapshot"

  static func load() -> WidgetSnapshot? {
    guard
      let json = UserDefaults(suiteName: appGroup)?.string(forKey: key),
      let data = json.data(using: .utf8),
      let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
      snapshot.version == 1
    else { return nil }
    return snapshot
  }

  func day(for date: Date) -> WidgetDay? {
    days.first { $0.dateISO == WidgetSnapshot.isoDate(date) }
  }

  static func isoDate(_ date: Date) -> String {
    let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
  }
}

struct WidgetDay: Codable {
  enum State: String, Codable { case task, dayDone = "day-done", empty }
  let dateISO: String
  let state: State
  let done: Int
  let total: Int
  /// Open tasks in Today's order; the first is Next up.
  let items: [WidgetItem]
}

struct WidgetItem: Codable, Identifiable {
  let id: String
  let dateISO: String
  let title: String
  let planTitle: String?
  /// Minutes after midnight; absent for an anytime task.
  let startMinutes: Int?
  let endMinutes: Int?
  let accent: String?

  var deepLink: URL? {
    var parts = URLComponents()
    parts.scheme = "planr"
    parts.host = "task"
    parts.path = "/\(id)"
    parts.queryItems = [URLQueryItem(name: "date", value: dateISO)]
    return parts.url
  }
}
