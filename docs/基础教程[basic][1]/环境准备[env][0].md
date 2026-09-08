# 环境准备

本页属于「基础教程」多级菜单的第一篇，演示文件夹 `基础教程[basic][1]` 如何自动生成二级菜单。

## 准备 PHP 环境

FastMD 的后端只需 PHP 8.0+，无需数据库。

### Windows

下载 [PHP Windows 二进制](https://windows.php.net/download/)，解压后将目录加入 `PATH` 即可。

### macOS

```bash
brew install php
```

### Linux

```bash
# Ubuntu / Debian
sudo apt install php

# CentOS / RHEL
sudo yum install php
```

## 验证安装

```bash
php -v
```

输出类似 `PHP 8.1.x (cli)` 即表示成功。

## 启动项目

进入项目根目录：

```bash
php -S localhost:8000
```

浏览器访问 `http://localhost:8000/`，应能看到文档站点。

> 你现在看到的左侧菜单「基础教程」就是一个文件夹，本篇是其中的第一篇文档。继续阅读 [撰写文档](#/basic/write)。
