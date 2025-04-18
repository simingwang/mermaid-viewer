# @newmo-oss/mermaid-viewer

用户友好的[Mermaid](https://mermaid.js.org/)图表查看工具

## 网站

- <https://newmo-oss.github.io/mermaid-viewer/>

## 项目背景

Mermaid 是一款优秀的图表生成工具，但其默认查看器缺乏交互功能。

[@newmo-oss/mermaid-viewer](https://newmo-oss.github.io/mermaid-viewer/) 提供以下增强功能：
- 支持缩放操作的交互式图表查看
- 分步查看时序图功能
- 新增「下载为PNG」导出功能

![功能演示](https://github.com/newmo-oss/mermaid-viewer/assets/19714/9b78b1fc-0b74-4233-948d-ff46f484bbe8)

## 功能特性

- **时序图交互控制器**
  - 默认启用自动编号（autonumber）
  - 支持跳转至指定步骤
- **画布缩放功能**
  - 鼠标滚轮缩放
  - 移动设备双指缩放
- **网页嵌入支持**
  - 通过URL参数`?text=<URL编码的Mermaid文本>`嵌入图表
- **新增导出功能**
  - 在工具栏添加「下载为PNG」按钮
  - 自动处理CSP安全策略
  - 支持SVG转PNG格式导出（基于Canvas实现）

## 环境要求
- Node.js 版本 >=6.9.0
- 推荐使用nvm管理Node版本

## 使用指南
1. 安装nvm（Windows用户使用nvm-windows）
```bash
# 安装nvm 1.1.12版本
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v1.1.12/install.sh | bash
```

1. 访问 <http://118.145.179.58/>
2. 输入或粘贴Mermaid文本
3. 点击「渲染」按钮
4. 使用工具栏功能操作图表
5. 点击「下载」按钮导出PNG

## URL参数说明

| 参数 | 示例值 | 功能说明 |
|------|--------|---------|
| sequence-number | 10 | 时序图起始编号 |
| # | 压缩后的文本 | 使用DEFLATE压缩算法编码的Mermaid文本 |

### 跨域解决方案
```javascript
// SVG转PNG实现核心代码
const svgToPng = (svgBlob) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(resolve, 'image/png');
    };
    img.src = URL.createObjectURL(svgBlob);
  });
};
```

## GitHub Actions集成

```yaml
name: 添加Mermaid查看链接
on:
  pull_request:
    paths:
      - '**/*.md'

jobs:
  mermaid-notice:
    runs-on: ubuntu-latest
    steps:
      - name: 检出代码
        uses: actions/checkout@v4
      
      - name: 设置Node环境
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: 分析变更文件
        id: changed-files
        uses: tj-actions/changed-files@v20576b4b
        with:
          separator: ","
          files: "**/*.md"

      - name: 生成查看链接
        uses: actions/github-script@v7
        env:
          CHANGED_FILES: ${{ steps.changed-files.outputs.all_changed_files }}
        with:
          script: |
            // 此处保留原有压缩逻辑，增加中文注释说明
            // 自动检测MD文件中的mermaid代码块
            // 生成带压缩参数的查看链接
            // 在PR中创建交互式通知
```

## 测试运行

安装依赖后执行测试命令：

    npm test

## 贡献指南

欢迎提交Pull Request，请遵循以下流程：
1. Fork项目仓库
2. 创建特性分支（git checkout -b feature/新特性）
3. 提交变更（git commit -am '添加新特性'）
4. 推送分支（git push origin feature/新特性）
5. 创建Pull Request

## 开源协议

MIT License © newmo, Inc.