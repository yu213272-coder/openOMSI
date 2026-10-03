# NC6857BEVGLS2_HZ 自动驾驶实验脚本

本目录交付的是 **OSC 车辆控制 + openOMSI 源码桥接的实验实现**，不是纯 OSC 即装即用的自动驾驶。没有编译或游戏实测，不应把它当作已验证的成品。原版 OMSI 2 不支持本目录的导航桥接；未安装引擎补丁时按钮拒绝开启。

## 文件

- `autopilot.osc`：OMSI RPN 语法，按钮、速度控制、进站制动、开门、等待、关门、出站状态机。
- `varlist.txt`：所有新增局部变量。
- `bus.osc.fragment.txt`：主脚本引用片段；本车辆实际主脚本叫 `Script System/main/main.osc`。
- `dashboard.fragment.cfg`：仪表盘模型的鼠标按钮绑定片段，按钮 trigger 已在 `autopilot.osc` 内实现。
- `openomsi-autopilot.patch`：给指定 openOMSI 源码版本的引擎补丁。
- `check.mjs`：局部 RPN 解释器，用于行为检查，不能替代真实 OSC VM 或游戏测试。

## 实现边界

buscube 是站点标记，不是一条可以连续追踪的道路。引擎补丁读取 openOMSI 导航器已经解析的时刻表道路路线，再把站点投影到这条路线。转向使用道路前视点和车辆转向曲率，OSC 根据目标速度控制油门、刹车。需要选择时刻表任务，并把车辆手动放到正确方向的路线车道上；没有路线时无法开启。

首版上限 25 km/h，出站阶段上限 10 km/h；到站以公交车原点到站点道路投影的距离制动。车门全部完全打开后开始计时，等待 10 秒后关门；确认四个门叶全部关闭，才释放站点制动并出站。终点保持开门停车，需人工接管，不自动换班次或掉头。

**没有交通灯识别、交通车辆/行人避让、超车、路口优先权和靠边入湾规划。** 只能在无其他交通的测试环境验证。道路中心线与站台相距过大时，车辆可能不满足乘客上车距离；OSC 不能修正地图站点和道路关系。

## 1. 编译引擎桥接

源码仓库：<https://github.com/openOMSI-Project/openOMSI>。

补丁固定基线：`1f648cd29c96d08cdc27aec4e609d9805be43611`。不要直接向其他版本应用后假设兼容。

在单独的 openOMSI 源码副本中执行，把占位路径替换成你的实际路径：

```sh
git checkout --detach 1f648cd29c96d08cdc27aec4e609d9805be43611
git apply --check "<车辆目录>/Script System/autopilot/openomsi-autopilot.patch"
git apply "<车辆目录>/Script System/autopilot/openomsi-autopilot.patch"
cargo check -p omsi-app
cargo build --release -p omsi-app --bin openomsi
```

使用仓库官方构建教程安装平台所需依赖：<https://github.com/openOMSI-Project/openOMSI/blob/main/docs/BUILDING.md>。官方打包脚本可代替最后的构建命令。用新编译的程序启动游戏；普通发布版不包含本补丁。

补丁修改三个文件：

- `navigator.rs`：只暴露完整、非临时、非回归路线的数据。
- `app_events.rs`：玩家 tick 前写入本帧导航输入；连接联机时立即令导航无效。
- `player.rs`：使用实际 `set_controls` 控制路径，覆盖自动状态下的玩家输入，保留人工刹车的优先权。

导航器的地图和路线更新发生在绘制阶段，因此启动后至少等路线显示一次再启用。地图未加载、路线不完整、路线任务不匹配、偏离道路超过 2 米、朝向误差超过 45 度或前视道路断裂时，桥接拒绝输出，已启用的自动驾驶制动并锁存故障。路线和站点索引变化、站点投影与实际停车位置，都需要地图实测。

## 2. 安装车辆脚本

先备份三个原文件：`NC6857BEVGLS2_HZ.bus`、`Script System/main/main.osc`、`model/HZ.cfg`。这里只提供安装片段，未自动改动原车文件。

保留本目录在车辆根目录下的 `Script System/autopilot/`。

编辑 `NC6857BEVGLS2_HZ.bus`，在现有 `[varnamelist]` 路径列表末尾增加：

```plaintext
Script System\autopilot\varlist.txt
```

现有路径数是 24，安装本模块后改成 25。不要用新列表替换原有列表。

在现有 `[script]` 路径列表末尾增加：

```plaintext
Script System\autopilot\autopilot.osc
```

现有脚本数是 31，安装本模块后改成 32。若原车已装其他模块，应按实际条目数调整。

编辑 `Script System/main/main.osc`：

```plaintext
{init}
    ' 保留原有初始化调用。
    (M.L.ap_init)
{end}

{frame}
    (M.L.ap_frame)
    (M.L.Engine_Frame)
    ' 保留原有其余 frame 调用。
{end}
```

