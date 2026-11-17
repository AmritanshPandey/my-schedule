import SwiftUI
import WidgetKit

// The Overview's Next up card, on the home screen and the Lock Screen
// (docs/superpowers/specs/2026-11-08-ios-widget-design.md). DESIGN.md: ink
// text on a quiet surface, Momentum Green only for progress and a live streak
// (the One Signal Rule), sentence case, the app's Avenir Next.

@main
struct PlanRWidgets: WidgetBundle {
  var body: some Widget {
    NextUpWidget()
  }
}

struct NextUpWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NextUp", provider: NextUpProvider()) { entry in
      NextUpView(entry: entry)
    }
    .configurationDisplayName("Next up")
    .description("What to do now, and how the day is going.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline, .accessoryCircular])
  }
}

// MARK: - Tokens

private enum Palette {
  static let ink = Color(light: 0x0A0A0A, dark: 0xFFFFFF)
  static let muted = Color(light: 0x525252, dark: 0xA3A3A3)
  static let surface = Color(light: 0xFFFFFF, dark: 0x171717)
  static let track = Color(light: 0xE5E5E5, dark: 0x2A2A2A)
  static let green = Color(light: 0x008236, dark: 0x2FD46E)

  static func accent(_ token: String?) -> Color {
    switch token {
    case "red", "rose": return Color(hex: 0xFB2C36)
    case "orange": return Color(hex: 0xFF6900)
    case "amber", "yellow": return Color(hex: 0xE17100)
    case "lime": return Color(hex: 0x5EA500)
    case "green", "emerald", "teal": return Color(hex: 0x00A63E)
    case "cyan", "sky": return Color(hex: 0x00A6F4)
    case "blue", "indigo": return Color(hex: 0x155DFC)
    case "violet", "purple", "fuchsia": return Color(hex: 0xAD46FF)
    case "pink": return Color(hex: 0xEC003F)
    default: return muted
    }
  }
}

private enum Fonts {
  static func bold(_ size: CGFloat, _ style: Font.TextStyle = .body) -> Font { .custom("AvenirNext-Bold", size: size, relativeTo: style) }
  static func demi(_ size: CGFloat, _ style: Font.TextStyle = .body) -> Font { .custom("AvenirNext-DemiBold", size: size, relativeTo: style) }
  static func medium(_ size: CGFloat, _ style: Font.TextStyle = .body) -> Font { .custom("AvenirNext-Medium", size: size, relativeTo: style) }
}

// MARK: - Wording

private func clock(_ minutes: Int) -> String {
  let h = (minutes / 60) % 24
  let m = minutes % 60
  let h12 = h % 12 == 0 ? 12 : h % 12
  return m == 0 ? "\(h12) \(h < 12 ? "AM" : "PM")" : String(format: "%d:%02d %@", h12, m, h < 12 ? "AM" : "PM")
}

private func minutesIntoDay(_ date: Date) -> Int {
  let c = Calendar.current.dateComponents([.hour, .minute], from: date)
  return (c.hour ?? 0) * 60 + (c.minute ?? 0)
}

/// "Now · until 7:45 AM" inside the slot, else its start, else "Anytime".
private func timeLabel(_ item: WidgetItem, at date: Date) -> String {
  guard let start = item.startMinutes else { return "Anytime" }
  let now = minutesIntoDay(date)
  if let end = item.endMinutes, now >= start, now < end { return "Now · until \(clock(end))" }
  return clock(start)
}

private func isNow(_ item: WidgetItem, at date: Date) -> Bool {
  guard let start = item.startMinutes, let end = item.endMinutes else { return false }
  let now = minutesIntoDay(date)
  return now >= start && now < end
}

// MARK: - Views

