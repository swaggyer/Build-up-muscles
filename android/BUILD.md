# Android 测试版

应用将仓库内的 `dist/` 完整打包进安装包，通过 `WebViewAssetLoader` 在应用内部读取，没有远程首页跳转。训练计划、动作演示、饮食目录和本机记录使用同一份网页功能，记录保存在应用自己的本机网页存储中。

照片上传调用 Android 系统文件选择器，拍摄调用系统相机。应用只接收用户主动选择的图片，不索要相册、存储或相机权限；系统相机自行管理拍摄权限。拍摄文件暂存于应用私有缓存，超过一天的旧缓存会在下次打开应用时清理。外部 HTTPS 链接交给系统浏览器。

网页、食物识别模型和JavaScript/WASM运行库一并预装，识别无需首次联网下载。模型以固定源代码修订和SHA256校验，运行兼容性仍取决于手机的系统WebView。拍照、选图和手动添加食物可独立使用。当前未在Android真机验证，不应声称所有手机已通过测试。

## 构建

需要 JDK 17、Gradle 8.9、Android SDK Platform 35。Android Gradle Plugin 固定为 8.7.3；官方兼容说明为：https://developer.android.com/build/releases/agp-8-7-0-release-notes 。本项目不提交不明来源的 Gradle Wrapper 二进制，使用系统 Gradle 或 GitHub Actions 的固定版本安装。

在仓库根目录先准备并校验资源，再构建：

```text
node scripts/prepare-offline-model.cjs
gradle -p android --no-daemon :app:assembleDebug :app:lintDebug
```

安装包输出：`android/app/build/outputs/apk/debug/app-debug.apk`。测试版包名为 `com.swaggyer.baojiboji.preview`，最低 Android 8.0。安装时需要允许浏览器或文件管理器安装该来源的应用。这不是应用商店发行版。

构建先校验 `offline-model/offline-model-manifest.json` 中所有模型和运行库的长度与SHA256，再将当时最新的 `dist/` 与 `offline-model/` 合并到 `android/app/build/generated/web-assets/web/`。缺文件、散列不符或重复目标路径都会中止构建；ONNX和WASM不做ZIP压缩。单独同步命令为 `gradle -p android :app:syncWebAssets`。持续构建可添加 `-PappVersionCode=123 -PappVersionName=0.1.123` 覆盖版本号；版本编码应递增。

`ci/android-build.yml` 是可复制到仓库 `.github/workflows/android-build.yml` 的工作流模板；成功构建后可以将生成的 APK 上传到 GitHub Release，README 的下载地址应指向该真实产物。

默认 `assembleDebug` 使用Android工具生成的调试签名，CI从本次起缓存并复用该签名；缓存丢失仍可能造成签名变化。CI将新包与旧0.1.3的证书SHA256比较并将结果附在Release。签名不同不能直接覆盖安装，应保留旧应用和记录，不要盲目卸载。正式长期发行前仍应建立妥善保管的发布签名。

应用内更新桥仅允许 `https://appassets.androidplatform.net` 主框架，通过受限WebMessage协议调用固定仓库的版本检查、下载、来源设置和系统安装确认。网页不能指定下载URL或本机路径；下载包需通过SHA256、包名、版本和签名校验。`REQUEST_INSTALL_PACKAGES` 只用于调用Android系统安装确认，不用于静默安装。

打包后运行 `python3 android/audit-apk.py android/app/build/outputs/apk/debug/app-debug.apk --report android/app/build/offline-audit.json`，逐字节比较两源与APK全部网页资源，并检查清单散列及ONNX/WASM存储方式。`python3 android/check-offline-audit.py` 使用小型合成ZIP测试遗漏、损坏、错误压缩和未固定修订等失败路径，不代表模型推理或真机验证。

## 检查范围

`node check-android.cjs` 可在仓库根目录检查离线资源打包、最小权限、URI 传递、返回键与源文件结构。GitHub Actions 还应真正执行编译与 Android Lint。静态检查不能替代真机验收：至少测试首次启动、生成计划、完成训练、本机记录重启保留、拍摄、相册上传、识别失败时手动添加，以及外部链接和返回键。

官方实现参考：

- 本地网页资源：https://developer.android.com/develop/ui/views/layout/webapps/load-local-content
- WebView 文件选择回调：https://developer.android.com/reference/android/webkit/WebChromeClient#onShowFileChooser(android.webkit.WebView,android.webkit.ValueCallback,android.webkit.WebChromeClient.FileChooserParams)
- 系统相机拍照：https://developer.android.com/media/camera/camera-deprecated/photobasics
- 文件共享：https://developer.android.com/training/secure-file-sharing/setup-sharing
