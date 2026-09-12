#ifdef RCT_NEW_ARCH_ENABLED

#import "NextImageViewComponentView.h"

#import <React/RCTConversions.h>
#import <react/renderer/components/NextImageSpec/ComponentDescriptors.h>
#import <react/renderer/components/NextImageSpec/EventEmitters.h>
#import <react/renderer/components/NextImageSpec/Props.h>
#import <react/renderer/components/NextImageSpec/RCTComponentViewHelpers.h>

#if __has_include(<NextImage/NextImage-Swift.h>)
#import <NextImage/NextImage-Swift.h>
#else
#import "NextImage-Swift.h"
#endif

using namespace facebook::react;

static NSDictionary *_Nullable NextImageSourceDictionary(const NextImageViewSourceStruct &source)
{
  if (source.uri.empty()) {
    return nil;
  }

  NSMutableArray<NSDictionary *> *headers = [NSMutableArray arrayWithCapacity:source.headers.size()];
  for (const auto &header : source.headers) {
    [headers addObject:@{
      @"name" : RCTNSStringFromString(header.name),
      @"value" : RCTNSStringFromString(header.value),
    }];
  }

  return @{
    @"uri" : RCTNSStringFromString(source.uri),
    @"headers" : headers,
    @"priority" : RCTNSStringFromString(toString(source.priority)),
    @"cache" : RCTNSStringFromString(toString(source.cache)),
    @"cacheDuration" : @(source.cacheDuration),
    @"cacheKey" : RCTNSStringFromString(source.cacheKey),
  };
}

@interface NextImageViewComponentView () <RCTNextImageViewViewProtocol>
@end

@implementation NextImageViewComponentView {
  NextImageViewImpl *_imageView;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<NextImageViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const NextImageViewProps>();
    _props = defaultProps;

    _imageView = [[NextImageViewImpl alloc] initWithFrame:self.bounds];
    _imageView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [self setUpEventHandlers];
    self.contentView = _imageView;
  }
  return self;
}

#pragma mark - Events

- (void)setUpEventHandlers
{
  __weak __typeof(self) weakSelf = self;

  _imageView.onNextImageLoadStart = ^(NSDictionary *_) {
    __typeof(self) strongSelf = weakSelf;
    if (auto emitter = [strongSelf nextImageEventEmitter]) {
      emitter->onNextImageLoadStart({});
    }
  };

  _imageView.onNextImageProgress = ^(NSDictionary *payload) {
    __typeof(self) strongSelf = weakSelf;
    if (auto emitter = [strongSelf nextImageEventEmitter]) {
      emitter->onNextImageProgress({
          .loaded = [payload[@"loaded"] intValue],
          .total = [payload[@"total"] intValue],
      });
    }
  };

  _imageView.onNextImageLoad = ^(NSDictionary *payload) {
    __typeof(self) strongSelf = weakSelf;
    if (auto emitter = [strongSelf nextImageEventEmitter]) {
      NSString *cacheType = payload[@"cacheType"] ?: @"unknown";
      emitter->onNextImageLoad({
          .width = (Float)[payload[@"width"] doubleValue],
          .height = (Float)[payload[@"height"] doubleValue],
          .cacheType = std::string(cacheType.UTF8String),
          .elapsed = [payload[@"elapsed"] intValue],
      });
    }
  };

  _imageView.onNextImageError = ^(NSDictionary *payload) {
    __typeof(self) strongSelf = weakSelf;
    if (auto emitter = [strongSelf nextImageEventEmitter]) {
      NSString *message = payload[@"error"] ?: @"";
      NSString *code = payload[@"code"] ?: @"UNKNOWN";
      emitter->onNextImageError({
          .error = std::string(message.UTF8String),
          .code = std::string(code.UTF8String),
          .status = [payload[@"status"] intValue],
          .retryable = [payload[@"retryable"] boolValue],
      });
    }
  };

  _imageView.onNextImageLoadEnd = ^(NSDictionary *_) {
    __typeof(self) strongSelf = weakSelf;
    if (auto emitter = [strongSelf nextImageEventEmitter]) {
      emitter->onNextImageLoadEnd({});
    }
  };
}

- (std::shared_ptr<const NextImageViewEventEmitter>)nextImageEventEmitter
{
  if (!_eventEmitter) {
    return nullptr;
  }
  return std::static_pointer_cast<const NextImageViewEventEmitter>(_eventEmitter);
}

#pragma mark - Props

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<const NextImageViewProps>(props);

  _imageView.source = NextImageSourceDictionary(newProps.source);
  _imageView.defaultSourceUri = RCTNSStringFromStringNilIfEmpty(newProps.defaultSource);
  _imageView.placeholderUri = RCTNSStringFromStringNilIfEmpty(newProps.placeholder);
  _imageView.resizeMode = RCTNSStringFromString(toString(newProps.resizeMode));
  _imageView.transition = RCTNSStringFromString(toString(newProps.transition));
  _imageView.transitionDuration = (double)newProps.transitionDuration;
  _imageView.borderRadiusValue = (CGFloat)newProps.borderRadius;
  _imageView.isCircle = newProps.isCircle;
  _imageView.downsample = newProps.downsample;
  _imageView.grayscale = newProps.grayscale;
  _imageView.blurRadiusValue = (CGFloat)newProps.blurRadius;
  _imageView.tintColorValue = RCTUIColorFromSharedColor(newProps.tintColor);
  _imageView.deferNetwork = newProps.deferNetwork;
  _imageView.retryCount = newProps.retryCount;
  _imageView.retryDelay = (double)newProps.retryDelay;

  [super updateProps:props oldProps:oldProps];

  // Every prop for this update has now been applied, so at most one request
  // is started no matter how many props changed.
  [_imageView commitProps];
}

#pragma mark - Lifecycle

- (void)prepareForRecycle
{
  // Cancels in-flight work and clears the image, but keeps the event handlers
  // so the recycled view is immediately usable again.
  [_imageView cleanup];
  [super prepareForRecycle];
  static const auto defaultProps = std::make_shared<const NextImageViewProps>();
  _props = defaultProps;
}

@end

Class<RCTComponentViewProtocol> NextImageViewCls(void)
{
  return NextImageViewComponentView.class;
}

#endif
