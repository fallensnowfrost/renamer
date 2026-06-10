# SmartRenamer

SmartRenamer是一个离线Windows桌面客户端，用于批量整理人物媒体资源目录。它可以递归扫描子文件夹，预览并执行文件夹重命名、图片/视频纯序号重命名、文件夹名称文本清理和首尾空格清理。

> 当前版本：0.1.5  
> 支持平台：Windows x64  
> 包类型：Portable exe

## 功能特性

- 离线运行，不上传文件。
- 递归扫描根目录下所有子文件夹。
- 根目录本身不会被重命名。
- 文件夹重命名支持人物前缀、主题提取和媒体统计后缀。
- 文件重命名使用纯序号格式，例如`001.jpg`、`002.jpg`、`001.mp4`。
- 图片和视频在同一文件夹内分别独立编号。
- 扫描前不强制输入人物名称。
- 支持文件名自然排序、修改时间排序和创建时间排序。
- 支持删除前缀、删除后缀、删除自定义内容、添加前后缀、文本替换和删除首尾空格。
- 所有操作先扫描、预览、确认，再执行。
- 冲突项会跳过，并继续处理后续可重命名项目。
- 支持执行进度、操作日志和撤销上次重命名。
- 不提供批量删除文件或目录功能。

## 下载和运行

从GitHub Releases下载便携版主程序：

```text
SmartRenamer_0.1.5_Windows_x64_Portable.exe
```

双击exe即可运行。若Windows出现安全提醒，请确认文件来源可信后再选择继续运行。

发布文档保存在：

```text
APP/SmartRenamer_0.1.5_Windows_x64
```

## 使用流程

1. 选择根文件夹。
2. 按需输入人物名称。
3. 选择排序方式。
4. 点击“扫描/Scan”。
5. 在预览区检查目标名称、警告和冲突。
6. 点击对应按钮执行文件夹重命名、文件重命名或文本清理。

## 命名规则

### 文件夹命名

输入人物名称后，文件夹目标名称会尽量规范为：

```text
[人物名称] - 主题 [统计]
```

示例：

```text
[Son Ye-Eun 손예은] - [BLUECAKE] BunnyLuXXX [99P 887MB]
```

统计规则：

- 图片计为`P`。
- 视频计为`V`。
- 没有视频时省略`V`。
- 小于1GB显示MB。
- 大于等于1GB显示GB，并保留两位小数。
- 每个文件夹只统计当前层直接包含的图片和视频。

### 文件命名

文件名只包含序号和原扩展名：

```text
001.jpg
002.jpg
001.mp4
002.mp4
```

编号位数由当前文件夹内同类型媒体数量决定：

```text
1到9个：1.ext
10到99个：01.ext
100到999个：001.ext
1000到9999个：0001.ext
```

## 开发运行

安装依赖：

```powershell
npm.cmd install
```

启动桌面开发模式：

```powershell
npm.cmd run dev
```

构建前端：

```powershell
npm.cmd run build
```

打包Windows便携版：

```powershell
npm.cmd run package
```

## 发布包结构

当前发布文档位于：

```text
APP/SmartRenamer_0.1.5_Windows_x64
```

仓库内包含：

- `README_zh-CN.md`
- `docs/UserGuide_zh-CN.md`
- `docs/ReleaseNotes_0.1.5_zh-CN.md`
- `docs/FileManifest_0.1.5.md`
- `docs/Checksums_SHA256.md`

主程序exe作为GitHub Release资产发布，不直接放入仓库历史。

SHA256：

```text
00362CB9B7A0B1030E4F8F0B96993D830EF67C25B0240BA2C78E873B19254891
```

## 安全说明

- 程序不包含批量删除文件或目录功能。
- 执行前必须预览。
- 目标重名时会跳过冲突项。
- 最近一次成功执行的重命名操作可以撤销。
- 建议首次处理真实资源前，先复制一份小样本目录测试。

## 许可证

本项目使用MIT License，详见[LICENSE](LICENSE)。