struct NextUpView: View {
  let entry: NextUpEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    switch family {
    case .accessoryInline: InlineView(entry: entry)
    case .accessoryCircular: CircularView(entry: entry)
    case .accessoryRectangular: RectangularView(entry: entry)
    case .systemMedium: MediumView(entry: entry).widgetSurface()
    default: SmallView(entry: entry).widgetSurface()
    }
  }
}

/// The headline both home-screen sizes share: what's next, or what the day is.
private struct Headline: View {
  let entry: NextUpEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      switch (entry.day?.state, entry.day?.items.first) {
      case (.task?, let item?):
        Text(timeLabel(item, at: entry.date))
          .font(Fonts.demi(13, .caption))
          .foregroundStyle(isNow(item, at: entry.date) ? Palette.green : Palette.muted)
          .lineLimit(1)
        Text(item.title)
          .font(Fonts.bold(19, .headline))
          .foregroundStyle(Palette.ink)
          .lineLimit(3)
          .minimumScaleFactor(0.85)
        if let plan = item.planTitle {
          HStack(spacing: 5) {
            Circle().fill(Palette.accent(item.accent)).frame(width: 7, height: 7)
            Text(plan).font(Fonts.medium(12, .caption)).foregroundStyle(Palette.muted).lineLimit(1)
          }
        }
      case (.dayDone?, _):
        Text("Today").font(Fonts.demi(13, .caption)).foregroundStyle(Palette.muted)
        Text("Day complete").font(Fonts.bold(19, .headline)).foregroundStyle(Palette.ink)
      case (.empty?, _):
        Text("Next up").font(Fonts.demi(13, .caption)).foregroundStyle(Palette.muted)
        Text("Plan your day").font(Fonts.bold(19, .headline)).foregroundStyle(Palette.ink)
        Text("Nothing scheduled yet.").font(Fonts.medium(12, .caption)).foregroundStyle(Palette.muted)
      default:
        Text("PlanR").font(Fonts.demi(13, .caption)).foregroundStyle(Palette.muted)
        Text("Open PlanR to see what's next").font(Fonts.bold(17, .headline)).foregroundStyle(Palette.ink).lineLimit(3)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct Progress: View {
  let day: WidgetDay

  var body: some View {
    let fraction = day.total > 0 ? CGFloat(day.done) / CGFloat(day.total) : 0
    VStack(alignment: .leading, spacing: 5) {
      GeometryReader { proxy in
        ZStack(alignment: .leading) {
          Capsule().fill(Palette.track)
          Capsule().fill(Palette.green).frame(width: max(fraction > 0 ? 6 : 0, proxy.size.width * fraction))
        }
      }
      .frame(height: 6)
      Text("\(day.done) of \(day.total) done")
        .font(Fonts.demi(12, .caption))
        .foregroundStyle(Palette.muted)
        .monospacedDigit()
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(day.done) of \(day.total) done today")
  }
}

private struct SmallView: View {
  let entry: NextUpEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Headline(entry: entry)
      Spacer(minLength: 8)
      if let day = entry.day, day.total > 0 { Progress(day: day) }
    }
    .widgetURL(entry.day?.items.first?.deepLink ?? URL(string: "planr://today"))
  }
}

private struct MediumView: View {
  let entry: NextUpEntry

