#!/usr/bin/env node

const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
require('dotenv').config();
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync, spawn } = require('child_process');
const https = require('https');

// ================== 基础配置 ==================
const UPLOAD_URL = process.env.UPLOAD_URL || '';      
const PROJECT_URL = process.env.PROJECT_URL || '';    
const AUTO_ACCESS = process.env.AUTO_ACCESS || false; 
const YT_WARPOUT = process.env.YT_WARPOUT || false;   
const FILE_PATH = process.env.FILE_PATH || '.npm';    
const SUB_PATH = process.env.SUB_PATH || 'sub';       
const UUID = process.env.UUID || '0a6568ff-ea3c-4271-9020-450560e10d64';  

// ================== 节点与隧道配置 ==================
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || '';           
const ARGO_AUTH = process.env.ARGO_AUTH || '';               
const ARGO_PORT = process.env.ARGO_PORT || 8001;             
const S5_PORT = process.env.S5_PORT || '';                   
const TUIC_PORT = process.env.TUIC_PORT || '';               
const HY2_PORT = process.env.HY2_PORT || '';                 
const ANYTLS_PORT = process.env.ANYTLS_PORT || '';           
const REALITY_PORT = process.env.REALITY_PORT || '';         
const ANYREALITY_PORT = process.env.ANYREALITY_PORT || '';   
const CFIP = process.env.CFIP || 'saas.sin.fan';             
const CFPORT = process.env.CFPORT || 443;                    
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;                       
const NAME = process.env.NAME || 'MyNode';                         
const DISABLE_ARGO = process.env.DISABLE_ARGO || false;      

// ================== TG 推送配置 (已内置) ==================
const CHAT_ID = process.env.CHAT_ID || '6499138234';                   
const BOT_TOKEN = process.env.BOT_TOKEN || '8490493179:AAG1Q5pkFNkUzR2E5pSm8OpJa_SPZNf32Mw';               

// ================== Komari 探针配置 ==================
const KOMARI_SERVER = process.env.KOMARI_SERVER || 'https://wo.zhiairenqi.dpdns.org'; 
// ⚠️ 如果你不想在此处写死，也可以在环境变量面板填入 KOMARI_TOKEN
const KOMARI_TOKEN = process.env.KOMARI_TOKEN || 'ikTDW667hhLtLTWjIaLZTH'; 


// 创建运行文件夹
if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH);
  console.log(`${FILE_PATH} is created`);
} else {
  console.log(`${FILE_PATH} already exists`);
}

let privateKey = '';
let publicKey = '';

// 生成随机6位字符函数
function generateRandomName() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 生成随机名称
const webRandomName = generateRandomName();
const botRandomName = generateRandomName();

// 使用随机文件名定义路径
let webPath = path.join(FILE_PATH, webRandomName);
let botPath = path.join(FILE_PATH, botRandomName);
let subPath = path.join(FILE_PATH, 'sub.txt');
let listPath = path.join(FILE_PATH, 'list.txt');
let bootLogPath = path.join(FILE_PATH, 'boot.log');
let configPath = path.join(FILE_PATH, 'config.json');

function deleteNodes() {
  try {
    if (!UPLOAD_URL) return;
    const subP = path.join(FILE_PATH, 'sub.txt');
    if (!fs.existsSync(subP)) return;

    let fileContent;
    try { fileContent = fs.readFileSync(subP, 'utf-8'); } catch { return null; }

    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));

    if (nodes.length === 0) return;
    return axios.post(`${UPLOAD_URL}/api/delete-nodes`, JSON.stringify({ nodes }), { headers: { 'Content-Type': 'application/json' } }).catch(() => null);
  } catch (err) {
    return null;
  }
}

// 端口验证函数
function isValidPort(port) {
  try {
    if (port === null || port === undefined || port === '') return false;
    if (typeof port === 'string' && port.trim() === '') return false;
    const portNum = parseInt(port);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) return false;
    return true;
  } catch (error) {
    return false;
  }
}

// 清理历史文件 (已彻底移除 Nezha 相关文件清理)
const pathsToDelete = [ webRandomName, botRandomName, 'boot.log', 'list.txt'];
function cleanupOldFiles() {
  pathsToDelete.forEach(file => {
    fs.unlink(path.join(FILE_PATH, file), () => {});
  });
}

