# test-project 项目总览文档

> 本文档为 AI 快速上下文文档，渐进式结构：先总览 → 再模块细节 → 再数据流。

---

## 一、项目定性

这是一个 **Java 本地工具集项目**，不是 Spring Boot 应用，没有 Web 容器，所有入口均为 `main()` 方法直接运行。  
核心业务方向：**大规模网页/Sitemap/Robots URL 的批量抓取、分析与数据处理**，配套辅助模块包括压缩文件解压、Nacos 长轮询模拟、TLD 解析、Parquet 数据读取、性能基准测试等。

- **语言**：Java 17  
- **构建**：Maven（无 Spring Boot，无 parent pom）  
- **主要依赖**：OkHttp3、Playwright、Jackson、Lombok、Apache Commons Compress、Apache Parquet/Hadoop、Apache POI  
- **日志**：Logback（输出到 STDOUT）

---

## 二、目录结构总览

```
test-project/
├── pom.xml                          # Maven 构建配置
├── src/main/java/                   # 全部 Java 源码
│   ├── entity/                      # 核心数据实体
│   ├── downloadPage/                # 页面下载主模块（同步 & 异步）
│   ├── benchmarkTest/               # 基准测试 & 日志分析
│   ├── compress/                    # 压缩文件下载解压模块
│   ├── nacos/server/                # Nacos 长轮询服务端模拟
│   ├── robotCheck/                  # robots.txt 检查工具
│   ├── tempDownload/                # 临时下载实验版本（多代演进）
│   ├── tempDownLoadRetry/           # 带重试的下载实验版本
│   ├── test/                        # 通用工具类 & 接口测试脚本
│   │   ├── entity/                  # HTTP 请求/响应实体
│   │   ├── util/                    # 公共工具（HttpUtil、FileUtil、TLD）
│   │   └── testInterface/           # 各类接口联调测试
│   ├── TestLiCo/                    # LeetCode 算法练习（按日期命名）
│   ├── TestAI/                      # AI 接口调用测试
│   ├── readParquetData/             # Parquet 文件读取
│   ├── checkBaYou/                  # 域名/URL 有效性检查
│   ├── removeErrorUrl/              # 错误 URL 清洗
│   └── 新发现包/                    # 临时探索代码
├── src/main/resources/
│   ├── logback.xml                  # 日志配置
│   └── effective_tld_names.dat      # Public Suffix List 数据（TLD 解析）
├── doc/                             # 项目文档目录
└── data/                            # 本地数据文件目录
```

---

## 三、核心模块详解

### 3.1 entity 层（数据实体）

位置：`src/main/java/entity/`

| 类名 | 作用 |
|------|------|
| `SitemapRequest` | 向 Sitemap 服务投递任务的请求体。包含 url、domain、type（枚举：robots/sitemap/webarchive 等）、retryTimes、ext（JSON 扩展字段，含 batchId/dispatchTs） |
| `CrawlerRequest` | 向底层爬虫服务投递任务的请求体。含 reqId、url、domain、group、proxyType 等爬虫控制参数 |
| `CrawledResult` | 爬虫返回的抓取结果。含 httpStatusCode、content（ContentModel 内嵌类，data 字段存 HTML/XML 内容）、duration、remoteIp、errorMsg 等 |
| `PageResult` | 页面下载服务返回结果。含 s3Location（S3 存储路径）、httpStatusCode、errorMsg |
| `DownLoadResult` | 简化版下载结果，含 id/url/domain/data/ext |
| `SitemapRequest.SitemapType` | 枚举，定义 Sitemap 类型：robots/sitemap/webarchive/webarchive_page/raw_result/search_api |

### 3.2 downloadPage 模块（页面下载核心）

位置：`src/main/java/downloadPage/`

**核心功能**：从本地文件读取海量 URL，通过多 IP 负载均衡调用远程下载服务，将结果（URL + HTTP状态码 + S3路径）追加写入本地文件。

