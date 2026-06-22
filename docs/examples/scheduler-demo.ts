/**
 * 任务调度演示
 * 
 * 这个示例展示了 Aether OS 任务调度器的完整功能：
 * - 创建定时任务
 * - Cron 表达式解析
 * - 任务执行和重试
 * - 任务管理（启用/禁用/取消）
 * - 执行历史
 */

import { TaskScheduler } from '@aether/scheduler';
import { globalEventBus, EVENTS } from '@aether/shared';

async function main() {
  console.log('⏰ Aether OS - 任务调度演示');
  console.log('='.repeat(60));

  // 1. 初始化调度器
  console.log('\n📦 初始化任务调度器...');
  
  const scheduler = new TaskScheduler();

  // 监听调度器事件
  globalEventBus.on(EVENTS.SCHEDULER_TASK_CREATED, (taskId, task) => {
    console.log(`  [事件] 任务创建: ${taskId} (${task.name})`);
  });

  globalEventBus.on(EVENTS.SCHEDULER_TASK_EXECUTED, (taskId, result) => {
    console.log(`  [事件] 任务执行完成: ${taskId} (${result.success ? '成功' : '失败'})`);
  });

  console.log('✅ 调度器初始化完成');

  // 2. 注册任务处理器
  console.log('\n🔧 注册任务处理器...');

  // 自定义任务处理器：发送通知
  scheduler.registerTaskHandler('send_notification', async (task) => {
    console.log(`\n  📨 执行任务: ${task.name}`);
    console.log(`     Agent ID: ${task.agentId}`);
    console.log(`     消息: ${task.payload?.message || '无'}`);
    console.log(`     执行时间: ${new Date().toLocaleTimeString()}`);
    
    // 模拟异步操作
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      success: true,
      data: { sent: true, notificationId: `notif_${Date.now()}` },
    };
  });

  // 自定义任务处理器：生成报告
  scheduler.registerTaskHandler('generate_report', async (task) => {
    console.log(`\n  📊 执行任务: ${task.name}`);
    console.log(`     报告类型: ${task.payload?.reportType || 'daily'}`);
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      success: true,
      data: {
        reportId: `report_${Date.now()}`,
        pages: 10,
        generatedAt: new Date().toISOString(),
      },
    };
  });

  // 自定义任务处理器：可能失败的任务（用于测试重试）
  let failCount = 0;
  scheduler.registerTaskHandler('unreliable_task', async (task) => {
    failCount++;
    console.log(`\n  ⚠️  执行任务: ${task.name} (第 ${failCount} 次尝试)`);
    
    if (failCount < 3) {
      throw new Error('模拟失败');
    }
    
    console.log(`     ✅ 第 ${failCount} 次尝试成功！`);
    return { success: true, data: { attempts: failCount } };
  });

  console.log('✅ 已注册 3 个任务处理器');
  console.log('   - send_notification: 发送通知');
  console.log('   - generate_report: 生成报告');
  console.log('   - unreliable_task: 不稳定任务（测试重试）');

  // 3. 创建各种定时任务
  console.log('\n📝 创建定时任务...');

  // 任务 1: 每分钟执行的通知任务
  const task1 = await scheduler.schedule({
    name: '每分钟心跳检查',
    agentId: 'agent-001',
    cron: '* * * * *',
    taskType: 'send_notification' as any,
    payload: { message: '系统运行正常' },
    enabled: true,
  });

  // 任务 2: 每小时第 0 分钟执行的报告任务
  const task2 = await scheduler.schedule({
    name: '每小时报告',
    agentId: 'agent-001',
    cron: '0 * * * *',
    taskType: 'generate_report' as any,
    payload: { reportType: 'hourly' },
    enabled: true,
  });

  // 任务 3: 每天早上 9 点执行的日报任务
  const task3 = await scheduler.schedule({
    name: '每日晨报',
    agentId: 'agent-002',
    cron: '0 9 * * *',
    taskType: 'generate_report' as any,
    payload: { reportType: 'daily_morning' },
    enabled: true,
  });

  // 任务 4: 禁用的任务
  const task4 = await scheduler.schedule({
    name: '已禁用的任务',
    agentId: 'agent-001',
    cron: '* * * * *',
    taskType: 'send_notification' as any,
    payload: { message: '这个任务不会执行' },
    enabled: false,
  });

  console.log(`\n✅ 已创建 4 个任务`);

  // 4. 列出所有任务
  console.log('\n📋 列出所有任务:');
  const { items: allTasks, total } = await scheduler.listTasks();
  
  console.log(`共 ${total} 个任务:`);
  allTasks.forEach((task, index) => {
    const statusIcon = task.enabled ? '✅' : '⏸️';
    const nextRun = task.nextRunAt ? new Date(task.nextRunAt).toLocaleString() : '未安排';
    console.log(`  ${index + 1}. ${statusIcon} ${task.name}`);
    console.log(`     ID: ${task.id}`);
    console.log(`     Cron: ${task.cron}`);
    console.log(`     类型: ${task.taskType}`);
    console.log(`     状态: ${task.status}`);
    console.log(`     下次执行: ${nextRun}`);
    console.log(`     执行次数: ${task.runCount}`);
    console.log();
  });

  // 5. 按 Agent 过滤任务
  console.log('🔍 按 Agent 过滤任务:');
  const agent1Tasks = await scheduler.listTasks({ agentId: 'agent-001' });
  console.log(`Agent 001 的任务: ${agent1Tasks.total} 个`);

  const agent2Tasks = await scheduler.listTasks({ agentId: 'agent-002' });
  console.log(`Agent 002 的任务: ${agent2Tasks.total} 个`);

  // 6. 立即执行任务
  console.log('\n⚡ 立即执行任务演示:');

  console.log('\n立即执行"每日晨报"任务...');
  const execResult = await scheduler.executeNow(task3.id);
  console.log(`执行结果: ${execResult.success ? '成功' : '失败'}`);
  console.log(`执行耗时: ${execResult.duration}ms`);
  if (execResult.result) {
    console.log(`返回数据:`, JSON.stringify(execResult.result.data, null, 2).split('\n').map((l, i) => i === 0 ? l : `  ${l}`).join('\n'));
  }

  // 7. 启用/禁用任务
  console.log('\n🔄 启用/禁用任务演示:');

  console.log(`\n任务"${task4.name}"当前状态: ${task4.enabled ? '启用' : '禁用'}`);
  
  console.log('启用任务...');
  await scheduler.enableTask(task4.id);
  const enabledTask = await scheduler.getTask(task4.id);
  console.log(`启用后状态: ${enabledTask?.enabled ? '启用' : '禁用'}`);

  console.log('禁用任务...');
  await scheduler.disableTask(task4.id);
  const disabledTask = await scheduler.getTask(task4.id);
  console.log(`禁用后状态: ${disabledTask?.enabled ? '启用' : '禁用'}`);

  // 8. 更新任务
  console.log('\n✏️ 更新任务演示:');

  console.log('\n更新"每小时报告"任务...');
  const updatedTask = await scheduler.updateTask(task2.id, {
    name: '每小时数据报告（已更新）',
    payload: { reportType: 'hourly_v2', includeCharts: true },
  });

  console.log(`更新后名称: ${updatedTask.name}`);
  console.log(`更新后 payload:`, updatedTask.payload);

  // 9. 任务重试演示
  console.log('\n🔁 任务重试演示:');

  console.log('\n创建一个会失败的任务（前 2 次失败，第 3 次成功）...');
  failCount = 0; // 重置计数器
  
  const retryTask = await scheduler.schedule({
    name: '重试测试任务',
    agentId: 'agent-001',
    cron: '* * * * *',
    taskType: 'unreliable_task' as any,
    payload: {},
    enabled: true,
    maxRuns: 5,
  });

  console.log('立即执行（会自动重试）...');
  try {
    const retryResult = await scheduler.executeNow(retryTask.id);
    console.log(`最终结果: ${retryResult.success ? '成功' : '失败'}`);
    console.log(`总尝试次数: ${failCount}`);
  } catch (error) {
    console.log(`执行失败: ${error}`);
  }

  // 10. 取消任务
  console.log('\n🗑️ 取消任务演示:');

  console.log(`\n取消"每分钟心跳检查"任务...`);
  const cancelled = await scheduler.cancel(task1.id);
  console.log(`取消成功: ${cancelled}`);

  const cancelledTask = await scheduler.getTask(task1.id);
  console.log(`任务状态: ${cancelledTask?.status}`);
  console.log(`是否启用: ${cancelledTask?.enabled}`);

  // 11. 执行历史
  console.log('\n📜 执行历史演示:');

  const history = scheduler.getExecutionHistory(task3.id);
  console.log(`任务"每日晨报"的执行历史: ${history.length} 条`);
  history.forEach((record, index) => {
    console.log(`  ${index + 1}. ${new Date(record.executedAt).toLocaleString()}`);
    console.log(`     状态: ${record.success ? '成功' : '失败'}`);
    console.log(`     耗时: ${record.duration}ms`);
    if (record.error) {
      console.log(`     错误: ${record.error}`);
    }
  });

  // 12. 启动调度器
  console.log('\n🚀 启动调度器...');
  await scheduler.start();
  console.log(`调度器运行状态: ${scheduler.isRunning() ? '运行中' : '已停止'}`);

  // 运行 3 秒，观察定时任务执行
  console.log('\n⏳ 运行 3 秒，观察定时任务执行...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 13. 停止调度器
  console.log('\n🛑 停止调度器...');
  await scheduler.stop();
  console.log(`调度器运行状态: ${scheduler.isRunning() ? '运行中' : '已停止'}`);

  // 14. 分页查询
  console.log('\n📄 分页查询演示:');

  // 先创建更多任务
  for (let i = 0; i < 10; i++) {
    await scheduler.schedule({
      name: `批量任务 ${i + 1}`,
      agentId: `agent-${i % 3}`,
      cron: '0 0 * * *',
      taskType: 'send_notification' as any,
      payload: { index: i },
      enabled: i % 2 === 0,
    });
  }

  console.log('\n第 1 页（每页 5 条）:');
  const page1 = await scheduler.listTasks({
    page: 1,
    pageSize: 5,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  console.log(`总数: ${page1.total}, 当前页: ${page1.items.length} 条`);
  page1.items.forEach((task, i) => {
    console.log(`  ${i + 1}. ${task.name}`);
  });

  console.log('\n第 2 页（每页 5 条）:');
  const page2 = await scheduler.listTasks({
    page: 2,
    pageSize: 5,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  console.log(`总数: ${page2.total}, 当前页: ${page2.items.length} 条`);
  page2.items.forEach((task, i) => {
    console.log(`  ${i + 1}. ${task.name}`);
  });

  // 15. 统计信息
  console.log('\n📊 任务统计:');
  const allTasksFinal = await scheduler.listTasks();
  
  const enabledCount = allTasksFinal.items.filter(t => t.enabled).length;
  const disabledCount = allTasksFinal.items.filter(t => !t.enabled).length;
  const cancelledCount = allTasksFinal.items.filter(t => t.status === 'cancelled').length;
  const completedCount = allTasksFinal.items.filter(t => t.status === 'completed').length;

  console.log(`  总任务数: ${allTasksFinal.total}`);
  console.log(`  启用中: ${enabledCount}`);
  console.log(`  已禁用: ${disabledCount}`);
  console.log(`  已取消: ${cancelledCount}`);
  console.log(`  已完成: ${completedCount}`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ 任务调度演示完成！');
  console.log('\n💡 调度器的价值:');
  console.log('   1. 定时执行: 按 Cron 表达式自动执行任务');
  console.log('   2. 重试机制: 失败任务自动重试（指数退避）');
  console.log('   3. 灵活管理: 启用/禁用/取消/更新任务');
  console.log('   4. 执行历史: 完整的执行记录和统计');
  console.log('   5. 可扩展: 轻松添加自定义任务类型');
  console.log('   6. 事件驱动: 所有操作都有对应事件');
}

main().catch(console.error);
