# 暴击薄肌

日常训练，暴击薄肌。一个以徒手训练、日常饮食记录和灵活练休安排为核心的中文健身原型，同时提供网页版和 Android 试用版。

## 使用与下载

| 入口 | 链接 |
| --- | --- |
| 网页版 | [打开暴击薄肌](https://baoji-boji-fit.shouuu336.chatgpt.site/) |
| Android 安装包 | [下载最新 APK](https://github.com/swaggyer/Build-up-muscles/releases/latest/download/baoji-boji-android.apk) |
| 安装包版本与校验值 | [查看 Releases](https://github.com/swaggyer/Build-up-muscles/releases/latest) |
| 构建与检查记录 | [GitHub Actions](https://github.com/swaggyer/Build-up-muscles/actions/workflows/android-build.yml) |

手机可复制以下地址到浏览器打开：

```text
https://github.com/swaggyer/Build-up-muscles/releases/latest/download/baoji-boji-android.apk
```

Android 8.0 及以上支持安装。下载后打开 APK，按系统提示允许当前浏览器或文件管理器安装该来源的应用。当前提供调试签名的试用安装包，不是应用商店版本。若旧版与新版签名不同，系统可能拒绝覆盖安装；请先保留本机记录，不要直接卸载旧版。

网页版沿用现有 Sites 访问权限，可能需要登录拥有访问权限的账号。iPhone 使用网页版；本仓库暂不提供 iOS 安装包。APK 将完整网页资源打包在应用内，主体功能无需跳转到网站；首次下载照片识别模型仍需联网。

## 主要功能

- 身高、体重、年龄、性别、体脂及身体关注点档案；体脂缺省时明确标记为公式粗估。
- 自选复盘日期与练休周期，组合全身、下肢、核心等主题训练，安排热身、力量、有氧和放松。
- 计次动作每组从 10 次起，按经验调整组数与休息；平板、侧平板和靠墙深蹲按秒保持。保留降难度和提前结束的提示。
- 今日动作右侧圆形打卡，完成后绘制勾选动画与礼花，支持撤销、逐组记录及刷新保留。
- 15 个动作，两名示范角色，可暂停、查看关键姿势与对应教学来源。
- 跑步、爬坡、爬楼梯、游泳、快走计时，支持暂停、继续、手动里程/层数和历史记录。
- 31 种常见食物目录，列表显示食物图标，点击详情查看每 100 克和所选份量的热量。
- 拍摄或上传餐食照片，辅助识别后由用户确认食物和份量，再估算该餐热量；也可手动记录。
- 漏练后选择顺延复盘，或将适量轻活动分摊到后续周期。

记录仅保存在当前浏览器或 Android 应用的本机存储中，网页版与 APK 不会自动同步。清除浏览器数据或卸载应用会清除对应记录。

## 动作演示

动作包括深蹲、俯卧撑、交替弓步、平板支撑、登山跑、卷腹、侧平板、靠墙深蹲、侧卧抬腿、跪姿俯卧撑、平板肩碰、俄罗斯转体、开合跳、高抬腿、深蹲跳。

骨架演示使用三维关节位置、独立骨盆、双侧髋膝踝、固定肢段和足底接触约束，再投影成网页矢量画面。裤腰随骨盆、裤筒随各自大腿，视线随身体方向。它是受约束的运动学示意，不是对真人肌肉力、关节负荷的动力学测量或医学评估。

训练安排与动作要点参考 ACE、NASM、NHS、Queensland Health 等原始教程，并辅以 ATHLEAN-X 教学。出处见 `training-dose-sources.json`、`movement-demo-sources.json` 以及动作详情内链接。10 次是产品的训练目标，不要求在姿势走样或疼痛时强凑次数。

## 本地运行

无需安装前端依赖。在仓库根目录运行：

```sh
python -m http.server 4173 --directory dist
```

浏览器打开 `http://localhost:4173/`。拍摄功能依赖浏览器支持及相机权限；照片估算属于辅助记录，食材份量、烹调用油和隐藏配料仍需手动确认。

## 验证与 Android 构建

```sh
node check-engine.cjs
node check-cardio.cjs
node check-food-directory.cjs
node check-athletes.cjs
node check-vector.cjs
node check-completion.cjs
node check-android.cjs
```

Android 使用 JDK 17、Gradle 8.9、Android SDK 35：

```sh
gradle -p android --no-daemon :app:assembleDebug :app:lintDebug
```

构建会同步当时最新的 `dist/`，产物位于 `android/app/build/outputs/apk/debug/app-debug.apk`。GitHub Actions 在网页或 Android 代码更新时执行检查、编译、Lint、APK 签名校验并发布真实安装包到 Releases。详见 [Android 构建说明](android/BUILD.md)。自动检查和成功编译不代表已在所有 Android 手机实测。

## 文件结构

```text
dist/                       网页、训练引擎、演示与食物资源
android/                    Android 原生 WebView 容器
.github/workflows/          自动检查、APK 构建与发布
check-*.cjs                 计划、记录、动画和打包检查
training-dose-sources.json  训练剂量参考
movement-demo-sources.json  动作演示参考
```

## 素材说明

示范角色按用户提供的海绵宝宝、派大星参考形象制作；角色名称与形象归各自权利方。食物图标的来源、许可和热量资料见 `dist/assets/food-icon-sources.txt`、`food-directory-expansion-sources.txt` 及同目录许可文件。腹肌闪电 Logo 为本项目新绘制的矢量图案。
