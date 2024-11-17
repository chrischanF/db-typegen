const { minify_sync } = require('terser');
const { readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } = require('fs');
const { join, resolve } = require('path');
const prettier = require('prettier');
const path = require('path');

const encoding = 'utf8';
const getAllFiles = (dirPath, arrayOfFiles) => {
  const files = readdirSync(dirPath, encoding);

  arrayOfFiles = arrayOfFiles || [];

  for (const file of files) {
    if (statSync(dirPath + '/' + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + '/' + file, arrayOfFiles);
      continue;
    }
    arrayOfFiles.push(join(__dirname, dirPath, '/', file));
  }

  return arrayOfFiles.filter((path) => path.match(/\.js$/));
};

const minifyFiles = async (filePaths) => {
  const prettierPath = resolve(process.cwd(), '.prettierrc');
  const prettierConfig = JSON.parse(readFileSync(prettierPath, 'utf8'));
  for await (const filePath of filePaths) {
    writeFileSync(
      filePath,
      await prettier.format(minify_sync(readFileSync(filePath, encoding)).code, {
        ...prettierConfig,
        parser: 'babel',
      }),
    );
  }
};

const moveDistFiles = async () => {
  const files = ['package.json', 'README.md', 'LICENSE', 'schema.json'];
  for await (const file of files) {
    copyFileSync(path.join(__dirname, 'src', file), path.join(__dirname, 'dist', file));
  }
};

(() => {
  minifyFiles(getAllFiles('./dist'));
  moveDistFiles();
})();
