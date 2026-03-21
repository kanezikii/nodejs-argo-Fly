const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

// === 配置信息 ===
const serverUrl = "https://wo.zhiairenqi.dpdns.org";
const token = "bDSbLtNbSXb7jEKI5DQJqB"; // ⚠️ 请务必替换！
const agentPath = path.join(__dirname, 'komari-agent');

// 1. 智能检测 CPU 架构 (兼容 AMD64 和 ARM64)
let cpuArch = os.arch();
let downloadArch = "amd64"; 
if (cpuArch === 'arm64' || cpuArch === 'aarch64') {
    downloadArch = "arm64";
} else if (cpuArch === 'arm') {
    downloadArch = "arm";
}
console.log(`[System] 检测到当前服务器 CPU 架构为: ${cpuArch}，将使用 ${downloadArch} 版本...`);

const agentUrl = `https://github.com/komari-monitor/komari-agent/releases/latest/download/komari-agent-linux-${downloadArch}`;

// 2. 原生下载函数 (彻底告别 wget 报错)
function downloadAgent(url, dest, cb) {
    https.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
            return downloadAgent(response.headers.location, dest, cb);
        }
        if (response.statusCode !== 200) {
            return cb(new Error(`下载失败，状态码: ${response.statusCode}`));
        }
        const file = fs.createWriteStream(dest);
        response.pipe(file);
        file.on('finish', () => {
            file.close(cb);
        });
    }).on('error', (err) => {
        fs.unlink(dest, () => {});
        cb(err);
    });
}

// 3. 启动 Agent 的函数 (带实时日志，一眼看出哪里报错)
function startAgent() {
    console.log("[System] 正在启动 Komari Agent...");
    
    fs.chmodSync(agentPath, '755');
    
    const child = spawn('./komari-agent', ['-e', serverUrl, '-t', token]);

    child.stdout.on('data', (data) => {
        console.log(`[Agent-正常日志] ${data.toString().trim()}`);
    });

    child.stderr.on('data', (data) => {
        console.error(`[Agent-报错日志] ${data.toString().trim()}`);
    });

    child.on('close', (code) => {
        console.log(`[System] Agent 进程退出 (退出码: ${code})。将在 10 秒后尝试重启...`);
        // 清理可能下载错误的残留文件
        if (code === 126) {
             if (fs.existsSync(agentPath)) fs.unlinkSync(agentPath);
        }
        setTimeout(startAgent, 10000);
    });
}

// 4. 主流程控制
function init() {
    if (fs.existsSync(agentPath)) {
        console.log("[System] 检测到核心程序已存在，直接启动...");
        startAgent();
    } else {
        console.log(`[System] 未找到核心程序，开始下载 ${agentUrl} ...`);
        downloadAgent(agentUrl, agentPath, (err) => {
            if (err) {
                console.error("[Error] 下载文件时发生错误:", err.message);
                setTimeout(init, 10000); 
                return;
            }
            console.log("[System] 下载完成！准备启动...");
            startAgent();
        });
    }
}

init();

// 5. 伪装 Web 服务 (防止容器因为没有开放端口而被面板强制休眠)
const port = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Komari Agent is perfectly running.\n');
});

server.listen(port, () => {
    console.log(`[System] 伪装 Web 服务已启动，正在监听端口 ${port}。`);
});