#### 关键文件

| 文件 | 说明 |
|------|------|
| `sendUrlList.java` | 同步版本。200 线程池 + LinkedBlockingQueue(170万) |
| `sendUrlListAsync.java` | 异步版本。350 线程 + CompletableFuture + 实时监控线程 |
| `ApiGateway.java` | API 网关封装，轮询负载均衡，目标 URL 模板：`http://{ip}:8080/crawl/api/page/download` |
| `readUrlList.java` | 从文件读取 URL 列表 |
| `RunHtmlSavePng.java` | 使用 Playwright 渲染 HTML 并保存截图 |

#### 数据流（同步版）
```
本地CSV文件 (170wpiece01~19.csv)
    ↓ initUrlList()  →  Set<String> urlList（去重）
    ↓ checkUrl()     →  排除已处理URL（读 urlToName.txt 已有记录）
    ↓ submitToPool() →  ThreadPoolExecutor（200线程）
    ↓ sendUrl()      →  ApiGateway.downloadPageWithLoadBalance()
                            ↓ 轮询选IP（txIpList.txt）
                            ↓ HttpUtil.sentPostResponseBean()
                            ↓ POST http://{ip}:8080/crawl/api/page/download
    ↓ 返回 ResponseBean<PageResult>
    ↓ appendFile()   →  追加写入 urlToName.txt
                         格式: url\t状态码\t消息\thttpCode\terrorMsg\ts3Location\n
```

#### 数据流（异步版）
```
同上初始化 → CompletableFuture.supplyAsync(下载) → thenAccept(写文件)
监控线程每10s打印：活跃线程数 | 队列大小 | 完成数/总数 | 吞吐量/分钟 | 进度%
```

### 3.3 benchmarkTest 模块（基准测试 & 日志分析）

位置：`src/main/java/benchmarkTest/`

| 文件 | 说明 |
|------|------|
| `SendMsgToTestBM.java` | 向 Sitemap 服务（`http://10.61.193.176:8080/sitemap/testBenchmark`）批量投递 URL，用于压测 |
| `ReadSitemapLog.java` | 解析 Sitemap 消费日志，按域名去重后随机抽样 URL 列表 |
| `AnsToExcel.java` | 将抓取结果写入 Excel |
| `GetRandUrl.java` | 从结果集随机采样 URL |
| `DiveideBMLog.java` | 切割 Benchmark 日志文件 |
| `search.java` / `searchUrl.java` | 在结果集中搜索 URL |

#### 日志分析数据流
```
Sitemap消费日志文件 (sitemap_msg_1204_1~22.log)
    ↓ readFile() 逐行读取
    ↓ getMsg() 正则提取 DataverseCrawlConsumer receive msg:{json}
    ↓ getUrl() 正则提取 "url":"xxx"
    ↓ EffectiveTldFinder 解析有效域名
    ↓ Map<domain, List<url>> 聚合
    ↓ 每域名随机取1条 URL → 随机打散 → 取前200条
    ↓ writeFile() 写入 sitemapurl 文件
```

### 3.4 compress 模块（压缩文件解压）

位置：`src/main/java/compress/`

功能：判断 URL 指向的文件是否为压缩格式（.gz/.tar.gz/.bz2/.zip/.tar/.7z），若是则下载并解压返回纯文本内容。  
支持格式通过 Apache Commons Compress 处理。

### 3.5 nacos/server 模块（Nacos 长轮询模拟）

位置：`src/main/java/nacos/server/`

| 文件 | 说明 |
|------|------|
| `LongPollingManager.java` | 核心：模拟 Nacos 服务端长轮询机制（默认超时30s） |
| `ConfigStore.java` | 配置中心内存存储 |
| `ConfigEntry.java` | 配置项实体（dataId + group + content + md5） |