// 获取固定隧道json
function argoType() {
  if (DISABLE_ARGO === 'true' || DISABLE_ARGO === true) return;
  if (!ARGO_AUTH || !ARGO_DOMAIN) return;

  if (ARGO_AUTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
    const tunnelYaml = `
  tunnel: ${ARGO_AUTH.split('"')[11]}
  credentials-file: ${path.join(FILE_PATH, 'tunnel.json')}
  protocol: http2
  
  ingress:
    - hostname: ${ARGO_DOMAIN}
      service: http://localhost:${ARGO_PORT}
      originRequest:
        noTLSVerify: true
    - service: http_status:404
  `;
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
  }
}

// 判断系统架构
function getSystemArchitecture() {
  const arch = os.arch();
  return (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') ? 'arm' : 'amd';
}

// 下载对应系统架构的依赖文件
function downloadFile(fileName, fileUrl, callback) {
  const fPath = path.join(FILE_PATH, fileName);
  const writer = fs.createWriteStream(fPath);

  axios({ method: 'get', url: fileUrl, responseType: 'stream' })
    .then(response => {
      response.data.pipe(writer);
      writer.on('finish', () => { writer.close(); callback(null, fileName); });
      writer.on('error', err => { fs.unlink(fPath, () => { }); callback(err.message); });
    })
    .catch(err => callback(err.message));
}

// 下载并运行核心文件
async function downloadFilesAndRun() {
  const architecture = getSystemArchitecture();
  let filesToDownload = [];
  
  if (architecture === 'arm') {
    filesToDownload = [
      { fileName: "web", fileUrl: "https://arm64.ssss.nyc.mn/sb" },
      { fileName: "bot", fileUrl: "https://arm64.ssss.nyc.mn/bot" }
    ];
  } else {
    filesToDownload = [
      { fileName: "web", fileUrl: "https://amd64.ssss.nyc.mn/sb" },
      { fileName: "bot", fileUrl: "https://amd64.ssss.nyc.mn/bot" }
    ];
  }

  const renamedFiles = filesToDownload.map(file => {
    let newFileName = file.fileName === 'web' ? webRandomName : botRandomName;
    return { ...file, fileName: newFileName };
  });

  const downloadPromises = renamedFiles.map(fileInfo => {
    return new Promise((resolve, reject) => {
      downloadFile(fileInfo.fileName, fileInfo.fileUrl, (err, fName) => {
        if (err) reject(err); else resolve(fName);
      });
    });
  });

  try { await Promise.all(downloadPromises); } catch (err) { return; }

  // 授权文件
  [webRandomName, botRandomName].forEach(relativeFilePath => {
    const absoluteFilePath = path.join(FILE_PATH, relativeFilePath);
    if (fs.existsSync(absoluteFilePath)) {
      fs.chmod(absoluteFilePath, 0o775, () => {});
    }
  });
  
  // 生成 reality-keypair
  const keyFilePath = path.join(FILE_PATH, 'key.txt');

  if (fs.existsSync(keyFilePath)) {
    const content = fs.readFileSync(keyFilePath, 'utf8');
    privateKey = (content.match(/PrivateKey:\s*(.*)/) || [])[1] || '';
    publicKey = (content.match(/PublicKey:\s*(.*)/) || [])[1] || '';
    continueExecution();
  } else {
    exec(`${path.join(FILE_PATH, webRandomName)} generate reality-keypair`, async (err, stdout) => {
      if (!err) {
        privateKey = (stdout.match(/PrivateKey:\s*(.*)/) || [])[1] || '';
        publicKey = (stdout.match(/PublicKey:\s*(.*)/) || [])[1] || '';
        if (privateKey && publicKey) {
            fs.writeFileSync(keyFilePath, `PrivateKey: ${privateKey}\nPublicKey: ${publicKey}\n`, 'utf8');
        }
      }
      continueExecution();
    });
  }

  function continueExecution() {
    exec('which openssl || where.exe openssl', async (err, stdout) => {
        if (err || stdout.trim() === '') {
          const privateKeyContent = `-----BEGIN EC PARAMETERS-----\nBggqhkjOPQMBBw==\n-----END EC PARAMETERS-----\n-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIM4792SEtPqIt1ywqTd/0bYidBqpYV/++siNnfBYsdUYoAoGCCqGSM49\nAwEHoUQDQgAE1kHafPj07rJG+HboH2ekAI4r+e6TL38GWASANnngZreoQDF16ARa\n/TsyLyFoPkhLxSbehH/NBEjHtSZGaDhMqQ==\n-----END EC PRIVATE KEY-----`;
          fs.writeFileSync(path.join(FILE_PATH, 'private.key'), privateKeyContent);
          const certContent = `-----BEGIN CERTIFICATE-----\nMIIBejCCASGgAwIBAgIUfWeQL3556PNJLp/veCFxGNj9crkwCgYIKoZIzj0EAwIw\nEzERMA8GA1UEAwwIYmluZy5jb20wHhcNMjUwOTE4MTgyMDIyWhcNMzUwOTE2MTgy\nMDIyWjATMREwDwYDVQQDDAhiaW5nLmNvbTBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABNZB2nz49O6yRvh26B9npACOK/nuky9/BlgEgDZ54Ga3qEAxdegEWv07Mi8h\naD5IS8Um3oR/zQRIx7UmRmg4TKmjUzBRMB0GA1UdDgQWBBTV1cFID7UISE7PLTBR\nBfGbgkrMNzAfBgNVHSMEGDAWgBTV1cFID7UISE7PLTBRBfGbgkrMNzAPBgNVHRMB\nAf8EBTADAQH/MAoGCCqGSM49BAMCA0cAMEQCIAIDAJvg0vd/ytrQVvEcSm6XTlB+\neQ6OFb9LbLYL9f+sAiAffoMbi4y/0YUSlTtz7as9S8/lciBF5VCUoVIKS+vX2g==\n-----END CERTIFICATE-----`;
          fs.writeFileSync(path.join(FILE_PATH, 'cert.pem'), certContent);
        } else {
            try {
                await execPromise(`openssl ecparam -genkey -name prime256v1 -out "${path.join(FILE_PATH, 'private.key')}"`);
                await execPromise(`openssl req -new -x509 -days 3650 -key "${path.join(FILE_PATH, 'private.key')}" -out "${path.join(FILE_PATH, 'cert.pem')}" -subj "/CN=bing.com"`);
            } catch (err) {}
        }

    // 生成 sbX 配置文件
    const config = {
      "log": { "disabled": true, "level": "error", "timestamp": true },
      "inbounds": [{
          "tag": "vmess-ws-in", "type": "vmess", "listen": "::", "listen_port": ARGO_PORT,
          "users": [{ "uuid": UUID }],
          "transport": { "type": "ws", "path": "/vmess-argo", "early_data_header_name": "Sec-WebSocket-Protocol" }
      }],
      "endpoints": [{
          "type": "wireguard", "tag": "wireguard-out", "mtu": 1280,
          "address": ["172.16.0.2/32", "2606:4700:110:8dfe:d141:69bb:6b80:925/128"],
          "private_key": "YFYOAdbw1bKTHlNNi+aEjBM3BO7unuFC5rOkMRAz9XY=",
          "peers": [{ "address": "engage.cloudflareclient.com", "port": 2408, "public_key": "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=", "allowed_ips": ["0.0.0.0/0", "::/0"], "reserved": [78, 135, 76] }]
      }],
      "outbounds": [{ "type": "direct", "tag": "direct" }],
      "route": {
        "rule_set": [
          { "tag": "netflix", "type": "remote", "format": "binary", "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/netflix.srs", "download_detour": "direct" },
          { "tag": "openai", "type": "remote", "format": "binary", "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/openai.srs", "download_detour": "direct" }
        ],
        "rules": [{ "rule_set": ["openai", "netflix"], "outbound": "wireguard-out" }],
        "final": "direct"
      }
    };

    try {
      if (isValidPort(REALITY_PORT)) {
        config.inbounds.push({ "tag": "vless-in", "type": "vless", "listen": "::", "listen_port": parseInt(REALITY_PORT), "users": [{ "uuid": UUID, "flow": "xtls-rprx-vision" }], "tls": { "enabled": true, "server_name": "www.iij.ad.jp", "reality": { "enabled": true, "handshake": { "server": "www.iij.ad.jp", "server_port": 443 }, "private_key": privateKey, "short_id": [""] } } });
      }
      if (isValidPort(HY2_PORT)) {
        config.inbounds.push({ "tag": "hysteria-in", "type": "hysteria2", "listen": "::", "listen_port": parseInt(HY2_PORT), "users": [{ "password": UUID }], "masquerade": "https://bing.com", "tls": { "enabled": true, "alpn": ["h3"], "certificate_path": path.join(FILE_PATH, "cert.pem"), "key_path": path.join(FILE_PATH, "private.key") } });
      }
      if (isValidPort(TUIC_PORT)) {
        config.inbounds.push({ "tag": "tuic-in", "type": "tuic", "listen": "::", "listen_port": parseInt(TUIC_PORT), "users": [{ "uuid": UUID }], "congestion_control": "bbr", "tls": { "enabled": true, "alpn": ["h3"], "certificate_path": path.join(FILE_PATH, "cert.pem"), "key_path": path.join(FILE_PATH, "private.key") } });
      }
      if (isValidPort(S5_PORT)) {
        config.inbounds.push({ "tag": "s5-in", "type": "socks", "listen": "::", "listen_port": parseInt(S5_PORT), "users": [{ "username": UUID.substring(0, 8), "password": UUID.slice(-12) }] });
      }
      if (isValidPort(ANYTLS_PORT)) {
        config.inbounds.push({ "tag": "anytls-in", "type": "anytls", "listen": "::", "listen_port": parseInt(ANYTLS_PORT), "users": [{ "password": UUID }], "tls": { "enabled": true, "certificate_path": path.join(FILE_PATH, "cert.pem"), "key_path": path.join(FILE_PATH, "private.key") } });
      }
    } catch (error) {}

    fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));

    // 运行代理核心
    const command1 = `nohup ${path.join(FILE_PATH, webRandomName)} run -c ${path.join(FILE_PATH, 'config.json')} >/dev/null 2>&1 &`;
    try {
      await execPromise(command1);
      console.log('web (Proxy Core) is running');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {}

    // 运行 cloudflared (argo)
    if (DISABLE_ARGO !== 'true' && DISABLE_ARGO !== true && fs.existsSync(path.join(FILE_PATH, botRandomName))) {
        let args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${path.join(FILE_PATH, 'boot.log')} --loglevel info --url http://localhost:${ARGO_PORT}`;
        if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
        else if (ARGO_AUTH.match(/TunnelSecret/)) args = `tunnel --edge-ip-version auto --config ${path.join(FILE_PATH, 'tunnel.yml')} run`;

        try {
          await execPromise(`nohup ${path.join(FILE_PATH, botRandomName)} ${args} >/dev/null 2>&1 &`);
          console.log('bot (Argo Tunnel) is running');
        } catch (error) {}
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
    await extractDomains();
    });
  };
}

function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => { if (error) reject(error); else resolve(stdout || stderr); });
  });
}

