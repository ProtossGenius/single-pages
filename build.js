const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 获取命令行参数
const [, , srcDir, destDir] = process.argv;

if (!srcDir || !destDir) {
  console.error('用法: node build.js <源目录> <目标目录>');
  process.exit(1);
}

/**
 * 递归处理目录
 */
function processDirectory(currentSrc, currentDest) {
  // 确保目标目录存在
  if (!fs.existsSync(currentDest)) {
    fs.mkdirSync(currentDest, { recursive: true });
  }

  const items = fs.readdirSync(currentSrc);

  items.forEach(item => {
    // 1. 跳过隐藏文件和目录 (以 . 开头)
    if (item.startsWith('.')) return;

    const srcPath = path.join(currentSrc, item);
    const destPath = path.join(currentDest, item);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      // 2. 如果是目录，递归处理
      processDirectory(srcPath, destPath);
    } else {
      // 3. 处理文件
      handleFile(srcPath, destPath);
    }
  });
}

/**
 * 处理单个文件逻辑
 */
function handleFile(src, dest) {
  const isJs = src.endsWith('.js');
  const isMinJs = src.endsWith('.min.js');

  // 逻辑：如果是普通 JS (非 .min.js)，则混淆压缩
  if (isJs && !isMinJs) {
    console.log(`[混淆压缩] ${src} -> ${dest}`);
    try {
      // 使用全局 terser 命令
      // --mangle: 混淆, --compress: 压缩, -o: 输出
      execSync(`terser "${src}" -o "${dest}" --mangle --compress`);
    } catch (err) {
      console.error(`[失败] 处理 ${src} 时出错:`, err.message);
      // 如果压缩失败，降级为直接拷贝，确保发布完整
      fs.copyFileSync(src, dest);
    }
  } else {
    // 逻辑：非 JS 文件或 *.min.js，直接递归拷贝
    console.log(`[直接拷贝] ${src} -> ${dest}`);
    fs.copyFileSync(src, dest);
  }
}

// 开始执行
console.log(`开始从 ${path.resolve(srcDir)} 发布到 ${path.resolve(destDir)}...`);
processDirectory(srcDir, destDir);
console.log('发布完成！');
