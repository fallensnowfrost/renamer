# werenameit 0.2.0-alpha.1计划发布文件清单

状态：未发布版本 / Unreleased

## 计划目录

```text
werenameit_0.2.0-alpha.1_Windows_x64
```

## 计划文件清单

| 文件 | 说明 |
| --- | --- |
| `werenameit.exe` | 外层小启动器，用户双击此文件启动程序。 |
| `app/` | 真实Electron应用和运行依赖目录。 |
| `docs/UserGuide_zh-CN.md` | 中文用户手册。 |
| `docs/ReleaseNotes_0.2.0-alpha.1_zh-CN.md` | 未发布版本说明。 |
| `docs/FileManifest_0.2.0-alpha.1.md` | 发布文件清单。 |
| `docs/Checksums_SHA256.md` | SHA256校验信息。 |
| `README_zh-CN.md` | 发布包快速说明。 |

## 不进入Git仓库的内容

- `node_modules`
- `dist`
- `release`
- `APP/**/app`
- `APP/**/*.exe`
- `.npm-cache`
- `.electron-cache`