async function extractDomains() {
  if (DISABLE_ARGO === 'true' || DISABLE_ARGO === true) {
    await generateLinks(null); return;
  }
  let argoDomain = ARGO_DOMAIN;
  if (!argoDomain) {
    try {
      const fileContent = fs.readFileSync(path.join(FILE_PATH, 'boot.log'), 'utf-8');
      const domainMatch = fileContent.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
      if (domainMatch) argoDomain = domainMatch[1];
    } catch (error) {}
  }
  
  if (argoDomain) {
      await generateLinks(argoDomain);
  } else {
      setTimeout(extractDomains, 3000); // 没拿到则等3秒后重试
  }
}

async function getMetaInfo() {
  try {
    const res = await axios.get('http://ip-api.com/json', { timeout: 3000 });
    if (res.data && res.data.countryCode) return `${res.data.countryCode}-${res.data.org}`.replace(/\s+/g, '_');
  } catch (error) {}
  return 'Unknown';
}

async function generateLinks(argoDomain) {
  let SERVER_IP = '127.0.0.1';
  try { SERVER_IP = execSync('curl -sm 3 ipv4.ip.sb').toString().trim(); } catch (e) {}

  const ISP = await getMetaInfo();
  const nodeName = NAME ? `${NAME}-${ISP}` : ISP;
  
  setTimeout(() => {
      let subTxt = '';
      if ((DISABLE_ARGO !== 'true' && DISABLE_ARGO !== true) && argoDomain) {
        subTxt = `vmess://${Buffer.from(JSON.stringify({ v: '2', ps: `${nodeName}`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'auto', net: 'ws', type: 'none', host: argoDomain, path: '/vmess-argo?ed=2560', tls: 'tls', sni: argoDomain, alpn: '', fp: 'firefox'})).toString('base64')}`;
      }
      if (isValidPort(TUIC_PORT)) subTxt += `\ntuic://${UUID}:@${SERVER_IP}:${TUIC_PORT}?sni=www.bing.com&congestion_control=bbr&udp_relay_mode=native&alpn=h3&allow_insecure=1#${nodeName}`;
      if (isValidPort(HY2_PORT)) subTxt += `\nhysteria2://${UUID}@${SERVER_IP}:${HY2_PORT}/?sni=www.bing.com&insecure=1&alpn=h3&obfs=none#${nodeName}`;
      if (isValidPort(REALITY_PORT)) subTxt += `\nvless://${UUID}@${SERVER_IP}:${REALITY_PORT}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.iij.ad.jp&fp=firefox&pbk=${publicKey}&type=tcp&headerType=none#${nodeName}`;

      fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
      fs.writeFileSync(listPath, subTxt, 'utf8');
      sendTelegram(); 
      
      app.get(`/${SUB_PATH}`, (req, res) => {
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(Buffer.from(subTxt).toString('base64'));
      });
  }, 2000);
}