#### 长轮询流程
```
客户端 POST "dataId@@group@@clientMd5\n..." 
    ↓ checkChangedKeys() → 快速比对 MD5
    ├─ 有变更 → 立即返回变更的 key 列表
    └─ 无变更 → HeldRequest 挂起（保存 HttpExchange）
                ↓ 注册到 watchMap<configKey, List<HeldRequest>>
                ↓ ScheduledExecutorService 30s 后超时响应空内容
配置变更时：notifyChange(dataId, group)
    ↓ 取出 watchMap[configKey] 所有挂起请求
    ↓ tryComplete() CAS 保证只响应一次
    ↓ 取消超时任务，写回变更的 configKey
```

### 3.6 test/util 工具层

位置：`src/main/java/test/util/`

| 工具类 | 核心功能 |
|--------|---------|
| `HttpUtil` | 基于 Java 11 原生 HttpClient 的 POST 工具。支持泛型响应反序列化 `ResponseBean<T>`，超时默认90s |
| `FileUtil` | 文件读写工具。支持文本读/写/追加，二进制读写，文件内容行级比对 |
| `EffectiveTldFinder` | 基于 Public Suffix List（effective_tld_names.dat）解析有效域名（eTLD+1），用于域名去重 |
| `SuffixTrie` | Trie 树实现，支撑 TLD 快速匹配 |
| `JsonFieldExtractor` | JSON 字段提取工具 |

### 3.7 TestLiCo / TestAI 模块

- `TestLiCo/`：LeetCode 算法题练习，按日期命名（Test0107.java ~ Test0417.java），无业务逻辑依赖
- `TestAI/`：百度 AppBuilder AI 接口调用测试

---

## 四、核心数据实体关系

```
SitemapRequest                     CrawlerRequest
  ├─ url: String                     ├─ url: String
  ├─ type: SitemapType(枚举)          ├─ domain: String
  ├─ retryTimes: int                 ├─ group: String
  └─ ext: String(JSON)               └─ proxyType: String
       └─ batchId, dispatchTs
           ↓ 投递到 Sitemap服务           ↓ 投递到爬虫服务
           
PageResult                         CrawledResult
  ├─ s3Location: String              ├─ httpStatusCode: int
  ├─ httpStatusCode: int             ├─ content.data: String(HTML/XML)
  └─ errorMsg: String                ├─ duration: Long
                                     └─ errorMsg: String

ResponseBean<T>  （统一响应包装）
  ├─ code: int  （1=ok, -1=error）
  ├─ message: String
  └─ body: T
```

---

## 五、外部服务依赖

| 服务 | 地址 | 用途 |
|------|------|------|
| 页面下载服务 | `http://{ip}:8080/crawl/api/page/download` | 批量下载网页内容，返回 S3 路径 |
| Sitemap 抓取服务 | `http://10.61.193.176:8080/sitemap/testBenchmark` | 接收 SitemapRequest 进行压测 |
| Sitemap 监控接口 | `http://localhost:8080/sitemap/monitor/*` | 流量监控查询（见下节） |
| 多 IP 负载均衡 | txIpList.txt 中的 IP 列表 | 分散下载请求到多台服务器 |

---

## 六、流量监控接口（Traffic Monitor）

这组接口由外部 Spring Boot 项目（端口8080，context-path `/sitemap`）提供，本项目通过 `SendMsgToTestBM` 等工具向其投递流量数据，并通过前端页面（`traffic-monitor-ui`）查询监控数据。

### 接口列表

| 接口 | 说明 |
|------|------|
| `GET /sitemap/test/traffic` | 写入测试流量（monitorType/batchId/count/dispatchTs/type） |
| `GET /sitemap/monitor/types` | 返回 Redis 中所有 monitorType 集合 |
| `GET /sitemap/monitor/branchIds` | 返回 Redis 中所有 branchId 集合 |
| `GET /sitemap/monitor/queryByDay` | 按天+type 查询流量，按时间槽聚合 |
| `GET /sitemap/monitor/queryByHour` | 按天+小时+type 查询流量明细 |

### 监控数据流