上面仅展示插入位置。**不要新增第二个 `{init}` 或 `{frame}`，不要替换原有主体。** 不向 `{frame_ai}` 增加自动驾驶调用，也不写 `AI` 或 `AI_Scheduled_AtStation` 来尝试接管 AI。新增 OSC 是 ASCII；编辑原文件时保留原文件编码和换行，避免破坏现有非 ASCII 内容。

## 3. 仪表盘按钮

在 `model/HZ.cfg` 中找到你准备用于自动驾驶的按钮 `[mesh]` 段，在该段绑定：

```plaintext
[mouseevent]
ap_toggle
```

如果该段已有 `[mouseevent]`，需替换其 trigger；该按钮原有功能因此被替换。应选择专用按钮，不要覆盖车门、ABS、制动或其他驾驶必需按钮。

本目录提供按钮绑定和 OSC trigger，不包含新增的 `.o3d` 按钮网格或贴图。要增加独立按钮，需要在建模工具中制作网格、导出并定位后，再绑定上述 trigger。不得简单复制已有网格叠放在同一位置。

按钮状态变量：`ap_button` 是按下状态，`ap_enabled` 是自动驾驶开启状态，`ap_fault` 是故障状态。可将现有按钮的按压动画变量改成 `ap_button`，按原动画方式保留轴和角度；开启灯、故障灯应使用独立网格/材质，分别绑定对应变量。具体材质、坐标与角度由所选网格决定，不能套用另一按钮的坐标。

按钮事件 `ap_toggle`/`ap_toggle_off` 已包含在 `autopilot.osc`，不必再复制到驾驶台脚本。也可在 openOMSI 的控制绑定中为 `ap_toggle` 配置测试键。

## 4. 操作和调试

1. 用补丁版本 openOMSI 启动无交通测试地图，加载 `NC6857BEVGLS2_HZ`，选择对应 HOF 和时刻表任务。
2. 等道路导航路线加载，手动驶到路线正确方向的车道上并停稳。开启电源和发动机，挂前进挡；关闭所有车门，解除驻车及站点制动。
3. 松开油门、刹车和转向输入，点击绑定的自动驾驶按钮。启用条件不满足时保持关闭并置故障标志。
4. 观察低速直线、弯道、站点制动、全开门计时、关门等待与出站。确认停车距离和轮胎转向方向后再扩大测试范围。
5. 踩刹车会锁存故障并停止给油；点击按钮关闭自动驾驶后人工接管。关闭不会自动释放车门或站点制动，接管时应保持人工制动。故障消失不会自行恢复，需要停稳后重新启用。

状态码：`0` 关闭，`1` 行驶/进站，`2` 开门等待，`3` 关门，`4` 离站直到时刻表切换到下一站，`5` 终点保持停车。

输入变量由引擎写入：`ap_bridge_valid`、`ap_nav_steer`（-1 到 1，正值右转）、`ap_nav_speed`（km/h）、`ap_stop_distance`（m）、`ap_stop_id`、`ap_terminal`。输出变量由 OSC 写入：`ap_throttle`、`ap_brake`（0 到 1）、`ap_steer`（-1 到 1）。不能把这些变量误当作 OMSI 原生导航 API。

默认停站时间、速度和制动系数是实验初值，不是本车制动距离的实测标定。停站时间在 OSC 中为 10 秒，未等待时刻表计划发车时刻，也未检测乘客是否全部完成上下车。车门故障、乘客阻挡或气压不足会阻止正常出站，需要人工处理；不强制跳过车门状态。

## 联机局限

本补丁在任何 LAN 会话（主机和客户端）都将 `ap_bridge_valid` 清零：联机无法开启，单机自动驾驶期间加入联机则触发制动故障。

原因是本模块没有实现远端车辆控制授权、自动驾驶局部变量的协议同步、服务器侧导航或延迟补偿。它只控制本地玩家车辆，不会接管服务器 AI 或其他玩家。车辆位置/车门的既有网络同步不能证明本状态机同步可靠。后续放开联机必须明确车辆控制权，并对断线、重连、乘客状态和路线/时钟一致性进行实际验证；不能只删除联机判断。

## 验证与卸载

本目录 `node check.mjs` 已通过变量声明、门宏存在性、启用条件、到站、全开门后计时、关门等待、出站、终点保持以及故障锁存检查。这是简化解释器测试，不等于 openOMSI VM 验证。本次环境没有 Rust 工具链和游戏运行环境，因此 **引擎编译、游戏加载、道路跟踪、刹车标定和乘客上下车均未验证**。

在独立源码副本中执行 `git apply --check --reverse` 检查补丁能否卸载，再执行 `git apply --reverse`，均传入相同补丁路径。车辆部分恢复上述备份，或移除新增列表条目、修正计数、删除两个主脚本宏调用，并恢复按钮原绑定。

参考：

- OMSI 局部变量及 AI 到站协议：<https://wiki.omnibussimulator.de/omsiwikineu.de/index.php?title=System-_und_vordefinierte_lokalen_Variablen>。
- openOMSI 插件公开 API：<https://github.com/openOMSI-Project/openOMSI/blob/main/docs/PLUGINS.md>。
- 引擎实际导航与输入调用路径以本目录补丁固定的源码版本为准。
