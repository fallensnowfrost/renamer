# werenameit

werenameit是一个离线Windows桌面客户端，用于批量整理人物媒体资源目录。它可以递归扫描子文件夹，预览并执行文件夹重命名、图片/视频纯序号重命名、文件夹名称清理和首尾空格清理。

> 当前版本：0.2.0-alpha.1  
> 状态：未发布版本 / Unreleased  
> 支持平台：Windows x64

## 功能特性

- 离线运行，不上传文件。
- 递归扫描根目录下所有子文件夹。
- 根目录本身不会被重命名。
- 文件夹重命名支持人物前缀、主题提取和媒体统计后缀。
- 文件重命名使用纯序号格式，例如`001.jpg`、`002.jpg`、`001.mp4`。
- 图片和视频在同一文件夹内分别独立编号。
- 扫描前不强制输入人物名称。
- 文件夹名称清理支持普通文本删除、智能规则删除、高级正则删除、替换、添加、首尾空格和无用内容推荐。
- 所有操作先扫描、预览、确认，再执行。
- 冲突项会跳过，并继续处理后续可重命名项目。
- 支持执行进度、操作日志和撤销上次重命名。
- 不提供批量删除文件或目录功能。

## 当前开发状态

这是`werenameit 0.2.0-alpha.1`未发布版本目录。正式发布包尚未生成，后续会采用文件夹式Windows应用结构：

```text
APP/werenameit_0.2.0-alpha.1_Windows_x64/
  werenameit.exe
  app/
  docs/
  README_zh-CN.md
```

外层`werenameit.exe`将作为小启动器，真实Electron程序和运行依赖放在`app`目录中。

## 开发运行

安装依赖：

```powershell
npm.cmd install
```

启动桌面开发模式：

```powershell
npm.cmd run dev
```

运行测试：

```powershell
npm.cmd test
```

构建前端：

```powershell
npm.cmd run build
```

## 命名规则

文件夹命名：

```text
[人物名称] - 主题 [统计]
```

文件命名：

```text
001.jpg
002.jpg
001.mp4
002.mp4
```

文件夹名称清理示例：

```text
[Son Ye-Eun 손예은] - DJAWA Photo Vol 0216 - Staycation #5 [149P 2.99GB]
=> [Son Ye-Eun 손예은] - Staycation #5 [149P 2.99GB]

[Son Ye-Eun 손예은] - 048 ARTGRAVIA_VOL252 #1 [23P 33MB]
=> [Son Ye-Eun 손예은] - ARTGRAVIA_VOL252 #1 [23P 33MB]
```

## 安全说明

- 程序不包含批量删除文件或目录功能。
- 执行前必须预览。
- 目标重名时会跳过冲突项。
- 最近一次成功执行的重命名操作可以撤销。
- 建议首次处理真实资源前，先复制一份小样本目录测试。

## 许可证

本项目使用MIT License，详见[LICENSE](LICENSE)。