```
recordTraffic(monitorType, SitemapRequest, count)
    ↓ 解析 ext 字段 → batchId, dispatchTs
    ↓ 构建 Redis key（日期/小时/type 组合）
    ↓ 写入 Redis Hash：field = "type#branchId#dispatchTs", value = count

查询时：
queryByDay(day, type)
    ↓ 按日期维度聚合各时间槽数据
    ↓ 返回 Map<slot, List<{type,branchId,dispatchTs,count}>>

queryByHour(day, hour, type)
    ↓ 精确到小时维度
    ↓ 返回 all 汇总行 + items 明细列表
```

---

## 七、前端监控页面（traffic-monitor-ui）

位置：`/Users/nalan/IdeaProjects/traffic-monitor-ui/`

纯静态 HTML/CSS/JS，无框架依赖。

| 文件 | 对应接口 |
|------|---------|
| `index.html` | 导航首页 |
| `test-traffic.html` | `/test/traffic` |
| `types.html` | `/monitor/types` |
| `branch-ids.html` | `/monitor/branchIds` |
| `query-by-day.html` | `/monitor/queryByDay` |
| `query-by-hour.html` | `/monitor/queryByHour` |
| `common.css` | 公共样式 |
| `common.js` | 公共工具函数 + `BASE URL` 配置 |

**启动方式**：`python3 -m http.server 3000`（在 traffic-monitor-ui 目录下）

**跨域说明**：后端需配置 CORS，或使用代理。无跨域时用 `file://` 打开也可访问（见第八节）。

---

## 八、关于 CORS 问题与不加 CORS 的替代方案

### 为何会出现 Failed to fetch

浏览器同源策略（Same-Origin Policy）要求：从 `http://localhost:3000` 发出的 fetch 请求到 `http://localhost:8080`，后端响应头必须包含 `Access-Control-Allow-Origin`，否则浏览器拦截响应。

### 不加 CORS 的三种替代方案

**方案 A：直接双击打开（最简单）**  
将前端文件部署到后端同一端口，或直接双击 `index.html`（file:// 协议）。  
`file://` 协议下某些浏览器（Firefox）对 localhost 不拦截，Chrome 默认拦截。  
结论：不稳定，不推荐。

**方案 B：Nginx 反向代理（推荐生产用）**  
用 Nginx 同时服务静态文件和反向代理后端，统一到同一域名下：
```nginx
server {
    listen 8080;
    location /sitemap/ { proxy_pass http://localhost:8080/sitemap/; }
    location / { root /path/to/traffic-monitor-ui; }
}
```

**方案 C：后端加 CORS 配置（推荐开发用，最简单）**
```java
@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**").allowedOrigins("*").allowedMethods("*");
    }
}
```

---

## 九、构建与运行

```bash
# 编译
cd /Users/nalan/IdeaProjects/test-project
mvn compile

# 运行任意 main 类（示例）
mvn exec:java -Dexec.mainClass="downloadPage.sendUrlList"

# 或在 IntelliJ IDEA 中直接右键 main() 方法运行
```

---

## 十、关键配置参数速查

| 参数 | 位置 | 默认值 | 说明 |
|------|------|--------|------|
| 线程池大小（同步）| `sendUrlList.THREAD_POOL_NUM` | 200 | 并发下载线程数 |
| 线程池大小（异步）| `sendUrlListAsync.THREAD_POOL_NUM` | 350 | 异步并发线程数 |
| 队列长度 | `LinkedBlockingQueue` | 1,700,000 | 任务缓冲上限 |
| HTTP 超时 | `HttpUtil` | 90s | 请求超时时间 |
| 连接超时 | `HttpUtil.HTTP_CLIENT` | 10s | 建立连接超时 |
| 长轮询超时 | `LongPollingManager.HOLD_TIMEOUT_MS` | 30,000ms | Nacos 模拟超时 |
| 日志级别 | `logback.xml` | INFO | 控制台输出 |