// 自动访问和清理
function cleanFiles() {
  setTimeout(() => {
    const filesToDelete = [bootLogPath, configPath, listPath, webPath, botPath].map(f => path.join(FILE_PATH, path.basename(f)));
    exec(`rm -rf ${filesToDelete.join(' ')} >/dev/null 2>&1`, () => console.log('Cleanup completed!'));
  }, 90000); 
}

async function sendTelegram() {
  try {
      const message = fs.readFileSync(path.join(FILE_PATH, 'sub.txt'), 'utf8');
      const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
      const escapedName = NAME.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
      await axios.post(url, null, { params: { chat_id: CHAT_ID, text: `**${escapedName}节点推送通知**\n\`\`\`${message}\`\`\``, parse_mode: 'MarkdownV2' } });
      console.log('Telegram 节点消息推送成功！');
  } catch (error) { console.error('TG 推送失败', error.message); }
}

// ==========================================
// ====== Komari Agent 部署逻辑 (无缝融合) ======
// ==========================================
(function initKomariAgent() {
    // 【修改点 1】Token 检查逻辑：如果为空，打印警告并跳过 Komari 启动，但不影响代理节点
    if (!KOMARI_TOKEN || KOMARI_TOKEN.trim() === '') {
        console.log('\x1b[31m%s\x1b[0m', "======================================================");
        console.log('\x1b[31m%s\x1b[0m', "⚠️  警告: 你没有填写 Komari Token！");
        console.log('\x1b[31m%s\x1b[0m', "请在代码的第 33 行修改 KOMARI_TOKEN，或者在环境变量中设置。");
        console.log('\x1b[31m%s\x1b[0m', "系统将跳过 Komari Agent 的运行 (代理节点不受影响)。");
        console.log('\x1b[31m%s\x1b[0m', "======================================================");
        return; 
    }

    const agentPath = path.join(__dirname, 'komari-agent');
    let cpuArch = os.arch();
    let downloadArch = (cpuArch === 'arm64' || cpuArch === 'aarch64') ? 'arm64' : (cpuArch === 'arm' ? 'arm' : 'amd64');
    
    console.log(`[Komari] 架构: ${cpuArch}，准备使用 ${downloadArch} 版本...`);
    const agentUrl = `https://github.com/komari-monitor/komari-agent/releases/latest/download/komari-agent-linux-${downloadArch}`;

    function downloadAgent(url, dest, cb) {
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) return downloadAgent(response.headers.location, dest, cb);
            if (response.statusCode !== 200) return cb(new Error(`下载失败: ${response.statusCode}`));
            const file = fs.createWriteStream(dest);
            response.pipe(file);
            file.on('finish', () => file.close(cb));
        }).on('error', (err) => { fs.unlink(dest, () => {}); cb(err); });
    }

    function startAgent() {
        console.log("[Komari] 正在启动 Komari Agent...");
        if(fs.existsSync(agentPath)) fs.chmodSync(agentPath, '755');
        
        const child = spawn(agentPath, ['-e', KOMARI_SERVER, '-t', KOMARI_TOKEN]);

        child.stdout.on('data', (data) => console.log(`[Komari] ${data.toString().trim()}`));
        child.stderr.on('data', (data) => console.error(`[Komari-报错] ${data.toString().trim()}`));
        child.on('close', (code) => {
            console.log(`[Komari] 进程异常退出 (代码: ${code})。将在 10 秒后重启...`);
            if (code === 126 && fs.existsSync(agentPath)) fs.unlinkSync(agentPath);
            setTimeout(startAgent, 10000);
        });
    }

    function init() {
        if (fs.existsSync(agentPath)) {
            startAgent();
        } else {
            downloadAgent(agentUrl, agentPath, (err) => {
                if (err) {
                    console.error("[Komari] 下载报错:", err.message);
                    setTimeout(init, 10000); 
                    return;
                }
                startAgent();
            });
        }
    }
    init();
})();

// ================== 启动主流程 ==================
async function startserver() {
  deleteNodes();
  cleanupOldFiles();
  argoType();
  await downloadFilesAndRun();
  cleanFiles();
}
startserver();

// 大神原版自带的 Web 伪装保活服务 (防容器休眠)
app.get("/", async function(req, res) {
  res.send("Hello world!<br><br>Proxy Node + Komari Agent perfectly running.");
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Web server is running on port:${PORT}!`);
});
