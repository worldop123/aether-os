/**
 * @file custom-skill-demo.ts
 * @description Aether OS - 自定义 Skill（MCP 工具系统）示例
 *
 * 本示例演示如何使用 MCP 工具系统创建自定义 Skill：
 * - 创建 McpManager（内置工具服务器）
 * - 创建自定义 McpServer（local 类型）
 * - 注册 3 个自定义工具：
 *     1. text_processor — 文本处理（upper / lower / reverse / word_count）
 *     2. data_store    — 简单 KV 存储（set / get / delete / list）
 *     3. weather_mock  — 模拟天气查询
 * - 调用每个工具演示功能
 * - 演示工具参数校验（缺少必填参数、类型错误）
 * - 演示错误处理（不存在的工具、非法枚举值）
 * - 监听 mcp.tool_called / mcp.tool_result 事件打印调用日志
 * - 演示工具链式调用（前一个工具的输出作为后一个的输入）
 * - 列出所有工具并打印汇总表
 *
 * 运行方式：
 *   npx tsx examples/custom-skill-demo.ts
 *   或编译后：node dist/examples/custom-skill-demo.js
 */

import { McpManager, McpServer, McpTool } from '@aether/mcp';
import type { McpToolParameter, McpToolResult, IMcpTool } from '@aether/mcp';
import { globalEventBus, EVENTS, now } from '@aether/shared';

// ============================================================
// data_store 工具的内部状态（KV 存储）
// ============================================================

const dataStore = new Map<string, string>();

// ============================================================
// weather_mock 工具的模拟数据
// ============================================================

const weatherDatabase: Record<string, { temp: number; condition: string; humidity: number; wind: string }> = {
  北京: { temp: 25, condition: '晴', humidity: 45, wind: '北风 3 级' },
  上海: { temp: 28, condition: '多云', humidity: 65, wind: '东南风 2 级' },
  广州: { temp: 32, condition: '雷阵雨', humidity: 80, wind: '南风 4 级' },
  深圳: { temp: 30, condition: '阴', humidity: 70, wind: '东风 3 级' },
  杭州: { temp: 26, condition: '小雨', humidity: 75, wind: '东北风 2 级' },
};

// ============================================================
// 工具调用日志（用于汇总）
// ============================================================

interface ToolCallLog {
  toolName: string;
  serverName: string;
  success: boolean;
  duration: number;
  timestamp: number;
}

const callLogs: ToolCallLog[] = [];

// ============================================================
// 工具创建函数
// ============================================================

/**
 * 创建文本处理工具
 * 支持 upper / lower / reverse / word_count 四种操作
 */
function createTextProcessorTool(serverName: string): McpTool {
  return new McpTool(
    'text_processor',
    '文本处理工具，支持大小写转换、反转、字数统计',
    [
      {
        name: 'text',
        type: 'string',
        description: '要处理的文本内容',
        required: true,
      },
      {
        name: 'operation',
        type: 'string',
        description: '操作类型：upper（大写）、lower（小写）、reverse（反转）、word_count（字数统计）',
        required: true,
        enum: ['upper', 'lower', 'reverse', 'word_count'],
      },
    ],
    serverName,
    async (args): Promise<McpToolResult> => {
      const text = args.text as string;
      const operation = args.operation as string;

      // 枚举值校验（McpTool 框架不校验 enum，需在 handler 中自行校验）
      const validOps = ['upper', 'lower', 'reverse', 'word_count'];
      if (!validOps.includes(operation)) {
        return {
          success: false,
          content: '',
          error: `不支持的操作: ${operation}，有效值为: ${validOps.join(', ')}`,
        };
      }

      switch (operation) {
        case 'upper':
          return {
            success: true,
            content: text.toUpperCase(),
            data: { result: text.toUpperCase(), operation, originalLength: text.length },
          };
        case 'lower':
          return {
            success: true,
            content: text.toLowerCase(),
            data: { result: text.toLowerCase(), operation, originalLength: text.length },
          };
        case 'reverse': {
          const reversed = text.split('').reverse().join('');
          return {
            success: true,
            content: reversed,
            data: { result: reversed, operation, originalLength: text.length },
          };
        }
        case 'word_count': {
          // 按空格分词统计英文单词数，同时统计中文字符数
          const words = text.split(/\s+/).filter(Boolean);
          const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
          return {
            success: true,
            content: `字数统计: ${words.length} 个词, ${chineseChars} 个中文字符, 总长度 ${text.length}`,
            data: { wordCount: words.length, chineseChars, totalLength: text.length, operation },
          };
        }
        default:
          return { success: false, content: '', error: `未知操作: ${operation}` };
      }
    }
  );
}

