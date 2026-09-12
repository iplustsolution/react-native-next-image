#import "NextImageModule.h"

#if __has_include(<NextImage/NextImage-Swift.h>)
#import <NextImage/NextImage-Swift.h>
#else
#import "NextImage-Swift.h"
#endif

@implementation NextImageModule

// The JS side looks this module up as "NextImageModule", which is the class name.
RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (void)preload:(NSArray *)sources
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[NextImageEngine shared] preloadWithSources:sources];
  });
}

- (void)prefetch:(NSArray *)uris
        priority:(NSString *)priority
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[NextImageEngine shared] prefetchWithUris:uris
                                      priority:priority ?: @"normal"
                                    completion:^(NSInteger cached) {
                                      resolve(@(cached));
                                    }];
  });
}

- (void)clearMemoryCache:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [[NextImageEngine shared] clearMemoryCache];
  resolve(nil);
}

- (void)clearDiskCache:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [[NextImageEngine shared] clearDiskCacheWithCompletion:^{
    resolve(nil);
  }];
}

- (void)isCached:(NSString *)uri
        cacheKey:(NSString *)cacheKey
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject
{
  BOOL cached = [[NextImageEngine shared] isCachedWithUri:uri ?: @"" cacheKey:cacheKey ?: @""];
  resolve(@(cached));
}

- (void)removeFromCache:(NSString *)uri
               cacheKey:(NSString *)cacheKey
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
  [[NextImageEngine shared] removeFromCacheWithUri:uri ?: @""
                                          cacheKey:cacheKey ?: @""
                                        completion:^(BOOL removed) {
                                          resolve(@(removed));
                                        }];
}

- (void)getDiskCacheSize:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [[NextImageEngine shared] diskCacheSizeWithCompletion:^(double size) {
    resolve(@(size));
  }];
}

- (void)getMemoryCacheSize:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  resolve(@([[NextImageEngine shared] memoryCacheSize]));
}

- (void)setCacheLimits:(double)memoryBytes
             diskBytes:(double)diskBytes
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
  if (memoryBytes < 0 || diskBytes < 0) {
    reject(@"E_NEXT_IMAGE_CONFIG", @"Cache limits must not be negative.", nil);
    return;
  }

  [[NextImageConfigStore shared] updateCacheLimitsWithMemoryBytes:(NSUInteger)memoryBytes
                                                       diskBytes:(NSUInteger)diskBytes];
  [[NextImageEngine shared] configure];
  resolve(nil);
}

- (void)configure:(NSDictionary *)options
{
  if (options == nil) {
    return;
  }
  if ([[NextImageConfigStore shared] applyWithOptions:options]) {
    [[NextImageEngine shared] configure];
  }
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeNextImageModuleSpecJSI>(params);
}

@end
