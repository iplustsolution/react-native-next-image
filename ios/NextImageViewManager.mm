// The legacy (pre-Fabric) view manager. On the New Architecture the view is
// provided by NextImageViewComponentView instead, so this file compiles to
// nothing there and the two can never both register "NextImageView".
#ifndef RCT_NEW_ARCH_ENABLED

#import <React/RCTViewManager.h>

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
  return [[NextImageViewImpl alloc] initWithFrame:CGRectZero];
}

RCT_EXPORT_VIEW_PROPERTY(source, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(defaultSource, NSDictionary)
RCT_REMAP_VIEW_PROPERTY(placeholder, placeholderSource, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(resizeMode, NSString)
RCT_EXPORT_VIEW_PROPERTY(transition, NSString)
RCT_EXPORT_VIEW_PROPERTY(transitionDuration, double)
RCT_REMAP_VIEW_PROPERTY(cornerRadius, borderRadiusValue, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(isCircle, BOOL)
RCT_EXPORT_VIEW_PROPERTY(downsample, BOOL)
RCT_EXPORT_VIEW_PROPERTY(grayscale, BOOL)
RCT_REMAP_VIEW_PROPERTY(blurRadius, blurRadiusValue, CGFloat)
RCT_REMAP_VIEW_PROPERTY(tintColor, tintColorValue, UIColor)
RCT_EXPORT_VIEW_PROPERTY(deferNetwork, BOOL)
RCT_EXPORT_VIEW_PROPERTY(retryCount, NSInteger)
RCT_EXPORT_VIEW_PROPERTY(retryDelay, double)

RCT_EXPORT_VIEW_PROPERTY(onNextImageLoadStart, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onNextImageProgress, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onNextImageLoad, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onNextImageError, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onNextImageLoadEnd, RCTBubblingEventBlock)

@end

#endif