/**
 * 创建 KV 存储工具
 * 支持 set / get / delete / list 四种操作，内部用 Map 维护状态
 */
function createDataStoreTool(serverName: string): McpTool {
  return new McpTool(
    'data_store',
    '简单的键值存储工具，支持 set / get / delete / list 操作',
    [
      {
        name: 'action',
        type: 'string',
        description: '操作类型：set（设置）、get（获取）、delete（删除）、list（列出所有键）',
        required: true,
        enum: ['set', 'get', 'delete', 'list'],
      },
      {
        name: 'key',
        type: 'string',
        description: '键名（set / get / delete 操作必填）',
        required: false,
      },
      {
        name: 'value',
        type: 'string',
        description: '值（仅 set 操作需要）',
        required: false,
      },
    ],
    serverName,
    async (args): Promise<McpToolResult> => {
      const action = args.action as string;
      const key = args.key as string | undefined;
      const value = args.value as string | undefined;

      switch (action) {
        case 'set': {
          if (!key) {
            return { success: false, content: '', error: 'set 操作需要提供 key 参数' };
          }
          dataStore.set(key, value ?? '');
          return {
            success: true,
            content: `已设置: ${key} = ${value ?? ''}`,
            data: { key, value: value ?? '', action, totalKeys: dataStore.size },
          };
        }
        case 'get': {
          if (!key) {
            return { success: false, content: '', error: 'get 操作需要提供 key 参数' };
          }
          if (!dataStore.has(key)) {
            return { success: false, content: '', error: `键 "${key}" 不存在` };
          }
          const val = dataStore.get(key)!;
          return {
            success: true,
            content: `${key} = ${val}`,
            data: { key, value: val, action },
          };
        }
        case 'delete': {
          if (!key) {
            return { success: false, content: '', error: 'delete 操作需要提供 key 参数' };
          }
          if (!dataStore.has(key)) {
            return { success: false, content: '', error: `键 "${key}" 不存在，无法删除` };
          }
          dataStore.delete(key);
          return {
            success: true,
            content: `已删除: ${key}`,
            data: { key, action, remainingKeys: dataStore.size },
          };
        }
        case 'list': {
          const keys = Array.from(dataStore.keys());
          const entries = Array.from(dataStore.entries()).map(([k, v]) => ({ key: k, value: v }));
          return {
            success: true,
            content: `共 ${keys.length} 个键: ${keys.join(', ') || '(空)'}`,
            data: { keys, entries, action, totalKeys: keys.length },
          };
        }
        default:
          return { success: false, content: '', error: `未知操作: ${action}` };
      }
    }
  );
}

/**
 * 创建天气查询工具（模拟数据）
 */
function createWeatherMockTool(serverName: string): McpTool {
  return new McpTool(
    'weather_mock',
    '模拟天气查询工具，返回指定城市的天气信息',
    [
      {
        name: 'city',
        type: 'string',
        description: '城市名称（支持：北京、上海、广州、深圳、杭州）',
        required: true,
      },
      {
        name: 'unit',
        type: 'string',
        description: '温度单位：celsius（摄氏度）或 fahrenheit（华氏度）',
        required: false,
        default: 'celsius',
        enum: ['celsius', 'fahrenheit'],
      },
    ],
    serverName,
    async (args): Promise<McpToolResult> => {
      const city = args.city as string;
      const unit = (args.unit as string) || 'celsius';

      const weather = weatherDatabase[city];
      if (!weather) {
        return {
          success: false,
          content: '',
          error: `暂不支持城市 "${city}"，目前支持: ${Object.keys(weatherDatabase).join('、')}`,
        };
      }

      let temp = weather.temp;
      let unitLabel = '°C';
      if (unit === 'fahrenheit') {
        temp = Math.round(temp * 9 / 5 + 32);
        unitLabel = '°F';
      }

      return {
        success: true,
        content: `${city}天气: ${weather.condition}, 温度 ${temp}${unitLabel}, 湿度 ${weather.humidity}%, ${weather.wind}`,
        data: {
          city,
          condition: weather.condition,
          temp,
          unit,
          humidity: weather.humidity,
          wind: weather.wind,
        },
      };
    }
  );
}

