#import <React/RCTBridgeModule.h>

// Registers the Swift PlanRWidgetBridge with React Native.
@interface RCT_EXTERN_MODULE(PlanRWidgetBridge, NSObject)
RCT_EXTERN_METHOD(setSnapshot:(NSString *)json)
RCT_EXTERN_METHOD(clear)
@end
