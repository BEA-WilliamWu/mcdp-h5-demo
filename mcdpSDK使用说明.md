# 接入文档

## Badges

[TNPM version][tnpm-url]
[TNPM downloads][tnpm-url]
![node >=10.0.0](https://hitu.alipay.com/badge/tnpm?title=node&value=%3E%3D10.0.0)
到海兔查看「@alipay-inc/mpaas-mcdp-h5-render 的 [包信息][tnpm-url]、[产物预览][tnpm-files-url]、[依赖信息][tnpm-deps-url]、[历史版本][tnpm-versions-url]」

---

## Package信息

包名：@alipay-inc/mpaas-mcdp-h5-render
类型：公共类库
适用场景：Web网页
功能简介：支持在h5进行弹屏、公告、轮播（banner）、浮标四种类型的展位投放，和个性化广告投放能力。

## 接入配置

mpaas-mcdp-h5-render提供两种接入方式：HTML文件内script标签引入及代码内npm包引用。

## HTML标签引入

在HTML文件内，进行以下操作

1. ``<head>``中添加以下代码进行引用

```
  <script type="text/javascript" src="https://unpkg.com/@alipay-inc/mpaas-mcdp-h5-render/dist/index.js"  />
```

2. ``<body>``末尾处，添加script标签，进行配置初始化，init参数[见下表](#init配置参数)

```
<script type="text/javascript">
    // init方法支持随时调用，每次调用都会使用当次传入的参数请求数据，更新广告数据
    McdpView.init({
        appId: 'my-appId',  //必填
        workspaceId: 'my-workspaceId', //必填
        reportURL: 'my-url', //必填
        uploadURL: 'my-url', //必填
        userId: 'userId', //非必填
        utdid: 'utdid' //非必填
    });
</script>
```

3. 在调用展位的dom元素上绑定类名及展位码，例如

```
<div class="mcdp-view-wrap" data-mcdp-code="my-code"></div>
```

## npm引入

1. 添加依赖

```
npm install @alipay-inc/mpaas-mcdp-h5-render
```

2. 在文件项目源码内，用npm的方式引入（以es6语法为例），init参数[见下表](#广告类型配置参数)

```
import McdpView from '@alipay-inc/mpaas-mcdp-h5-render';
// init方法支持随时调用，每次调用都会使用当次传入的参数请求数据，更新广告数据
McdpView.init({
    appId: 'my-appId',  //必填
    workspaceId: 'my-workspaceId', //必填
    reportURL: 'my-url', //必填
    uploadURL: 'my-url', //必填
    userId: 'userId', //非必填
    utdid: 'utdid' //非必填
});
```

3. 在调用展位的dom元素上绑定类名及展位码，例如

```
<div class="mcdp-view-wrap" data-mcdp-code="my-code"></div>
```

## init配置参数

| 属性名      | 类型   | 必填 | 默认值 | 说明                 | 备注             |
| ----------- | ------ | ---- | ------ | -------------------- | ---------------- |
| appId       | string | 是   | -      | 展位应用ID           | 获取展位信息必需 |
| workspaceId | string | 是   | -      | 展位工作控件ID       | 获取展位信息必需 |
| reportURL   | string | 是   | -      | 请求路径host         | 获取展位信息必需 |
| uploadURL   | string | 是   | -      | 埋点上报数据host     | 埋点上报数据必需 |
| userId      | string | 否   | -      | 用户自定义，不传为空 | 用以统计PV,UV    |
| utdid       | string | 否   | -      | 用户自定义，不传为空 | 用以统计PV,UV    |

### 使用 MGS JSSDK的配置参数

| 属性名           | 类型   | 必填 | 说明                                                | 备注                  |
| ---------------- | ------ | ---- | --------------------------------------------------- | --------------------- |
| extraHttpConfig  | Object | 否   | 额外的请求配置                                      | 详情见 MGS JSSDK 文档 |
| extraHeaderInfos | Object | 否   | 额外的请求头配置                                    | 详情见 MGS JSSDK 文档 |
| signType         | string | 否   | 加签方法 ，不传则不加签                             | 详情见 MGS JSSDK 文档 |
| secretKey        | string | 否   | 加签密钥，如果signType有值，则必填                  | 详情见 MGS JSSDK 文档 |
| encryptType      | number | 否   | 加密方法类型 ，不传则不加密，详情见上方加密原子能力 | 详情见 MGS JSSDK 文档 |
| publicKey        | string | 否   | 公钥，如果encryptType有值，则必填                   | 详情见 MGS JSSDK 文档 |

使用 MGS JSSDK，使用方法请参考对应文档，参考代码如下：

```javascript
import McdpView from '@alipay-inc/mpaas-mcdp-h5-render'

McdpView.init({
  appId: 'my-appId',  //必填
  workspaceId: 'my-workspaceId', //必填
  reportURL: 'my-url', //必填
  uploadURL: 'my-url', //必填
  userId: 'userId', //非必填
  utdid: 'utdid' //非必填
  signType: 'md5', //非必填，加签使用
  secretKey: 'xxxxxxx', //如果signType有值，则必填
  encryptType: 1, //非必填，加密使用
  publicKey: 'xxxxxxx' //如果encryptType有值，则必填
});
```

## 广告类型配置参数

<table>
	<tr>
	    <th>广告类型</th>
	    <th>属性名</th>
	    <th>类型</th>  
	    <th>必填</th>  
	    <th>默认值</th>  
	    <th>说明</th>  
	    <th>备注</th>  
	</tr >
	<tr >
	    <td rowspan="2">rotation (轮播) </td>
	    <td>class</td>
	    <td>string</td>
	    <td>是</td>
	    <td>mcdp-view-wrap</td>
	    <td>展位容器</td>
	    <td>显示展位信息必需</td>
	</tr>
	<tr>
	    <td>data-mcdp-code</td>
	    <td>string</td>
      <td>是</td>
	    <td>-</td>
	    <td>展位码应用ID</td>
	    <td>获取展位信息必需</td>
	</tr>
	<tr >
	    <td rowspan="2">buoy (浮标) </td>
	    <td>class</td>
	    <td>string</td>
	    <td>是</td>
	    <td>mcdp-view-wrap</td>
	    <td>展位容器</td>
	    <td>显示展位信息必需</td>
	</tr>
	<tr>
	    <td>data-mcdp-code</td>
	    <td>string</td>
      <td>是</td>
	    <td>-</td>
	    <td>展位码应用ID</td>
	    <td>获取展位信息必需</td>
	</tr>
	<tr >
	    <td rowspan="2">notice (公告) </td>
	    <td>class</td>
	    <td>string</td>
	    <td>是</td>
	    <td>mcdp-view-wrap</td>
	    <td>展位容器</td>
	    <td>显示展位信息必需</td>
	</tr>
	<tr>
	    <td>data-mcdp-code</td>
	    <td>string</td>
      <td>是</td>
	    <td>-</td>
	    <td>展位码应用ID</td>
	    <td>获取展位信息必需</td>
	</tr>
  <tr >
	    <td rowspan="2">banner (弹屏) </td>
	    <td>class</td>
	    <td>string</td>
	    <td>是</td>
	    <td>mcdp-view-wrap</td>
	    <td>展位容器</td>
	    <td>显示展位信息必需</td>
	</tr>
	<tr>
	    <td>data-mcdp-code</td>
	    <td>string</td>
      <td>是</td>
	    <td>-</td>
	    <td>展位码应用ID</td>
	    <td>获取展位信息必需</td>
	</tr>

[tnpm-image]: https://hitutwa.antgroup-inc.cn/badge/v/@alipay-inc/mpaas-mcdp-h5-render
[tnpm-downloads-image]: https://hitutwa.antgroup-inc.cn/badge/tnpm?package=@alipay-inc/mpaas-mcdp-h5-render
[tnpm-url]: https://hitu.antgroup-inc.cn/package/@alipay-inc/mpaas-mcdp-h5-render
[tnpm-files-url]: https://hitu.antgroup-inc.cn/package/@alipay-inc/mpaas-mcdp-h5-render/files
[tnpm-deps-url]: https://hitu.antgroup-inc.cn/package/@alipay-inc/mpaas-mcdp-h5-render/deps
[tnpm-versions-url]: https://hitu.antgroup-inc.cn/package/@alipay-inc/mpaas-mcdp-h5-render/versions