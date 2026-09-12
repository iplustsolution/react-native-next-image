#ifdef RCT_NEW_ARCH_ENABLED

#import <React/RCTViewComponentView.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// Fabric host view for `NextImageView`. Owns a `NextImageViewImpl` as its
/// content view and translates C++ props and events to and from it.
@interface NextImageViewComponentView : RCTViewComponentView
@end

NS_ASSUME_NONNULL_END

#endif
