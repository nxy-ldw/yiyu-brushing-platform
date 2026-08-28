package com.yiyu.app;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class ApiClient {

    public interface Callback {
        void onSuccess(JSONObject response);
        void onError(String message);
    }

    public static void post(String path, JSONObject body, final Callback callback) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL(ServerConfig.getApiUrl(path));
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setRequestProperty("Accept", "application/json");
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(15000);
                    conn.setDoOutput(true);

                    if (body != null) {
                        OutputStream os = conn.getOutputStream();
                        try {
                            byte[] input = body.toString().getBytes(StandardCharsets.UTF_8);
                            os.write(input);
                        } finally {
                            os.close();
                        }
                    }

                    int code = conn.getResponseCode();
                    BufferedReader reader;
                    if (code >= 200 && code < 300) {
                        reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                    } else {
                        java.io.InputStream errStream = conn.getErrorStream();
                        if (errStream != null) {
                            reader = new BufferedReader(new InputStreamReader(errStream, StandardCharsets.UTF_8));
                        } else {
                            reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                        }
                    }

                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                    reader.close();

                    JSONObject json = new JSONObject(sb.toString());
                    if (code >= 200 && code < 300) {
                        callback.onSuccess(json);
                    } else {
                        String error = json.optString("error", "请求失败 (" + code + ")");
                        callback.onError(error);
                    }
                } catch (Exception e) {
                    callback.onError("网络错误: " + e.getMessage());
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }
        }).start();
    }
}
