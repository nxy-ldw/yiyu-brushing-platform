package com.yiyu.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import org.json.JSONObject;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;
    private LinearLayout[] navItems;
    private PrefManager prefManager;
    private int currentTab = 0;

    // Bottom nav page mappings (SPA navigate function args)
    private static final String[] NAV_PAGES = {"home", "group-buy", "orders", "recharge", "recharge"};
    private static final String[] NAV_LABELS = {"首页", "拼团", "订单", "充值", "我的"};

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefManager = new PrefManager(this);

        webView = findViewById(R.id.webView);
        swipeRefresh = findViewById(R.id.swipeRefresh);

        // Initialize bottom navigation items
        navItems = new LinearLayout[5];
        navItems[0] = findViewById(R.id.navHome);
        navItems[1] = findViewById(R.id.navGroupBuy);
        navItems[2] = findViewById(R.id.navOrders);
        navItems[3] = findViewById(R.id.navRecharge);
        navItems[4] = findViewById(R.id.navProfile);

        for (int i = 0; i < navItems.length; i++) {
            final int index = i;
            navItems[i].setOnClickListener(v -> selectTab(index));
        }

        setupWebView();
        setupSwipeRefresh();

        // Load the server homepage
        loadPage("home");
        selectTab(0);
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
                String url = request.getUrl().toString();
                // Keep all URLs within the WebView
                if (url.startsWith(ServerConfig.SERVER_URL)) {
                    return false;
                }
                // External links open in browser
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                swipeRefresh.setRefreshing(false);

                // Inject card key into localStorage for API authentication
                String cardKey = prefManager.getCardKey();
                if (cardKey != null) {
                    String js = "try { localStorage.setItem('yy_app_card_key', '" + cardKey + "'); } catch(e) {}";
                    view.evaluateJavascript(js, null);
                }

                // Mark that we're in the app
                view.evaluateJavascript("try { localStorage.setItem('is_app', 'true'); } catch(e) {}", null);
            }
        });

        webView.setWebChromeClient(new WebChromeClient());
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
    }

    private void setupSwipeRefresh() {
        swipeRefresh.setOnRefreshListener(() -> webView.reload());
        swipeRefresh.setColorSchemeColors(0x667eea, 0x764ba2);
    }

    private void selectTab(int index) {
        currentTab = index;

        // Update nav item styles
        for (int i = 0; i < navItems.length; i++) {
            View item = navItems[i];
            TextView label = (TextView) item.getChildAt(1);
            if (label != null) {
                label.setTextColor(i == index ? 0xFF667eea : 0xFF999999);
            }
            // Update icon tint
            View icon = item.getChildAt(0);
            if (icon != null) {
                icon.setSelected(i == index);
            }
        }

        // Navigate to the corresponding page
        loadPage(NAV_PAGES[index]);
    }

    private void loadPage(String page) {
        String url = ServerConfig.getWebUrl("/");
        webView.loadUrl(url);

        // After page loads, call the SPA navigate function
        webView.postDelayed(() -> {
            String js = "if (typeof navigate === 'function') { navigate('" + page + "'); }";
            webView.evaluateJavascript(js, null);
        }, 1500);
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
        public void showToast(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
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
