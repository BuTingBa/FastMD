# 图表进阶

本页属于「进阶示例」多级菜单，演示更多 Mermaid 图表类型。

## 用户旅程图

```mermaid
journey
    title 用户购物流程
    section 浏览
      访问首页: 5: 用户
      搜索商品: 4: 用户
      查看详情: 5: 用户
    section 下单
      加入购物车: 5: 用户
      提交订单: 3: 用户
      完成支付: 4: 用户
    section 售后
      等待发货: 2: 用户
      确认收货: 5: 用户
```

## 时序图

```mermaid
sequenceDiagram
    participant U as 用户
    participant F as 前端
    participant S as 服务端
    U->>F: 点击页面
    F->>S: fetch 请求
    S-->>F: 返回数据
    F-->>U: 渲染展示
```

## 类图

```mermaid
classDiagram
    class Shape {
        +String color
        +double area()
        +double perimeter()
    }
    class Circle {
        +double radius
        +double area()
    }
    class Rectangle {
        +double width
        +double height
        +double area()
    }
    Shape <|-- Circle
    Shape <|-- Rectangle
```

## 多图表组合

同一篇文档中可放置多个图表，系统会依次渲染：

```mermaid
flowchart TD
    A[需求分析] --> B[方案设计]
    B --> C[开发实现]
    C --> D[测试验收]
    D --> E[上线发布]
```

```mermaid
pie title 团队人力分配
    "开发" : 50
    "测试" : 20
    "设计" : 15
    "运维" : 15
```

## 渲染失败的处理

如果图表语法有误，系统会保留原始代码块并标红提示，不会影响其它内容渲染。例如：

```mermaid
flowchart LR
    A[开始] ->> B[结束]
```

> 上述代码使用了错误的箭头语法（`->>` 应为 `-->`），渲染时会显示为带红色虚线边框的代码块，便于作者定位问题。

继续阅读 [公式进阶](#/advanced/formula)。
