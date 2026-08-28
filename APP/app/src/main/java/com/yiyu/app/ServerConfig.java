package com.yiyu.app;

public class ServerConfig {
    // 服务器地址 - 与Railway网站地址一致
    public static final String SERVER_URL = "https://yiyusk.top";

    public static String getApiUrl(String path) {
        if (!path.startsWith("/")) path = "/" + path;
        return SERVER_URL + "/api" + path;
    }

    public static String getWebUrl(String path) {
        if (!path.startsWith("/")) path = "/" + path;
        return SERVER_URL + path;
    }
}