// ============================================================
// 辅助函数
// ============================================================

/** 打印工具调用结果 */
function printToolResult(result: McpToolResult, indent: string = '   '): void {
  if (result.success) {
    console.log(`${indent}✅ 成功: ${result.content}`);
    if (result.data) {
      console.log(`${indent}   数据: ${JSON.stringify(result.data)}`);
    }
  } else {
    console.error(`${indent}❌ 失败: ${result.error}`);
  }
  console.log(`${indent}   耗时: ${result.duration ?? 0}ms`);
}

/** 打印工具汇总表 */
function printToolTable(tools: IMcpTool[]): void {
  console.log('\n   ┌─────────────────────┬───────────────┬────────┬──────────────────────────────────┐');
  console.log('   │ 工具名              │ 服务器        │ 参数数 │ 描述                              │');
  console.log('   ├─────────────────────┼───────────────┼────────┼──────────────────────────────────┤');
  for (const tool of tools) {
    const name = tool.name.padEnd(19).substring(0, 19);
    const server = tool.serverName.padEnd(13).substring(0, 13);
    const paramCount = String(tool.parameters.length).padEnd(6);
    const desc = (tool.description || '').padEnd(32).substring(0, 32);
    console.log(`   │ ${name} │ ${server} │ ${paramCount} │ ${desc} │`);
  }
  console.log('   └─────────────────────┴───────────────┴────────┴──────────────────────────────────┘');
}

// ============================================================
// 主函数
// ============================================================

