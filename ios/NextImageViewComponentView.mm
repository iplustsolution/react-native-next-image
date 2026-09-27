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

// `source`, `placeholder` and `defaultSource` share one shape in the spec, but
// codegen emits a distinct struct for each prop, hence the template.
template <typename SourceStruct>
static NSDictionary *_Nullable NextImageSourceDictionary(const SourceStruct &source)
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
    @"priority" : RCTNSStringFromString(source.priority),
    @"cache" : RCTNSStringFromString(source.cache),
    @"cacheDuration" : @(source.cacheDuration),
    @"cacheKey" : RCTNSStringFromString(source.cacheKey),
    @"bundled" : @(source.bundled),
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
  _imageView.defaultSource = NextImageSourceDictionary(newProps.defaultSource);
  _imageView.placeholderSource = NextImageSourceDictionary(newProps.placeholder);
  _imageView.resizeMode = RCTNSStringFromString(toString(newProps.resizeMode));
  _imageView.transition = RCTNSStringFromString(toString(newProps.transition));
  _imageView.transitionDuration = (double)newProps.transitionDuration;
  _imageView.borderRadiusValue = (CGFloat)newProps.cornerRadius;
  _imageView.isCircle = newProps.isCircle;
  _imageView.downsample = newProps.downsample;
  _imageView.grayscale = newProps.grayscale;
  _imageView.blurRadiusValue = (CGFloat)newProps.blurRadius;
  _imageView.tintColorValue = RCTUIColorFromSharedColor(newProps.tintColor);
  _imageView.deferNetwork = newProps.deferNetwork;
  _imageView.retryCount = newProps.retryCount;
  _imageView.retryDelay = (double)newProps.retryDelay;

  [super updateProps:props oldProps:oldProps];
}

- (void)finalizeUpdates:(RNComponentViewUpdateMask)updateMask
{
  [super finalizeUpdates:updateMask];
  [self removeContentMask];

  // Every prop for this update has now been applied, so at most one request
  // is started no matter how many props changed. This runs after
  // `updateLayoutMetrics`, so a new or recycled view already has its real
  // size: the decode is sized correctly and a memory cache hit is on screen
  // in the same frame the view is mounted, with no placeholder in between.
  // That is also what keeps the copy Reanimated mounts for a shared element
  // transition from flashing.
  [_imageView commitProps];
}

#pragma mark - Layout

- (void)layoutSubviews
{
  [super layoutSubviews];

  // React Native sizes the content view only in `updateLayoutMetrics`. A
  // frame that changes any other way, such as a shared element transition
  // copy growing into its target or a recycled view, would otherwise leave
  // the image at its previous size inside a larger view.
  _imageView.frame = UIEdgeInsetsInsetRect(self.bounds, RCTUIEdgeInsetsFromEdgeInsets(_layoutMetrics.contentInsets));
  [self removeContentMask];
}

// For a view that clips (`overflow: hidden` with a border radius) React Native
// gives every `UIImageView` child its own mask, sized to the child at that
// moment, and only rebuilds it while the view still clips. The image view here
// is such a child, so a view whose size or clipping changes without that
// rebuild (a shared element transition copy growing into a target that does
// not clip, or a recycled view) kept showing the image cut to its old size and
// corners. The mask is not needed: this view clips its children to its own
// shape, and the image view applies the corner radius itself.
- (void)removeContentMask
{
  if (_imageView.layer.mask != nil) {
    _imageView.layer.mask = nil;
  }
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

  // Reanimated writes transform and opacity straight to the view while it
  // runs a shared element transition, and the copy it mounts for one is
  // recycled afterwards. React Native only resets these for views driven by
  // its own Animated, and the next owner's props are compared against the
  // defaults above, so a leftover scale or opacity would never be undone.
  self.layer.transform = CATransform3DIdentity;
  self.layer.opacity = 1;
  self.layer.cornerRadius = 0;
  [self removeContentMask];
}

@end

Class<RCTComponentViewProtocol> NextImageViewCls(void)
{
  return NextImageViewComponentView.class;
}

#endif
