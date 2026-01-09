# aria2tui

一个交互式终端界面工具，用于快速配置并执行 aria2c 下载命令。

## 特性

✨ **交互式界面** - 直观的终端 UI，无需记忆复杂的命令行参数
📝 **历史记录** - 自动保存下载历史，支持恢复未完成的下载
📁 **文件浏览器** - 可视化选择种子文件和 Metalink 文件
🎯 **智能提取** - 自动从 URL 提取文件名
🔒 **输入验证** - 实时验证配置参数，防止错误
🎨 **美观界面** - 清晰的分组布局和颜色标识
⚡ **快速操作** - 丰富的快捷键支持
🗂️ **模块化设计** - 代码结构清晰，易于维护

## 安装

### 全局安装

```bash
npm install -g aria2tui
```

安装后可以直接在终端运行：

```bash
aria2tui
```

### 本地使用

```bash
# 克隆或下载本项目
chmod +x ./aria2tui.js
./aria2tui.js
```

## 平台支持

✅ **跨平台支持** - 支持主流操作系统：

- **macOS** - 完全支持
- **Linux** - 完全支持
- **Windows** - 完全支持（需要现代终端）

### Windows 用户注意事项

在 Windows 上推荐使用以下终端之一：
- **Windows Terminal**（推荐，Windows 10/11 默认）
- **PowerShell 7+**
- **Git Bash**
- **WSL (Windows Subsystem for Linux)**

⚠️ 不推荐使用旧版 CMD（Windows 7/8），因为对 ANSI 颜色支持有限。

## 前置要求

- Node.js >= 14.0.0
- aria2c 已安装（各平台安装方式：）
  - **macOS**: `brew install aria2`
  - **Linux**: `sudo apt install aria2` 或 `sudo yum install aria2`
  - **Windows**: 从 [aria2 GitHub](https://github.com/aria2/aria2/releases) 下载或使用 `choco install aria2`

## 使用方法

### 基本使用

直接运行命令启动交互界面：

```bash
aria2tui
# 或本地运行
./aria2tui.js
```

### 命令行选项

```bash
aria2tui [选项]

选项:
  --bin <path>      指定 aria2c 可执行文件路径（默认: aria2c）
  --config <path>   指定配置文件路径（默认: ~/.aria2tui.json）
  --help, -h        显示帮助信息
```

### 环境变量

```bash
export ARIA2_BIN=/usr/local/bin/aria2c           # aria2c 路径
export ARIA2TUI_CONFIG=$HOME/.aria2tui.json      # 配置文件路径
export ARIA2TUI_HISTORY=$HOME/.aria2tui_history.json  # 历史记录路径
```

## 快捷键

### 历史记录视图

- `↑/↓` 或 `j/k` - 上下选择
- `Enter` - 恢复选中的下载
- `n` - 新建下载
- `d` - 删除历史记录
- `q` - 退出程序

### 分组菜单

- `↑/↓` 或 `j/k` - 上下选择分组
- `Enter` - 进入选中的分组
- `u` - 快速设置下载链接
- `t` - 快速设置种子文件
- `p` - 预览命令
- `r` - 运行下载
- `s` - 保存配置
- `Esc` - 返回历史记录
- `q` - 退出程序

### 字段编辑

- `↑/↓` 或 `j/k` - 上下选择字段
- `Enter` - 编辑当前字段
- `Space` - 切换布尔选项
- `Esc` - 返回分组菜单
- `s` - 保存配置
- `q` - 退出程序

### 输入提示框

- 输入内容 - 编辑值
- `Backspace` - 删除字符
- `Enter` - 确认
- `Esc` - 取消

### 文件浏览器

- `↑/↓` 或 `j/k` - 上下选择
- `Enter` - 选择文件
- `Esc` - 取消并返回主界面

**支持的文件类型**：
- 🌱 `.torrent` - BT 种子文件
- 🔗 `.metalink` / `.meta4` - Metalink 下载文件
- 📄 `.txt` - URI 列表文件

> 说明：当前版本文件浏览器只列出“当前工作目录”的文件，不进入子目录。

## 功能介绍

### 历史记录管理

- 自动记录所有下载任务
- 显示下载状态：
  - ✓ 已完成
  - ✗ 已失败
  - ⋯ 进行中
- 支持恢复未完成的下载
- 重新下载完成的文件需要确认
- 最多保留 20 条历史记录

### 配置分组

#### 🔗 输入源（必填）
- 下载链接（支持多个 URL，空格分隔）
- 种子文件路径
- aria2 输入文件

#### 💾 保存设置
- 保存目录（默认: ~/Downloads）
- 输出文件名（自动从 URL 提取）
- 断点续传

#### ⚡ 性能优化
- 并发任务数（-j）
- 分片数（-s）
- 单服务器最大连接数（-x）
- 文件预分配方式（默认: none）
- 启用 mmap

#### 🚦 限速控制
- 下载限速（如 10M, 1G）
- 上传限速（用于 BT）

#### 🌱 种子设置
- 跟随种子下载
- 做种时长（分钟）

#### ⚙️ 高级选项
- User-Agent（-U）
- 证书校验
- 额外参数（直接拼接到命令）

### 输入验证

- **数字字段** - 实时检查是否为有效数字
- **路径字段** - 提示路径是否存在
- **速度限制** - 验证格式（如 10M, 1G, 500K）
- **彩色提示** - 绿色=有效，黄色=警告，红色=无效

## 使用示例

### 示例 1: 快速下载单个文件

1. 运行 `aria2tui`
2. 选择"+ 新建下载"或按 `n`
3. 按 `u` 输入下载链接（自动提取文件名）
4. 按 `r` 或 `Enter` 开始下载

### 示例 2: 恢复未完成的下载

1. 运行 `aria2tui`
2. 从历史记录中选择带 ⋯ 标记的下载
3. 按 `Enter` 恢复（所有配置自动恢复）

### 示例 3: BT 种子下载

1. 运行 `aria2tui`
2. 按 `n` 新建下载
3. 按 `t` 设置种子文件路径
4. 进入"种子设置"分组配置做种参数
5. 按 `r` 开始下载

## 配置文件

默认路径: `~/.aria2tui.json`

```json
{
  "uris": ["https://example.com/file.zip"],
  "dir": "/Users/username/Downloads",
  "out": "file.zip",
  "continue": true,
  "maxConcurrentDownloads": 5,
  "split": 16,
  "maxConnectionPerServer": 16,
  "fileAllocation": "none",
  "checkCertificate": true,
  "enableMmap": true
}
```

## 历史记录文件

默认路径: `~/.aria2tui_history.json`

```json
[
  {
    "id": 1704451200000,
    "timestamp": "2024-01-05T08:00:00.000Z",
    "status": "completed",
    "filename": "example.zip",
    "url": "https://example.com/example.zip",
    "config": { /* 完整配置快照 */ }
  }
]
```

## 常见问题

### Q: 如何指定自定义的 aria2c 路径？

```bash
aria2tui --bin /path/to/aria2c
# 或设置环境变量
export ARIA2_BIN=/path/to/aria2c
```

### Q: 配置会自动保存吗？

不会自动保存。按 `s` 键手动保存配置到文件，下次启动会自动加载。

### Q: 历史记录如何清理？

在历史记录视图按 `d` 删除单条，或直接删除 `~/.aria2tui_history.json` 文件。

### Q: 支持哪些 aria2c 参数？

常用参数都有对应字段。对于未列出的参数，使用"额外参数"字段直接填写。

### Q: 为什么要先设置输入源？

必须先设置下载链接、种子文件或输入文件，其他配置分组才会解锁。

## 许可证

MIT
