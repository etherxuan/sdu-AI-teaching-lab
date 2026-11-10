# AI 的眼睛 · 图像分类实验室

一个完全在浏览器里运行的 AI 图像分类体验网页：单页三栏，建立多个类别、给每类上传照片、用 RBF 核 SVM 训练模型，再用新照片测试。

- 不依赖服务器，所有计算在本机完成
- 照片只存在浏览器 IndexedDB，不上传网络
- 纯静态 HTML/CSS/JS，无构建步骤，可直接托管在 GitHub Pages
- 桌面端单页三栏（数据集 / 训练核心 / 测试舱），页面不上下滚动，列表在面板内滚动

## 本地预览

浏览器安全策略不允许 `file://` 页面使用 Worker 和 IndexedDB，请用本地服务器打开：

```bash
cd ai-eye-lab
python -m http.server 8000
```

然后访问 <http://localhost:8000/>。

## 部署到 GitHub Pages

1. 在 GitHub 新建仓库 `ai-eye-lab`（公开）。
2. 把本文件夹全部内容上传到仓库根目录（`index.html` 必须在根目录）。
3. 进入仓库 **Settings → Pages**：
   - Source 选择 **Deploy from a branch**
   - Branch 选择 **main**，目录选择 **/ (root)**
   - 保存。
4. 等 1–2 分钟，访问：

   <https://etherxuan.github.io/ai-eye-lab/>

之后每次修改文件，推送到 `main` 即可自动更新。

## 文件结构

```
ai-eye-lab/
├── index.html          页面结构
├── css/style.css       视觉样式（浅色科技感 / 青绿主色）
├── js/
│   ├── app.js          页面逻辑：类别、照片、训练、测试
│   ├── db.js           IndexedDB：类别与照片的本机存储
│   ├── features.js     照片预处理：居中裁剪、32×32、归一化
│   └── worker.js       后台线程：RBF 核 SVM 训练与预测
├── vendor/
│   ├── libsvm.js       libsvm-js 浏览器版（asm.js，约 300 KB）
│   └── LICENSE-libsvm  libsvm-js 的 MIT 许可证
├── favicon.svg
└── .nojekyll           告诉 GitHub Pages 不要用 Jekyll 处理
```

## 技术说明（给老师）

- **特征**：每张照片居中裁成正方形，缩到 32×32，RGB 三个通道归一化到 0—1，共 3072 个数字。
- **模型**：libsvm-js 的 C-SVC + RBF 核，`gamma=0.05`、`cost=10`；训练在 Web Worker 中进行，界面不会卡死。
- **结果条**：libsvm-js 这个版本的概率输出在小样本下会把标签判反，因此主答案用 `predictOne`，条形图改用“最像的 5 张训练照片”投票，既稳定又便于向学生解释。
- **数据**：类别和 160×160 缩略图、特征向量一起存在 IndexedDB；刷新不丢，清除浏览器数据会丢。
- **性能**：类别超过 6 个或单类超过 20 张时，页面会提示“训练可能要等十几秒”，但不阻止。

## 已知边界

- GitHub Pages 是静态托管，**每个学生的数据只在自己这台设备上**，不能全班共享一份模型。
- 没有账号、云同步、模型导出/导入；“清空全部数据”会删除全部类别和照片。
- 摄像头拍照需要 HTTPS（GitHub Pages 满足）；桌面浏览器上“拍照”按钮通常会退化为选择文件。
- 测试照片如果曾被用于训练，准确率会虚高——这正是课堂上可以讨论的“训练集/测试集分开”问题。

## 许可

`vendor/libsvm.js` 来自 [libsvm-js](https://github.com/mljs/libsvm)，MIT 许可证，见 `vendor/LICENSE-libsvm`。其余代码可随教材自由使用。