async function main(): Promise<void> {
  console.log('🔧 Aether OS - 自定义 Skill（MCP 工具系统）示例');
  console.log('='.repeat(60));

  // ---- 1. 创建 McpManager ----
  console.log('\n📦 1. 创建 McpManager');
  console.log('-'.repeat(40));

  const mcpManager = new McpManager();
  console.log('✅ McpManager 已创建（内置工具服务器已自动初始化）');

  // 列出内置工具
  const builtinTools = await mcpManager.listAllTools();
  console.log(`   内置工具: ${builtinTools.map((t) => t.name).join(', ')}`);

  // ---- 2. 监听 MCP 事件 ----
  console.log('\n📡 2. 监听 MCP 事件');
  console.log('-'.repeat(40));

  globalEventBus.on(EVENTS.MCP_TOOL_CALLED, (toolName, serverName, ts) => {
    console.log(`   [事件] 工具调用: ${toolName} (服务器: ${serverName}, 时间: ${new Date(ts).toLocaleTimeString()})`);
  });

  globalEventBus.on(EVENTS.MCP_TOOL_RESULT, (toolName, serverName, duration, ts) => {
    console.log(`   [事件] 工具结果: ${toolName} (耗时: ${duration}ms)`);
    callLogs.push({ toolName, serverName, success: true, duration, timestamp: ts });
  });

  globalEventBus.on(EVENTS.MCP_TOOL_ERROR, (toolName, serverName, error, ts) => {
    console.warn(`   [事件] 工具错误: ${toolName} - ${error.message}`);
    callLogs.push({ toolName, serverName, success: false, duration: 0, timestamp: ts });
  });

  globalEventBus.on(EVENTS.MCP_SERVER_CONNECTED, (serverName, ts) => {
    console.log(`   [事件] 服务器已连接: ${serverName}`);
  });

  console.log('✅ 已注册 4 个 MCP 事件监听器');

  // ---- 3. 创建自定义 McpServer ----
  console.log('\n🖥️  3. 创建自定义 McpServer（local 类型）');
  console.log('-'.repeat(40));

  // loadServer 返回 IMcpServer，需要 cast 为 McpServer 以访问 registerTool
  const customServer = await mcpManager.loadServer({
    name: 'custom-tools',
    description: '自定义工具服务器（文本处理 / KV 存储 / 天气查询）',
    type: 'local',
    enabled: true,
  }) as McpServer;

  console.log(`✅ 自定义服务器已创建并连接: ${customServer.name}`);
  console.log(`   类型: ${customServer.config.type}`);
  console.log(`   状态: ${customServer.status}`);
  console.log(`   已连接: ${customServer.isConnected()}`);

  // ---- 4. 注册 3 个自定义工具 ----
  console.log('\n🛠️  4. 注册 3 个自定义工具');
  console.log('-'.repeat(40));

  customServer.registerTool(createTextProcessorTool('custom-tools'));
  console.log('   ✅ text_processor — 文本处理（upper / lower / reverse / word_count）');

  customServer.registerTool(createDataStoreTool('custom-tools'));
  console.log('   ✅ data_store — KV 存储（set / get / delete / list）');

  customServer.registerTool(createWeatherMockTool('custom-tools'));
  console.log('   ✅ weather_mock — 模拟天气查询');

  const customTools = await customServer.listTools();
  console.log(`\n   自定义服务器共注册 ${customTools.length} 个工具`);

  // ---- 5. 调用每个工具演示功能 ----
  console.log('\n🧪 5. 调用工具演示功能');
  console.log('-'.repeat(40));

  // 5.1 text_processor — upper
  console.log('\n   📌 text_processor / upper:');
  const upperResult = await mcpManager.executeTool('text_processor', {
    text: 'Hello World 你好世界',
    operation: 'upper',
  });
  printToolResult(upperResult);

  // 5.2 text_processor — lower
  console.log('\n   📌 text_processor / lower:');
  const lowerResult = await mcpManager.executeTool('text_processor', {
    text: 'HELLO World',
    operation: 'lower',
  });
  printToolResult(lowerResult);

  // 5.3 text_processor — reverse
  console.log('\n   📌 text_processor / reverse:');
  const reverseResult = await mcpManager.executeTool('text_processor', {
    text: 'Aether OS',
    operation: 'reverse',
  });
  printToolResult(reverseResult);

  // 5.4 text_processor — word_count
  console.log('\n   📌 text_processor / word_count:');
  const countResult = await mcpManager.executeTool('text_processor', {
    text: '你好世界 hello world 这是测试',
    operation: 'word_count',
  });
  printToolResult(countResult);

  // 5.5 data_store — set
  console.log('\n   📌 data_store / set:');
  const setResult = await mcpManager.executeTool('data_store', {
    action: 'set',
    key: 'greeting',
    value: 'Hello from Aether OS',
  });
  printToolResult(setResult);

  // 5.6 data_store — get
  console.log('\n   📌 data_store / get:');
  const getResult = await mcpManager.executeTool('data_store', {
    action: 'get',
    key: 'greeting',
  });
  printToolResult(getResult);

  // 5.7 data_store — list
  console.log('\n   📌 data_store / list:');
  const listResult = await mcpManager.executeTool('data_store', {
    action: 'list',
  });
  printToolResult(listResult);

  // 5.8 weather_mock — 北京
  console.log('\n   📌 weather_mock / 北京（摄氏度）:');
  const weatherResult = await mcpManager.executeTool('weather_mock', {
    city: '北京',
  });
  printToolResult(weatherResult);

  // 5.9 weather_mock — 上海（华氏度）
  console.log('\n   📌 weather_mock / 上海（华氏度）:');
  const weatherResult2 = await mcpManager.executeTool('weather_mock', {
    city: '上海',
    unit: 'fahrenheit',
  });
  printToolResult(weatherResult2);

  // ---- 6. 演示参数校验 ----
  console.log('\n✅ 6. 演示参数校验');
  console.log('-'.repeat(40));

  // 6.1 缺少必填参数
  console.log('\n   📌 缺少必填参数（text_processor 缺少 text）:');
  const missingParamResult = await mcpManager.executeTool('text_processor', {
    operation: 'upper',
    // 故意不传 text
  });
  printToolResult(missingParamResult);

  // 6.2 参数类型错误
  console.log('\n   📌 参数类型错误（text 应为 string，传 number）:');
  const wrongTypeResult = await mcpManager.executeTool('text_processor', {
    text: 12345,
    operation: 'upper',
  });
  printToolResult(wrongTypeResult);

  // 6.3 非法枚举值
  console.log('\n   📌 非法枚举值（operation = "capitalize" 不在枚举中）:');
  const invalidEnumResult = await mcpManager.executeTool('text_processor', {
    text: 'hello',
    operation: 'capitalize',
  });
  printToolResult(invalidEnumResult);

  // ---- 7. 演示错误处理 ----
  console.log('\n⚠️  7. 演示错误处理');
  console.log('-'.repeat(40));

  // 7.1 调用不存在的工具
  console.log('\n   📌 调用不存在的工具:');
  try {
    await mcpManager.executeTool('non_existent_tool', {});
  } catch (error) {
    console.log(`   ✅ 捕获异常: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 7.2 调用不存在的服务器
  console.log('\n   📌 调用不存在的服务器:');
  try {
    await mcpManager.executeTool('text_processor', { text: 'hi', operation: 'upper' }, 'non_existent_server');
  } catch (error) {
    console.log(`   ✅ 捕获异常: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 7.3 data_store — get 不存在的键
  console.log('\n   📌 data_store / get 不存在的键:');
  const notFoundResult = await mcpManager.executeTool('data_store', {
    action: 'get',
    key: 'non_existent_key',
  });
  printToolResult(notFoundResult);

  // 7.4 weather_mock — 不支持的城市
  console.log('\n   📌 weather_mock / 不支持的城市:');
  const unknownCityResult = await mcpManager.executeTool('weather_mock', {
    city: '纽约',
  });
  printToolResult(unknownCityResult);

  // ---- 8. 演示工具链式调用 ----
  console.log('\n🔗 8. 演示工具链式调用');
  console.log('-'.repeat(40));
  console.log('   流程: text_processor(reverse) → data_store(set) → data_store(get) → weather_mock → data_store(set)\n');

  // 步骤 1: 用 text_processor 反转文本
  console.log('   步骤 1: text_processor 反转 "Hello Aether"');
  const chainStep1 = await mcpManager.executeTool('text_processor', {
    text: 'Hello Aether',
    operation: 'reverse',
  });
  printToolResult(chainStep1, '      ');

  // 步骤 2: 将反转结果存入 data_store
  const reversedText = (chainStep1.data as { result: string }).result;
  console.log(`\n   步骤 2: data_store set "reversed_text" = "${reversedText}"`);
  const chainStep2 = await mcpManager.executeTool('data_store', {
    action: 'set',
    key: 'reversed_text',
    value: reversedText,
  });
  printToolResult(chainStep2, '      ');

  // 步骤 3: 从 data_store 取回验证
  console.log('\n   步骤 3: data_store get "reversed_text" 验证');
  const chainStep3 = await mcpManager.executeTool('data_store', {
    action: 'get',
    key: 'reversed_text',
  });
  printToolResult(chainStep3, '      ');

  // 步骤 4: 查询天气
  console.log('\n   步骤 4: weather_mock 查询 "北京" 天气');
  const chainStep4 = await mcpManager.executeTool('weather_mock', {
    city: '北京',
  });
  printToolResult(chainStep4, '      ');

  // 步骤 5: 将天气结果存入 data_store
  const weatherContent = chainStep4.content;
  console.log(`\n   步骤 5: data_store set "beijing_weather" = "${weatherContent}"`);
  const chainStep5 = await mcpManager.executeTool('data_store', {
    action: 'set',
    key: 'beijing_weather',
    value: weatherContent,
  });
  printToolResult(chainStep5, '      ');

  // 步骤 6: 列出所有存储的键
  console.log('\n   步骤 6: data_store list 查看所有数据');
  const chainStep6 = await mcpManager.executeTool('data_store', {
    action: 'list',
  });
  printToolResult(chainStep6, '      ');

  // 步骤 7: 删除一条数据
  console.log('\n   步骤 7: data_store delete "reversed_text"');
  const chainStep7 = await mcpManager.executeTool('data_store', {
    action: 'delete',
    key: 'reversed_text',
  });
  printToolResult(chainStep7, '      ');

  // ---- 9. 列出所有工具并打印汇总表 ----
  console.log('\n📋 9. 列出所有工具并打印汇总表');
  console.log('-'.repeat(40));

  const allTools = await mcpManager.listAllTools();
  console.log(`\n   共 ${allTools.length} 个工具（来自 ${mcpManager.listServers().length} 个服务器）:`);

  // 打印服务器列表
  console.log('\n   服务器列表:');
  for (const server of mcpManager.listServers()) {
    console.log(`      • ${server.name} [${server.config.type}] — ${server.isConnected() ? '已连接' : '未连接'}`);
  }

  // 打印工具汇总表
  printToolTable(allTools);

  // 打印每个工具的详细参数
  console.log('\n   工具参数详情:');
  for (const tool of allTools) {
    console.log(`\n      📌 ${tool.name} (${tool.serverName})`);
    console.log(`         描述: ${tool.description}`);
    console.log(`         参数:`);
    for (const param of tool.parameters) {
      const req = param.required ? '必填' : '可选';
      const def = param.default !== undefined ? `, 默认: ${param.default}` : '';
      const en = param.enum ? `, 枚举: [${param.enum.join(', ')}]` : '';
      console.log(`         - ${param.name} (${param.type}, ${req}${def}${en}) ${param.description || ''}`);
    }
  }

  // ---- 10. 调用日志汇总 ----
  console.log('\n📊 10. 调用日志汇总');
  console.log('-'.repeat(40));

  console.log(`   共记录 ${callLogs.length} 次工具调用\n`);
  console.log('   调用明细:');
  console.log('   ┌──────┬─────────────────────┬───────────────┬────────┬──────────┐');
  console.log('   │ 序号 │ 工具名              │ 服务器        │ 结果   │ 耗时(ms) │');
  console.log('   ├──────┼─────────────────────┼───────────────┼────────┼──────────┤');
  for (let i = 0; i < callLogs.length; i++) {
    const log = callLogs[i];
    const idx = String(i + 1).padEnd(4);
    const name = log.toolName.padEnd(19).substring(0, 19);
    const server = log.serverName.padEnd(13).substring(0, 13);
    const result = (log.success ? '成功' : '失败').padEnd(6);
    const dur = String(log.duration).padEnd(8);
    console.log(`   │ ${idx} │ ${name} │ ${server} │ ${result} │ ${dur} │`);
  }
  console.log('   └──────┴─────────────────────┴───────────────┴────────┴──────────┘');

  // 统计
  const successCount = callLogs.filter((l) => l.success).length;
  const failCount = callLogs.filter((l) => !l.success).length;
  const avgDuration = callLogs.length > 0
    ? (callLogs.reduce((sum, l) => sum + l.duration, 0) / callLogs.length).toFixed(2)
    : '0';
  console.log(`\n   统计: 成功 ${successCount} 次, 失败 ${failCount} 次, 平均耗时 ${avgDuration}ms`);

  // 按工具分组统计
  const toolStats: Record<string, { count: number; success: number; fail: number }> = {};
  for (const log of callLogs) {
    if (!toolStats[log.toolName]) {
      toolStats[log.toolName] = { count: 0, success: 0, fail: 0 };
    }
    toolStats[log.toolName].count++;
    if (log.success) toolStats[log.toolName].success++;
    else toolStats[log.toolName].fail++;
  }
  console.log('\n   按工具分组:');
  for (const [name, stats] of Object.entries(toolStats)) {
    console.log(`      • ${name}: ${stats.count} 次 (成功 ${stats.success}, 失败 ${stats.fail})`);
  }

  // ---- 11. 清理资源 ----
  console.log('\n🧹 11. 清理资源');
  console.log('-'.repeat(40));

  await mcpManager.disconnectAll();
  console.log('✅ 所有 MCP 服务器已断开连接');

  const remainingServers = mcpManager.listServers();
  console.log(`   剩余服务器: ${remainingServers.length} 个`);
  for (const s of remainingServers) {
    console.log(`      • ${s.name} — 已连接: ${s.isConnected()}`);
  }

  // 清理 data_store
  dataStore.clear();
  console.log('✅ data_store 内部状态已清空');

  // ---- 总结 ----
  console.log('\n' + '='.repeat(60));
  console.log('✅ 自定义 Skill 示例运行完成！');
  console.log('\n💡 本示例展示的功能:');
  console.log('   1. McpManager 管理 MCP 服务器（内置 + 自定义）');
  console.log('   2. 自定义 McpServer（local 类型）创建与连接');
  console.log('   3. 自定义工具注册（text_processor / data_store / weather_mock）');
  console.log('   4. 工具参数 schema 定义（类型、必填、枚举、默认值）');
  console.log('   5. 工具调用与结果处理');
  console.log('   6. 参数校验（缺少必填、类型错误、非法枚举）');
  console.log('   7. 错误处理（工具不存在、服务器不存在、业务错误）');
  console.log('   8. 工具链式调用（前一个输出作为后一个输入）');
  console.log('   9. 事件监听（mcp.tool_called / mcp.tool_result / mcp.tool_error）');
  console.log('   10. 调用日志汇总与统计分析');
}

// ============================================================
// 入口
// ============================================================

main().catch((error) => {
  console.error('❌ 示例运行出错:', error);
  process.exit(1);
});
