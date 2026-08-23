#import <React/RCTViewManager.h>
#import <React/RCTUIManager.h>

#if __has_include(<NextImage/NextImage-Swift.h>)
#import <NextImage/NextImage-Swift.h>
#else
#import "NextImage-Swift.h"
#endif

@interface NextImageViewManager : RCTViewManager
@end

@implementation NextImageViewManager

RCT_EXPORT_MODULE(NextImageView)

- (UIView *)view
{
  return [[NextImageViewImpl alloc] init];
}

RCT_EXPORT_VIEW_PROPERTY(source, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(defaultSource, NSString)
RCT_EXPORT_VIEW_PROPERTY(resizeMode, NSString)
RCT_EXPORT_VIEW_PROPERTY(blurRadius, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(transition, NSString)
RCT_EXPORT_VIEW_PROPERTY(transitionDuration, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(borderRadius, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(isCircle, BOOL)
RCT_EXPORT_VIEW_PROPERTY(grayscale, BOOL)
RCT_EXPORT_VIEW_PROPERTY(downsample, BOOL)
RCT_EXPORT_VIEW_PROPERTY(placeholder, NSString)
RCT_REMAP_VIEW_PROPERTY(tintColor, tintColorProp, UIColor)

// Events
RCT_EXPORT_VIEW_PROPERTY(onNextImageLoadStart, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onNextImageProgress, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onNextImageLoad, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onNextImageError, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onNextImageLoadEnd, RCTBubblingEventBlock)

@end