  var body: some View {
    HStack(alignment: .top, spacing: 16) {
      VStack(alignment: .leading, spacing: 0) {
        Headline(entry: entry)
        Spacer(minLength: 8)
        if let day = entry.day, day.total > 0 { Progress(day: day) }
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      if let day = entry.day, day.items.count > 1 {
        VStack(alignment: .leading, spacing: 10) {
          Text("Later").font(Fonts.demi(12, .caption)).foregroundStyle(Palette.muted)
          ForEach(day.items.dropFirst().prefix(3)) { item in
            Link(destination: item.deepLink ?? URL(string: "planr://today")!) {
              HStack(alignment: .firstTextBaseline, spacing: 6) {
                Circle().fill(Palette.accent(item.accent)).frame(width: 6, height: 6)
                VStack(alignment: .leading, spacing: 1) {
                  Text(item.title).font(Fonts.demi(13)).foregroundStyle(Palette.ink).lineLimit(1)
                  Text(item.startMinutes.map(clock) ?? "Anytime").font(Fonts.medium(11, .caption)).foregroundStyle(Palette.muted)
                }
              }
            }
          }
          Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .widgetURL(entry.day?.items.first?.deepLink ?? URL(string: "planr://today"))
  }
}

// MARK: Lock Screen

private struct RectangularView: View {
  let entry: NextUpEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      if let day = entry.day, day.state == .task, let item = day.items.first {
        Text(isNow(item, at: entry.date) ? timeLabel(item, at: entry.date) : "Next · \(timeLabel(item, at: entry.date))").font(Fonts.demi(12, .caption)).lineLimit(1)
        Text(item.title).font(Fonts.bold(15, .headline)).lineLimit(2)
        Text("\(day.done) of \(day.total) done").font(Fonts.medium(12, .caption)).foregroundStyle(.secondary)
      } else if let day = entry.day, day.state == .dayDone {
        Text("Today").font(Fonts.demi(12, .caption))
        Text("Day complete").font(Fonts.bold(15, .headline))
        Text("\(day.done) of \(day.total) done").font(Fonts.medium(12, .caption)).foregroundStyle(.secondary)
      } else {
        Text("Next up").font(Fonts.demi(12, .caption))
        Text(entry.day == nil ? "Open PlanR" : "Plan your day").font(Fonts.bold(15, .headline))
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .widgetURL(entry.day?.items.first?.deepLink ?? URL(string: "planr://today"))
    .lockScreenBackground()
  }
}

private struct InlineView: View {
  let entry: NextUpEntry

  var body: some View {
    if let day = entry.day, day.state == .task, let item = day.items.first {
      Text("\(item.startMinutes.map(clock) ?? "Next") · \(item.title)")
    } else if entry.day?.state == .dayDone {
      Text("Day complete")
    } else {
      Text("Plan your day")
    }
  }
}

private struct CircularView: View {
  let entry: NextUpEntry

  var body: some View {
    let day = entry.day
    let total = max(day?.total ?? 0, 1)
    Gauge(value: Double(day?.done ?? 0), in: 0...Double(total)) {
      Text("Done")
    } currentValueLabel: {
      Text("\(day?.done ?? 0)/\(day?.total ?? 0)").font(Fonts.bold(13)).monospacedDigit()
    }
    .gaugeStyle(.accessoryCircularCapacity)
    .widgetURL(URL(string: "planr://today"))
    .lockScreenBackground()
  }
}

// MARK: - Helpers

private extension View {
  /// iOS 17 draws the widget's background itself and adds margins; earlier
  /// versions need both done by hand.
  @ViewBuilder func widgetSurface() -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      self.containerBackground(Palette.surface, for: .widget)
    } else {
      self.padding(16).background(Palette.surface)
    }
  }

  @ViewBuilder func lockScreenBackground() -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      self.containerBackground(.clear, for: .widget)
    } else {
      self
    }
  }
}

private extension Color {
  init(hex: UInt32) {
    self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
  }

  init(light: UInt32, dark: UInt32) {
    self.init(UIColor { traits in
      let hex = traits.userInterfaceStyle == .dark ? dark : light
      return UIColor(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    })
  }
}

#if DEBUG
struct NextUpWidget_Previews: PreviewProvider {
  static var previews: some View {
    let entry = NextUpEntry(date: .now, day: .sample, streak: 4)
    NextUpView(entry: entry).previewContext(WidgetPreviewContext(family: .systemSmall))
    NextUpView(entry: entry).previewContext(WidgetPreviewContext(family: .systemMedium))
    NextUpView(entry: entry).previewContext(WidgetPreviewContext(family: .accessoryRectangular))
  }
}
#endif
