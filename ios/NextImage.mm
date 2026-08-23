#import "NextImage.h"
#if __has_include(<NextImage/NextImage-Swift.h>)
#import <NextImage/NextImage-Swift.h>
#else
#import "NextImage-Swift.h"
#endif

@implementation NextImage

RCT_EXPORT_MODULE()

- (void)preload:(NSArray<NSDictionary *> *)sources {
    NSMutableArray *urls = [NSMutableArray new];
    for (NSDictionary *source in sources) {
        NSString *uri = source[@"uri"];
        if (uri) {
            [urls addObject:[NSURL URLWithString:uri]];
        }
    }
    [[NextImageSwift shared] preloadWithUrls:urls];
}

- (void)clearMemoryCache:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [[NextImageSwift shared] clearMemoryCache];
    resolve(nil);
}

- (void)clearDiskCache:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [[NextImageSwift shared] clearDiskCacheWithCompletion:^{
        resolve(nil);
    }];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeNextImageSpecJSI>(params);
}

@end
