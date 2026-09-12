# Podfile helper for react-native-next-image.
#
#   require_relative '../node_modules/react-native-next-image/scripts/next_image_pods'
#
#   post_install do |installer|
#     react_native_post_install(installer, config[:reactNativePath])
#     next_image_post_install(installer)
#   end
#
# NextImage depends on Kingfisher, and two of Kingfisher's build settings do
# not survive a static-library CocoaPods install, which is what a React Native
# app uses unless it opts into `use_frameworks!`. Both fixes are applied here so
# the Podfile stays a one-liner and can pick up future adjustments with a
# package upgrade.
#
# 1. Kingfisher's podspec asks for library evolution. CocoaPods gives every
#    Swift pod a clang module map, so the emitted .swiftinterface contains
#    `@_exported import Kingfisher`, and Xcode fails to verify it with
#    "underlying Objective-C module 'Kingfisher' not found". Library evolution
#    buys nothing for a pod built from source inside the app, so it is turned
#    off. Harmless under `use_frameworks!`.
#
# 2. Kingfisher declares iOS 13, and its resource bundle target inherits that.
#    Xcode 27 refuses any deployment target below iOS 15, and React Native's
#    own post install step only raises the targets it knows about. Every
#    target below the app's minimum is raised to it.
def next_image_post_install(installer, min_ios_version: nil)
  minimum = min_ios_version || (defined?(min_ios_version_supported) ? min_ios_version_supported : nil)

  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      if target.name == 'Kingfisher'
        config.build_settings['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'NO'
        config.build_settings['SWIFT_VERIFY_EMITTED_MODULE_INTERFACE'] = 'NO'
      end

      next if minimum.nil?
      current = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f
      if current > 0 && current < minimum.to_f
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = minimum
      end
    end
  end
end
