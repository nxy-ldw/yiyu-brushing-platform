package com.yiyu.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

public class MainActivity extends Activity {

    private WebView webView;
    private LinearLayout[] navItems;
    private PrefManager prefManager;
    private int currentTab = 0;
    private boolean pageLoaded = false;

    private static final String[] NAV_PAGES = {"home", "group-buy", "orders", "recharge", "recharge"};
    private static final String[] NAV_LABELS = {"首页", "拼团", "订单", "充值", "我的"};

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefManager = new PrefManager(this);

        webView = findViewById(R.id.webView);

        navItems = new LinearLayout[5];
        navItems[0] = findViewById(R.id.navHome);
        navItems[1] = findViewById(R.id.navGroupBuy);
        navItems[2] = findViewById(R.id.navOrders);
        navItems[3] = findViewById(R.id.navRecharge);
        navItems[4] = findViewById(R.id.navProfile);

        for (int i = 0; i < navItems.length; i++) {
            final int index = i;
            navItems[i].setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    selectTab(index);
                }
            });
        }

        setupWebView();
        loadMainPage();
        selectTab(0);
    }

    private void loadMainPage() {
        String url = ServerConfig.getWebUrl("/");
        webView.loadUrl(url);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.addJavascriptInterface(new WebAppInterface(), "Android");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                pageLoaded = true;

                // 注入APP标识
                view.evaluateJavascript("try { localStorage.setItem('is_app', 'true'); document.body.classList.add('is-app'); } catch(e) {}", null);

                // 注入卡密
                String cardKey = prefManager.getCardKey();
                if (cardKey != null) {
                    String js = "try { localStorage.setItem('yy_app_card_key', '" + cardKey + "'); } catch(e) {}";
                    view.evaluateJavascript(js, null);
                }

                // 导航到当前选中的tab
                navigateToTab(currentTab);
            }
        });

        webView.setWebChromeClient(new WebChromeClient());
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
    }

    private void selectTab(int index) {
        currentTab = index;

        for (int i = 0; i < navItems.length; i++) {
            ViewGroup item = navItems[i];
            TextView label = (TextView) item.getChildAt(1);
            if (label != null) {
                label.setTextColor(i == index ? 0xFF667eea : 0xFF999999);
            }
            View icon = item.getChildAt(0);
            if (icon != null) {
                icon.setSelected(i == index);
            }
        }

        // 如果页面已加载，直接导航，不重新加载页面
        if (pageLoaded) {
            navigateToTab(index);
        }
    }

    private void navigateToTab(int index) {
        String js = "if (typeof navigate === 'function') { navigate('" + NAV_PAGES[index] + "'); }";
        webView.evaluateJavascript(js, null);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    public class WebAppInterface {
        @JavascriptInterface
        public String getCardKey() {
            return prefManager.getCardKey();
        }

        @JavascriptInterface
        public void showToast(final String message) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void logoutCardKey() {
            prefManager.clearCardKey();
            Intent intent = new Intent(MainActivity.this, CardKeyActivity.class);
            startActivity(intent);
            finish();
        }
    }
}
