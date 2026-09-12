#import <NextImageSpec/NextImageSpec.h>

NS_ASSUME_NONNULL_BEGIN

/// Cache and configuration APIs behind `NextImage.preload`,
/// `NextImage.isCached`, `NextImage.configure` and friends.
@interface NextImageModule : NSObject <NativeNextImageModuleSpec>
@end

NS_ASSUME_NONNULL_END
