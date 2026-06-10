# SmartRenamer 0.1.5发布文件清单

本目录是面向最终用户的发布说明目录。主程序exe作为GitHub Release资产提供，不直接放入仓库历史。

## 包目录

```text
SmartRenamer_0.1.5_Windows_x64
```

## 文件清单

| 文件 | 说明 |
| --- | --- |
| `SmartRenamer_0.1.5_Windows_x64_Portable.exe` | Windows x64便携版主程序，作为GitHub Release资产提供。 |
| `README_zh-CN.md` | 发布包快速说明。 |
| `docs/UserGuide_zh-CN.md` | 中文用户手册。 |
| `docs/ReleaseNotes_0.1.5_zh-CN.md` | 0.1.5版本发布说明。 |
| `docs/FileManifest_0.1.5.md` | 发布包文件清单。 |
| `docs/Checksums_SHA256.md` | 主程序SHA256校验信息。 |

## 未包含内容

以下内容属于开发、缓存或构建中间产物，未复制到发布包：

- `src`
- `electron`
- `assets`
- `dist`
- `release/win-unpacked`
- `node_modules`
- `.npm-cache`
- `.electron-cache`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `vite.config.ts`
- `server.cjs`
- `index.html`

## 命名规范

发布目录命名格式：

```text
ProductName_Version_Platform_Architecture
```

程序文件命名格式：

```text
ProductName_Version_Platform_Architecture_PackageType.exe
```

当前发布文件：

```text
SmartRenamer_0.1.5_Windows_x64_Portable.exe
```
