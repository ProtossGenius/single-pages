window.SCRIPT_TYPE_OPTIONS = [
  { value: "bash", label: "Bash" },
  { value: "python", label: "Python" },
  { value: "nginx", label: "Nginx" },
  { value: "plaintext", label: "Plain Text" }
];

window.SCRIPT_LIST = [
  {
    id: "runhttps",
    title: "runhttps: 目录一键 HTTPS",
    description: "在指定目录启动 HTTPS 静态服务；若证书不存在会自动生成 cert.pem 和 key.pem。",
    keywords: ["https", "python", "openssl", "静态文件", "临时服务", "证书"],
    defaultType: "bash",
    types: ["bash", "python", "plaintext"],
    template: "cd {{serve_dir}} && ( [ -f {{pem_dir}}/cert.pem ] && [ -f {{pem_dir}}/key.pem ] || openssl req -x509 -newkey rsa:2048 -nodes -keyout {{pem_dir}}/key.pem -out {{pem_dir}}/cert.pem -days 365 -subj '/CN=localhost' ) && python3 -c \"import http.server,ssl;s=http.server.ThreadingHTTPServer(('0.0.0.0',{{port}}),http.server.SimpleHTTPRequestHandler);c=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);c.load_cert_chain('{{pem_dir}}/cert.pem','{{pem_dir}}/key.pem');s.socket=c.wrap_socket(s.socket,server_side=True);print('Serving HTTPS on 0.0.0.0:{{port}}');s.serve_forever()\"",
    params: [
      {
        key: "serve_dir",
        label: "服务目录",
        description: "要开放 HTTPS 的目录",
        defaultValue: ".",
        placeholder: ".",
        inputType: "text"
      },
      {
        key: "pem_dir",
        label: "PEM 存储路径",
        description: "默认将 cert/key 存到 /tmp",
        defaultValue: "/tmp",
        placeholder: "/tmp",
        inputType: "text"
      },
      {
        key: "port",
        label: "开放端口",
        description: "HTTPS 监听端口",
        defaultValue: "8443",
        placeholder: "8443",
        inputType: "number"
      }
    ]
  },
  {
    id: "caddy-reverse-proxy",
    title: "Caddy 反向代理",
    description: "快速把本机端口流量反向代理到上游 HTTP 服务，适合临时联调。",
    keywords: ["反向代理", "reverse proxy", "caddy", "网关", "转发"],
    defaultType: "bash",
    types: ["bash", "plaintext"],
    template: "caddy reverse-proxy --from :{{listen_port}} --to {{upstream}}",
    params: [
      {
        key: "listen_port",
        label: "本地监听端口",
        description: "对外暴露的端口",
        defaultValue: "8080",
        placeholder: "8080",
        inputType: "number"
      },
      {
        key: "upstream",
        label: "上游地址",
        description: "被代理的目标地址",
        defaultValue: "http://127.0.0.1:3000",
        placeholder: "http://127.0.0.1:3000",
        inputType: "text"
      }
    ]
  },
  {
    id: "ssh-reverse-tunnel",
    title: "SSH 反向隧道",
    description: "把本地服务暴露到远程机器端口，常用于内网穿透临时演示。",
    keywords: ["ssh", "反向代理", "隧道", "内网穿透", "remote forwarding"],
    defaultType: "bash",
    types: ["bash", "plaintext"],
    template: "ssh -NT -R {{remote_port}}:127.0.0.1:{{local_port}} {{ssh_user}}@{{ssh_host}}",
    params: [
      {
        key: "remote_port",
        label: "远程端口",
        description: "远程机器开放的端口",
        defaultValue: "18080",
        placeholder: "18080",
        inputType: "number"
      },
      {
        key: "local_port",
        label: "本地端口",
        description: "本地待暴露服务端口",
        defaultValue: "3000",
        placeholder: "3000",
        inputType: "number"
      },
      {
        key: "ssh_user",
        label: "SSH 用户",
        description: "远程登录用户名",
        defaultValue: "root",
        placeholder: "root",
        inputType: "text"
      },
      {
        key: "ssh_host",
        label: "SSH 主机",
        description: "远程主机地址",
        defaultValue: "example.com",
        placeholder: "example.com",
        inputType: "text"
      }
    ]
  },
  {
    id: "python-http-server",
    title: "Python 临时 HTTP 服务",
    description: "快速分享当前目录或指定目录文件，不需要额外安装服务端软件。",
    keywords: ["http server", "python", "临时文件分享", "静态服务", "局域网"],
    defaultType: "bash",
    types: ["bash", "python", "plaintext"],
    template: "python3 -m http.server {{port}} --directory {{serve_dir}}",
    params: [
      {
        key: "port",
        label: "监听端口",
        description: "HTTP 服务端口",
        defaultValue: "8000",
        placeholder: "8000",
        inputType: "number"
      },
      {
        key: "serve_dir",
        label: "服务目录",
        description: "要暴露的目录",
        defaultValue: ".",
        placeholder: ".",
        inputType: "text"
      }
    ]
  },
  {
    id: "kill-port-process",
    title: "按端口清理进程",
    description: "定位占用端口的进程并终止，适合快速释放开发环境端口。",
    keywords: ["端口占用", "kill", "lsof", "开发排障", "进程清理"],
    defaultType: "bash",
    types: ["bash", "plaintext"],
    template: "lsof -ti :{{port}} | xargs -r kill -9",
    params: [
      {
        key: "port",
        label: "目标端口",
        description: "被占用的端口号",
        defaultValue: "3000",
        placeholder: "3000",
        inputType: "number"
      }
    ]
  },
  {
    id: "tail-grep",
    title: "日志实时过滤",
    description: "持续输出日志并按关键字过滤，适合线上问题定位时快速查看。",
    keywords: ["日志", "tail", "grep", "实时", "排查"],
    defaultType: "bash",
    types: ["bash", "plaintext"],
    template: "tail -F {{log_file}} | grep --line-buffered --color=always '{{keyword}}'",
    params: [
      {
        key: "log_file",
        label: "日志文件",
        description: "持续跟踪的日志文件",
        defaultValue: "/var/log/syslog",
        placeholder: "/var/log/syslog",
        inputType: "text"
      },
      {
        key: "keyword",
        label: "过滤关键词",
        description: "只显示包含该词的日志行",
        defaultValue: "error",
        placeholder: "error",
        inputType: "text"
      }
    ]
  },
  {
    id: "du-topn",
    title: "目录体积 Top N",
    description: "找出当前目录下最占空间的子目录，用于快速定位磁盘热点。",
    keywords: ["磁盘", "du", "排序", "空间", "容量分析"],
    defaultType: "bash",
    types: ["bash", "plaintext"],
    template: "du -h --max-depth={{depth}} {{target_dir}} | sort -hr | head -n {{top_n}}",
    params: [
      {
        key: "depth",
        label: "扫描深度",
        description: "du 的 max-depth",
        defaultValue: "1",
        placeholder: "1",
        inputType: "number"
      },
      {
        key: "target_dir",
        label: "目标目录",
        description: "要统计的目录",
        defaultValue: ".",
        placeholder: ".",
        inputType: "text"
      },
      {
        key: "top_n",
        label: "Top 数量",
        description: "输出前 N 条",
        defaultValue: "20",
        placeholder: "20",
        inputType: "number"
      }
    ]
  }
];
