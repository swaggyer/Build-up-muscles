# Android 测试版

应用将仓库内的 `dist/` 完整打包进安装包，通过 `WebViewAssetLoader` 在应用内部读取，没有远程首页跳转。训练计划、动作演示、饮食目录和本机记录使用同一份网页功能，记录保存在应用自己的本机网页存储中。

照片上传调用 Android 系统文件选择器，拍摄调用系统相机。应用只接收用户主动选择的图片，不索要相册、存储或相机权限；系统相机自行管理拍摄权限。拍摄文件暂存于应用私有缓存，超过一天的旧缓存会在下次打开应用时清理。外部 HTTPS 链接交给系统浏览器。

核心网页资源可离线使用。照片辅助识别仍使用网页现有的本机模型方案，首次下载模型需要联网，识别兼容性还取决于手机的系统 WebView。拍照、选图和手动添加食物仍可独立使用。当前未在 Android 真机验证，不应声称所有手机已通过测试。

## 构建

需要 JDK 17、Gradle 8.9、Android SDK Platform 35。Android Gradle Plugin 固定为 8.7.3；官方兼容说明为：https://developer.android.com/build/releases/agp-8-7-0-release-notes 。本项目不提交不明来源的 Gradle Wrapper 二进制，使用系统 Gradle 或 GitHub Actions 的固定版本安装。

在仓库根目录运行：

```text
gradle -p android --no-daemon :app:assembleDebug :app:lintDebug
```

安装包输出：`android/app/build/outputs/apk/debug/app-debug.apk`。测试版包名为 `com.swaggyer.baojiboji.preview`，最低 Android 8.0。安装时需要允许浏览器或文件管理器安装该来源的应用。这不是应用商店发行版。

构建会自动先把当时最新的 `dist/` 同步到 `android/app/build/generated/web-assets/web/`。若需单独准备资源，运行 `gradle -p android :app:syncWebAssets`。持续构建可添加 `-PappVersionCode=123 -PappVersionName=0.1.123` 覆盖版本号；版本编码应为递增正整数。

`ci/android-build.yml` 是可复制到仓库 `.github/workflows/android-build.yml` 的工作流模板；成功构建后可以将生成的 APK 上传到 GitHub Release，README 的下载地址应指向该真实产物。

默认 `assembleDebug` 使用 Android 工具生成的调试签名。不同构建机器生成的签名可能不同，因此后续安装包可能无法覆盖安装；正式长期发行前应建立固定、妥善保管的发布签名与版本号管理。不要卸载应用来尝试更新，除非已确认可以放弃其中的本机记录。

## 检查范围

`node check-android.cjs` 可在仓库根目录检查离线资源打包、最小权限、URI 传递、返回键与源文件结构。GitHub Actions 还应真正执行编译与 Android Lint。静态检查不能替代真机验收：至少测试首次启动、生成计划、完成训练、本机记录重启保留、拍摄、相册上传、识别失败时手动添加，以及外部链接和返回键。

官方实现参考：

- 本地网页资源：https://developer.android.com/develop/ui/views/layout/webapps/load-local-content
- WebView 文件选择回调：https://developer.android.com/reference/android/webkit/WebChromeClient#onShowFileChooser(android.webkit.WebView,android.webkit.ValueCallback,android.webkit.WebChromeClient.FileChooserParams)
- 系统相机拍照：https://developer.android.com/media/camera/camera-deprecated/photobasics
- 文件共享：https://developer.android.com/training/secure-file-sharing/setup-sharing
