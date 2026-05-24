// 把 styles.css / data.js / app.js 内联进 index.html，产出单文件 dist 版本
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const css = readFileSync("styles.css", "utf8");
const data = readFileSync("data.js", "utf8");
const app = readFileSync("app.js", "utf8");

// 防御：内联脚本里若出现 </script> 会截断
for (const [n, s] of [["data.js", data], ["app.js", app]]) {
  if (/<\/script>/i.test(s)) throw new Error(`${n} 含有 </script>，无法安全内联`);
}

let out = html
  .replace('<link rel="stylesheet" href="styles.css" />', `<style>\n${css}\n</style>`)
  .replace('<script src="data.js"></script>', `<script>\n${data}\n</script>`)
  .replace('<script src="app.js"></script>', `<script>\n${app}\n</script>`);

mkdirSync("dist", { recursive: true });
writeFileSync("dist/xuanji-divination.html", out, "utf8");
console.log("written dist/xuanji-divination.html  (" + out.length + " bytes)");
