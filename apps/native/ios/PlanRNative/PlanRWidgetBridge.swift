import Foundation
import WidgetKit

/// Hands the widget what to draw. The app works out the snapshot in
/// TypeScript (@planr/core widgetSnapshot.ts) and passes it here as JSON;
/// this saves it where the widget extension can read it (the shared App
/// Group) and asks WidgetKit to redraw. Reloads asked for by the app while
/// it's in the foreground don't count against the widget's refresh budget.
@objc(PlanRWidgetBridge)
final class PlanRWidgetBridge: NSObject {
  static let appGroup = "group.com.amritansh.planr"
  static let snapshotKey = "widgetSnapshot"

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func setSnapshot(_ json: String) {
    UserDefaults(suiteName: Self.appGroup)?.set(json, forKey: Self.snapshotKey)
    WidgetCenter.shared.reloadAllTimelines()
  }

  /// Signing out: the widget stops showing the previous account's tasks.
  @objc func clear() {
    UserDefaults(suiteName: Self.appGroup)?.removeObject(forKey: Self.snapshotKey)
    WidgetCenter.shared.reloadAllTimelines()
  }
}
